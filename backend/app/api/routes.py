"""
TraceForge - API Routes

Endpoints:
  POST /api/ingest                         Receive captured request from extension
  GET  /api/requests                       List / filter request history
  GET  /api/requests/{id}                  Single request detail
  DELETE /api/requests                     Clear all requests
  POST /api/replay                         Replay any request
  POST /api/requests/{id}/codegen          Generate code for a request
  GET  /api/requests/{id}/audit            Get Sentinel findings for one request
  GET  /api/audit/summary                  Global Sentinel stats dashboard
  GET  /api/mock-rules                     List mock rules
  POST /api/mock-rules                     Create a mock rule
  PATCH /api/mock-rules/{id}               Update a mock rule
  DELETE /api/mock-rules/{id}              Delete a mock rule
  GET  /api/stats                          Dashboard counts
"""

import json
import logging
from collections import defaultdict
from datetime import datetime, UTC, timedelta
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlmodel import Session, select, func, desc

from app.db.database import get_session
from app.db.models import CapturedRequest, AuditFinding, MockRule
from app.api.schemas import (
    IngestRequestSchema,
    CapturedRequestRead,
    ReplayRequestSchema,
    ReplayResponseSchema,
    MockRuleCreate,
    MockRuleRead,
    CodeGenResponseSchema,
    AuditFindingRead,
    AuditSummaryRead,
    GlobalAuditStats,
)
from app.core.redactor import redact_request
from app.core.codegen import generate_all
from app.core.config import settings
from app.core.sentinel import run_audit, audit_summary
from app.services.replay import replay_request
from app.services.ws_manager import manager

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _run_sentinel_and_save(
    session: Session,
    captured: CapturedRequest,
    tab_id: Optional[int],
) -> list[dict]:
    """
    Run Sentinel audit on a captured request, persist AuditFinding rows,
    and update the denormalised counts on the parent CapturedRequest row.
    Returns list of findings.
    """
    try:
        recent: list[dict] = []
        if tab_id is not None:
            cutoff = datetime.now(UTC) - timedelta(seconds=30)
            rows = session.exec(
                select(CapturedRequest)
                .where(CapturedRequest.tab_id == tab_id)
                .where(CapturedRequest.timestamp >= cutoff)
                .order_by(desc(CapturedRequest.timestamp))
                .limit(30)
            ).all()
            recent = [{"method": r.method, "url": r.url} for r in rows]

        findings = run_audit(
            url=captured.url,
            method=captured.method,
            request_headers_json=captured.request_headers,
            request_body=captured.request_body,
            response_headers_json=captured.response_headers,
            response_body=captured.response_body,
            status_code=captured.status_code,
            duration_ms=captured.duration_ms,
            recent_requests=recent,
        )

        summary = audit_summary(findings)

        # Persist each finding
        for f in findings:
            af = AuditFinding(
                captured_request_id=captured.id,
                rule_id=f["id"],
                category=f["category"],
                severity=f["severity"],
                title=f["title"],
                description=f["description"],
                evidence=f.get("evidence"),
                remediation=f.get("remediation"),
            )
            session.add(af)

        # Update denormalised summary on the parent row
        captured.audit_high   = summary["high"]
        captured.audit_medium = summary["medium"]
        captured.audit_low    = summary["low"]
        captured.audit_grade  = summary["grade"]
        session.add(captured)
        session.commit()

        if summary["total"] > 0:
            logger.info(
                "Sentinel: request %s -> %d findings (H=%d M=%d L=%d grade=%s)",
                captured.request_id,
                summary["total"],
                summary["high"],
                summary["medium"],
                summary["low"],
                summary["grade"],
            )

        return findings
    except Exception as exc:
        logger.warning("Sentinel audit failed for request %s: %s", getattr(captured, 'id', '?'), exc)
        return []



# ── Ingest ────────────────────────────────────────────────────────────────────

