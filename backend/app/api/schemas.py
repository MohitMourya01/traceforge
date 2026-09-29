"""
TraceForge - Pydantic Schemas for API I/O
"""

from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field, ConfigDict


# ── Ingest (from Extension) ───────────────────────────────────────────────────

class IngestRequestSchema(BaseModel):
    """Payload sent by the Chrome extension to capture a new request."""

    request_id: str
    tab_id: Optional[int] = None
    tab_url: Optional[str] = None
    tab_title: Optional[str] = None

    method: str
    url: str
    domain: Optional[str] = None
    path: Optional[str] = None
    query_params: Optional[Any] = None
    request_headers: Optional[dict[str, Any]] = None
    request_body: Optional[Any] = None
    resource_type: Optional[str] = None

    status_code: Optional[Any] = None
    status_text: Optional[str] = None
    response_headers: Optional[dict[str, Any]] = None
    response_body: Optional[Any] = None

    duration_ms: Optional[float] = None
    request_size: Optional[int] = None
    response_size: Optional[int] = None

    timestamp: Optional[Any] = None
    action_label: Optional[str] = None
    action_batch_id: Optional[str] = None


# ── Audit Schemas ─────────────────────────────────────────────────────────────

class AuditFindingRead(BaseModel):
    """Single Sentinel finding returned from the API."""

    id: int
    captured_request_id: int
    rule_id: str
    category: str
    severity: str
    title: str
    description: str
    evidence: Optional[str] = None
    remediation: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditSummaryRead(BaseModel):
    """Aggregate summary of findings for one request."""

    total: int
    high: int
    medium: int
    low: int
    info: int
    score: int
    grade: str
    findings: list[AuditFindingRead]


class GlobalAuditStats(BaseModel):
    """System-wide sentinel stats for the dashboard."""

    total_findings: int = 0
    high_findings: int = 0
    medium_findings: int = 0
    low_findings: int = 0
    affected_requests: int = 0
    scanned_requests: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    total_score: int = 0
    posture_grade: str = "A"
    top_rules: list[dict] = []
    by_category: dict[str, int] = {}
    category_counts: dict[str, int] = {}


# ── Request Read ──────────────────────────────────────────────────────────────

class CapturedRequestRead(BaseModel):
    """Serialized captured request returned from the API."""

    id: int
    request_id: str
    tab_id: Optional[int] = None
    tab_url: Optional[str] = None
    tab_title: Optional[str] = None

    method: str
    url: str
    domain: Optional[str] = None
    path: Optional[str] = None
    query_params: Optional[str] = None
    request_headers: Optional[str] = None
    request_body: Optional[str] = None
    resource_type: Optional[str] = None

    status_code: Optional[int] = None
    status_text: Optional[str] = None
    response_headers: Optional[str] = None
    response_body: Optional[str] = None

    duration_ms: Optional[float] = None
    request_size: Optional[int] = None
    response_size: Optional[int] = None

    timestamp: datetime
    action_label: Optional[str] = None
    action_batch_id: Optional[str] = None
    has_error: bool
    is_slow: bool
    was_redacted: bool

    # Sentinel summary columns
    audit_high:   int = 0
    audit_medium: int = 0
    audit_low:    int = 0
    audit_grade:  Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Replay ────────────────────────────────────────────────────────────────────

class ReplayRequestSchema(BaseModel):
    method: str
    url: str
    headers: Optional[dict[str, str]] = None
    body: Optional[str] = None
    timeout: float = Field(default=30.0, ge=1.0, le=120.0)


class ReplayResponseSchema(BaseModel):
    success: bool
    status_code: Optional[int] = None
    status_text: Optional[str] = None
    response_headers: Optional[dict[str, str]] = None
    response_body: Optional[str] = None
    duration_ms: float
    response_size: int
    error: Optional[str] = None


# ── Mock Rules ────────────────────────────────────────────────────────────────

class MockRuleCreate(BaseModel):
    name: str
    is_active: bool = True
    match_method: Optional[str] = None
    match_url_pattern: str
    match_url_is_regex: bool = False
    override_status_code: int = 200
    override_status_text: Optional[str] = "OK"
    override_headers: Optional[dict[str, str]] = None
    override_body: Optional[str] = None
    simulated_delay_ms: int = 0


class MockRuleRead(MockRuleCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Code Generation ───────────────────────────────────────────────────────────

class CodeGenResponseSchema(BaseModel):
    curl: str
    python_httpx: str
    python_requests: str
    js_fetch: str
    js_axios: str