@router.post("/ingest", status_code=201)
async def ingest_request(
    payload: IngestRequestSchema,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """
    Receive a captured request from the Chrome extension.
    1. Redact secrets
    2. Store in SQLite
    3. Broadcast to Studio via WebSocket
    4. Run Sentinel audit in the background
    """
    redacted = redact_request(
        request_headers=payload.request_headers,
        request_body=payload.request_body,
        response_headers=payload.response_headers,
        response_body=payload.response_body,
    )

    parsed = urlparse(payload.url)
    domain = parsed.netloc or payload.domain
    path   = parsed.path or payload.path

    # Safe type coercions
    status_code = None
    if payload.status_code is not None:
        try:
            status_code = int(payload.status_code)
        except (ValueError, TypeError):
            pass

    duration_ms = None
    if payload.duration_ms is not None:
        try:
            duration_ms = float(payload.duration_ms)
        except (ValueError, TypeError):
            pass

    ts = datetime.now(UTC)
    if payload.timestamp:
        if isinstance(payload.timestamp, datetime):
            ts = payload.timestamp
        elif isinstance(payload.timestamp, str):
            try:
                ts = datetime.fromisoformat(payload.timestamp.replace("Z", "+00:00"))
            except Exception:
                pass

    query_params_str = None
    if payload.query_params:
        if isinstance(payload.query_params, str):
            query_params_str = payload.query_params
        else:
            try:
                query_params_str = json.dumps(payload.query_params)
            except Exception:
                query_params_str = str(payload.query_params)

    has_error = status_code in settings.ERROR_STATUS_CODES if status_code else False
    is_slow   = (duration_ms or 0) >= settings.SLOW_REQUEST_THRESHOLD_MS

    captured = CapturedRequest(
        request_id=payload.request_id,
        tab_id=payload.tab_id,
        tab_url=payload.tab_url,
        tab_title=payload.tab_title,
        method=payload.method.upper(),
        url=payload.url,
        domain=domain,
        path=path,
        query_params=query_params_str,
        request_headers=json.dumps(redacted["request_headers"]) if redacted["request_headers"] else None,
        request_body=redacted["request_body"],
        resource_type=payload.resource_type,
        status_code=status_code,
        status_text=payload.status_text,
        response_headers=json.dumps(redacted["response_headers"]) if redacted["response_headers"] else None,
        response_body=redacted["response_body"],
        duration_ms=duration_ms,
        request_size=payload.request_size,
        response_size=payload.response_size,
        timestamp=ts,
        action_label=payload.action_label,
        action_batch_id=payload.action_batch_id,
        has_error=has_error,
        is_slow=is_slow,
        was_redacted=redacted["was_redacted"],
    )

    session.add(captured)
    session.commit()
    session.refresh(captured)

    # Run Sentinel immediately so findings and grade are instantly available & broadcasted
    findings = _run_sentinel_and_save(session, captured, payload.tab_id)
    session.refresh(captured)

    logger.info("Ingested: %s %s -> %s (Grade %s)", captured.method, captured.url, status_code, captured.audit_grade)

    # Broadcast to Studio clients via WebSocket
    await manager.broadcast_to_studio({
        "type": "NEW_REQUEST",
        "data": {
            "id":           captured.id,
            "request_id":   captured.request_id,
            "method":       captured.method,
            "url":          captured.url,
            "domain":       captured.domain,
            "path":         captured.path,
            "status_code":  captured.status_code,
            "duration_ms":  captured.duration_ms,
            "has_error":    captured.has_error,
            "is_slow":      captured.is_slow,
            "was_redacted": captured.was_redacted,
            "timestamp":    captured.timestamp.isoformat(),
            "tab_id":       captured.tab_id,
            "tab_title":    captured.tab_title,
            "resource_type": captured.resource_type,
            "audit_grade":  captured.audit_grade,
            "audit_high":   captured.audit_high,
            "audit_medium": captured.audit_medium,
            "audit_low":    captured.audit_low,
        },
    })

    # Broadcast Sentinel Alert for any HIGH or MEDIUM security findings
    for f in findings:
        if f.get("severity") in ("HIGH", "MEDIUM"):
            await manager.broadcast_sentinel_alert(f, {
                "id": captured.id,
                "method": captured.method,
                "url": captured.url,
                "domain": captured.domain,
            })

    return {"id": captured.id, "request_id": captured.request_id}



# ── Request List ──────────────────────────────────────────────────────────────

@router.get("/requests", response_model=list[CapturedRequestRead])
def list_requests(
    limit:        int  = Query(default=200, le=1000),
    offset:       int  = Query(default=0, ge=0),
    method:       Optional[str]  = None,
    domain:       Optional[str]  = None,
    tab_id:       Optional[int]  = None,
    has_error:    Optional[bool] = None,
    is_slow:      Optional[bool] = None,
    search:       Optional[str]  = None,
    status_class: Optional[str]  = None,
    has_audit:    Optional[bool] = None,   # NEW: filter requests with any findings
    min_severity: Optional[str]  = None,   # NEW: HIGH | MEDIUM | LOW
    session: Session = Depends(get_session),
):
    stmt = select(CapturedRequest).order_by(desc(CapturedRequest.timestamp))

    if method:
        stmt = stmt.where(CapturedRequest.method == method.upper())
    if domain:
        stmt = stmt.where(CapturedRequest.domain.contains(domain))
    if tab_id is not None:
        stmt = stmt.where(CapturedRequest.tab_id == tab_id)
    if has_error is not None:
        stmt = stmt.where(CapturedRequest.has_error == has_error)
    if is_slow is not None:
        stmt = stmt.where(CapturedRequest.is_slow == is_slow)
    if search:
        stmt = stmt.where(CapturedRequest.url.contains(search))
    if status_class:
        prefix = int(status_class[0])
        stmt = stmt.where(
            CapturedRequest.status_code >= prefix * 100,
            CapturedRequest.status_code < (prefix + 1) * 100,
        )
    if has_audit is True:
        stmt = stmt.where(
            (CapturedRequest.audit_high > 0) |
            (CapturedRequest.audit_medium > 0) |
            (CapturedRequest.audit_low > 0)
        )
    if min_severity == "HIGH":
        stmt = stmt.where(CapturedRequest.audit_high > 0)
    elif min_severity == "MEDIUM":
        stmt = stmt.where(
            (CapturedRequest.audit_high > 0) | (CapturedRequest.audit_medium > 0)
        )

    return session.exec(stmt.offset(offset).limit(limit)).all()


# ── Single Request ────────────────────────────────────────────────────────────

@router.get("/requests/{request_id}", response_model=CapturedRequestRead)
def get_request(request_id: int, session: Session = Depends(get_session)):
    req = session.get(CapturedRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return req


# ── Clear History ─────────────────────────────────────────────────────────────

@router.delete("/requests")
def clear_requests(session: Session = Depends(get_session)):
    count = session.exec(select(func.count(CapturedRequest.id))).one()
    # Also clear audit findings
    for af in session.exec(select(AuditFinding)).all():
        session.delete(af)
    for req in session.exec(select(CapturedRequest)).all():
        session.delete(req)
    session.commit()
    return {"deleted": count}


# ── Sentinel: Per-Request Audit ───────────────────────────────────────────────

@router.get("/requests/{request_id}/audit", response_model=AuditSummaryRead)
def get_request_audit(request_id: int, session: Session = Depends(get_session)):
    """
    Return all Sentinel findings for a specific captured request,
    along with an aggregate severity summary.
    """
    req = session.get(CapturedRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    findings = session.exec(
        select(AuditFinding)
        .where(AuditFinding.captured_request_id == request_id)
        .order_by(AuditFinding.severity)
    ).all()

    summary = {
        "total":  len(findings),
        "high":   sum(1 for f in findings if f.severity == "HIGH"),
        "medium": sum(1 for f in findings if f.severity == "MEDIUM"),
        "low":    sum(1 for f in findings if f.severity == "LOW"),
        "info":   sum(1 for f in findings if f.severity == "INFO"),
        "score":  req.audit_high * 10 + req.audit_medium * 4 + req.audit_low,
        "grade":  req.audit_grade or "A",
        "findings": findings,
    }
    return summary


# ── Sentinel: Re-run Audit on Demand ─────────────────────────────────────────

@router.post("/requests/{request_id}/audit/rerun", response_model=AuditSummaryRead)
def rerun_audit(request_id: int, session: Session = Depends(get_session)):
    """
    Re-run the Sentinel engine on an existing captured request
    (useful after rule updates or to refresh findings).
    """
    req = session.get(CapturedRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Delete existing findings for this request
    for af in session.exec(
        select(AuditFinding).where(AuditFinding.captured_request_id == request_id)
    ).all():
        session.delete(af)
    session.commit()

    _run_sentinel_and_save(session, req, req.tab_id)
    session.refresh(req)

    findings = session.exec(
        select(AuditFinding)
        .where(AuditFinding.captured_request_id == request_id)
        .order_by(AuditFinding.severity)
    ).all()

    return {
        "total":  len(findings),
        "high":   req.audit_high,
        "medium": req.audit_medium,
        "low":    req.audit_low,
        "info":   0,
        "score":  req.audit_high * 10 + req.audit_medium * 4 + req.audit_low,
        "grade":  req.audit_grade or "A",
        "findings": findings,
    }


# ── Sentinel: Global Stats ────────────────────────────────────────────────────

@router.get("/audit/summary", response_model=GlobalAuditStats)
def get_global_audit_summary(session: Session = Depends(get_session)):
    """
    Return system-wide Sentinel statistics for the Security Dashboard tab.
    """
    all_findings = session.exec(select(AuditFinding)).all()
    scanned_count = session.exec(select(func.count(CapturedRequest.id))).one() or 0

    total    = len(all_findings)
    high     = sum(1 for f in all_findings if f.severity == "HIGH")
    medium   = sum(1 for f in all_findings if f.severity == "MEDIUM")
    low      = sum(1 for f in all_findings if f.severity == "LOW")

    affected = session.exec(
        select(func.count(func.distinct(AuditFinding.captured_request_id)))
    ).one() or 0

    rule_counts: dict[str, dict] = defaultdict(lambda: {"count": 0, "severity": "", "title": ""})
    by_category: dict[str, int] = defaultdict(int)
    for f in all_findings:
        rule_counts[f.rule_id]["count"] += 1
        rule_counts[f.rule_id]["severity"] = f.severity
        rule_counts[f.rule_id]["title"]    = f.title
        by_category[f.category] += 1

    top_rules = sorted(
        [{"rule_id": k, **v} for k, v in rule_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    score = high * 10 + medium * 4 + low
    if high > 3 or score >= 40:
        grade = "F"
    elif high > 0 or score >= 20:
        grade = "D"
    elif medium > 2 or score >= 10:
        grade = "C"
    elif medium > 0 or low > 2:
        grade = "B"
    else:
        grade = "A"

    return {
        "total_findings":    total,
        "high_findings":     high,
        "medium_findings":   medium,
        "low_findings":      low,
        "high":              high,
        "medium":            medium,
        "low":               low,
        "affected_requests": affected,
        "scanned_requests":  scanned_count,
        "total_score":       score,
        "posture_grade":     grade,
        "top_rules":         top_rules,
        "by_category":       dict(by_category),
        "category_counts":   dict(by_category),
    }



# ── Sentinel: Findings Feed (recent, filterable) ──────────────────────────────

@router.get("/audit/findings", response_model=list[AuditFindingRead])
def list_audit_findings(
    severity: Optional[str] = None,
    category: Optional[str] = None,
    rule_id:  Optional[str] = None,
    limit:    int = Query(default=100, le=500),
    session: Session = Depends(get_session),
):
    """Return a filterable feed of all Sentinel findings across all requests."""
    stmt = select(AuditFinding).order_by(desc(AuditFinding.created_at))
    if severity:
        stmt = stmt.where(AuditFinding.severity == severity.upper())
    if category:
        stmt = stmt.where(AuditFinding.category == category.upper())
    if rule_id:
        stmt = stmt.where(AuditFinding.rule_id == rule_id.upper())
    return session.exec(stmt.limit(limit)).all()


# ── Replay ────────────────────────────────────────────────────────────────────

@router.post("/replay", response_model=ReplayResponseSchema)
async def replay(payload: ReplayRequestSchema):
    result = await replay_request(
        method=payload.method,
        url=payload.url,
        headers=payload.headers,
        body=payload.body,
        timeout=payload.timeout,
    )
    return result


# ── Code Generation ───────────────────────────────────────────────────────────

@router.post("/requests/{request_id}/codegen", response_model=CodeGenResponseSchema)
def codegen(request_id: int, session: Session = Depends(get_session)):
    req = session.get(CapturedRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    snippets = generate_all(
        method=req.method,
        url=req.url,
        headers_json=req.request_headers,
        body=req.request_body,
    )
    return snippets


# ── Mock Rules ────────────────────────────────────────────────────────────────

@router.get("/mock-rules", response_model=list[MockRuleRead])
def list_mock_rules(session: Session = Depends(get_session)):
    return session.exec(select(MockRule)).all()


@router.post("/mock-rules", response_model=MockRuleRead, status_code=201)
async def create_mock_rule(payload: MockRuleCreate, session: Session = Depends(get_session)):
    rule = MockRule(
        **payload.model_dump(exclude={"override_headers"}),
        override_headers=json.dumps(payload.override_headers) if payload.override_headers else None,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    await _broadcast_mock_rules(session)
    return rule


@router.patch("/mock-rules/{rule_id}", response_model=MockRuleRead)
async def update_mock_rule(rule_id: int, payload: MockRuleCreate, session: Session = Depends(get_session)):
    rule = session.get(MockRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Mock rule not found")
    for key, value in payload.model_dump(exclude={"override_headers"}).items():
        setattr(rule, key, value)
    rule.override_headers = json.dumps(payload.override_headers) if payload.override_headers else None
    rule.updated_at = datetime.now(UTC)
    session.commit()
    session.refresh(rule)
    await _broadcast_mock_rules(session)
    return rule


@router.delete("/mock-rules/{rule_id}")
async def delete_mock_rule(rule_id: int, session: Session = Depends(get_session)):
    rule = session.get(MockRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Mock rule not found")
    session.delete(rule)
    session.commit()
    await _broadcast_mock_rules(session)
    return {"deleted": rule_id}


async def _broadcast_mock_rules(session: Session):
    rules = session.exec(select(MockRule).where(MockRule.is_active == True)).all()
    serialized = [
        {
            "id":                  r.id,
            "match_method":        r.match_method,
            "match_url_pattern":   r.match_url_pattern,
            "match_url_is_regex":  r.match_url_is_regex,
            "override_status_code": r.override_status_code,
            "override_status_text": r.override_status_text,
            "override_body":       r.override_body,
            "simulated_delay_ms":  r.simulated_delay_ms,
        }
        for r in rules
    ]
    await manager.broadcast_mock_rules(serialized)


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats(session: Session = Depends(get_session)):
    """Return summary counts for the dashboard."""
    total  = session.exec(select(func.count(CapturedRequest.id))).one()
    errors = session.exec(
        select(func.count(CapturedRequest.id)).where(CapturedRequest.has_error == True)
    ).one()
    slow = session.exec(
        select(func.count(CapturedRequest.id)).where(CapturedRequest.is_slow == True)
    ).one()

    # Sentinel counts
    audit_total = session.exec(select(func.count(AuditFinding.id))).one()
    audit_high  = session.exec(
        select(func.count(AuditFinding.id)).where(AuditFinding.severity == "HIGH")
    ).one()

    tabs_raw = session.exec(
        select(
            CapturedRequest.tab_id,
            CapturedRequest.tab_title,
            CapturedRequest.tab_url,
            func.count(CapturedRequest.id),
        ).group_by(CapturedRequest.tab_id)
    ).all()

    tabs = [
        {"tab_id": row[0], "tab_title": row[1], "tab_url": row[2], "count": row[3]}
        for row in tabs_raw
    ]

    return {
        "total_requests":    total,
        "error_requests":    errors,
        "slow_requests":     slow,
        "audit_findings":    audit_total,
        "audit_high":        audit_high,
        "studio_clients":    manager.studio_count,
        "extension_clients": manager.extension_count,
        "tabs":              tabs,
    }
