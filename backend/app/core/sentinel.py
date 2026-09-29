"""
TraceForge - Sentinel Audit Engine
====================================
Runs automatically on every captured request and produces a structured
list of security and performance findings.

Audit categories
----------------
PERF   - Performance / duplicate / loop detection
AUTH   - Authentication and token vulnerabilities
LEAK   - Information disclosure / data exposure
INJECT - Injection attack pattern detection (SQLi / XSS)
NET    - Network and transport security (CORS, HSTS, Mixed Content)

Each finding is a dict:
{
    "id":          str,   # unique rule ID  e.g. "AUTH-001"
    "category":    str,   # PERF | AUTH | LEAK | INJECT | NET
    "severity":    str,   # HIGH | MEDIUM | LOW | INFO
    "title":       str,
    "description": str,
    "evidence":    str,
    "remediation": str,
}
"""

from __future__ import annotations

import json
import re
import math
import base64
from typing import Any, Optional
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta, timezone


HIGH   = "HIGH"
MEDIUM = "MEDIUM"
LOW    = "LOW"
INFO   = "INFO"


def _safe_json(text):
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _header_dict(headers_json):
    parsed = _safe_json(headers_json)
    if isinstance(parsed, dict):
        return {k.lower(): str(v) for k, v in parsed.items()}
    return {}


def _body_dict(body):
    return _safe_json(body)


def _decode_jwt_payload(token):
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception:
        return None


def _decode_jwt_header(token):
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64 = parts[0] + "=" * (-len(parts[0]) % 4)
        return json.loads(base64.urlsafe_b64decode(header_b64))
    except Exception:
        return None


_SECRET_PREFIXES = [
    ("sk_live_",   "Stripe Live Secret Key"),
    ("sk_test_",   "Stripe Test Secret Key"),
    ("AKIA",       "AWS Access Key ID"),
    ("AIza",       "Google API Key"),
    ("ghp_",       "GitHub Personal Access Token"),
    ("gho_",       "GitHub OAuth Token"),
    ("xoxb-",      "Slack Bot Token"),
    ("SG.",        "SendGrid API Key"),
    ("rk_live_",   "Stripe Restricted Live Key"),
]

_SENSITIVE_RESPONSE_KEYS = {
    "password", "password_hash", "passwd", "secret", "salt", "private_key",
    "ssn", "social_security", "credit_card", "card_number", "cvv",
    "is_superuser", "is_admin", "deleted_at", "internal_id",
    "stripe_customer_secret", "client_secret",
}

_SERVER_HEADER_KEYS = {"server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version"}

_SECURITY_HEADERS = {
    "content-security-policy":   "Content-Security-Policy (CSP)",
    "strict-transport-security": "Strict-Transport-Security (HSTS)",
    "x-frame-options":           "X-Frame-Options",
    "x-content-type-options":    "X-Content-Type-Options",
    "referrer-policy":           "Referrer-Policy",
    "permissions-policy":        "Permissions-Policy",
}

_SQLI = re.compile(
    r"(\bUNION\b.{0,20}\bSELECT\b|'\s*OR\s*'1'\s*=\s*'1|--\s*$|"
    r"/\*.*\*/|;\s*DROP\b|xp_cmdshell|EXEC\s*\()",
    re.IGNORECASE,
)
_PATH_TRAVERSAL = re.compile(
    r"(\.\./|\.\.\\|/etc/passwd|/etc/shadow|/windows/win\.ini|boot\.ini)",
    re.IGNORECASE,
)

_XSS = re.compile(
    r"(<\s*script|javascript\s*:|on\w+\s*=\s*['\"]|"
    r"<\s*img[^>]+onerror|<\s*iframe|eval\s*\(|document\.cookie)",
    re.IGNORECASE,
)
_STACK_TRACE = re.compile(
    r"(Traceback \(most recent call last\)|at [\w\.]+\([\w/]+\.(?:java|py|cs|js|ts):\d+\)|"
    r"System\.Exception|NullPointerException|SQLException:|"
    r"File \".*\", line \d+|undefined method|NoMethodError)",
)


def _find_sensitive_keys(d, prefix=""):
    found = []
    if isinstance(d, dict):
        for k, v in d.items():
            full_key = f"{prefix}.{k}" if prefix else k
            if k.lower() in _SENSITIVE_RESPONSE_KEYS:
                found.append(full_key)
            if isinstance(v, (dict, list)):
                found.extend(_find_sensitive_keys(v, full_key))
    elif isinstance(d, list):
        for i, item in enumerate(d):
            found.extend(_find_sensitive_keys(item, f"{prefix}[{i}]"))
    return found


def run_audit(
    *,
    url,
    method,
    request_headers_json=None,
    request_body=None,
    response_headers_json=None,
    response_body=None,
    status_code=None,
    duration_ms=None,
    recent_requests=None,
):
    findings = []

    req_headers  = _header_dict(request_headers_json)
    resp_headers = _header_dict(response_headers_json)
    resp_body_dict = _body_dict(response_body)
    parsed_url = urlparse(url or "")
    query_params = parse_qs(parsed_url.query)

    # -- AUTH ------------------------------------------------------------------

    auth_header = req_headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        jwt_header  = _decode_jwt_header(token)
        jwt_payload = _decode_jwt_payload(token)

        if jwt_header:
            alg = jwt_header.get("alg", "").lower()
            if alg in ("none", ""):
                findings.append({
                    "id": "AUTH-001",
                    "category": "AUTH",
                    "severity": HIGH,
                    "title": "JWT uses insecure algorithm (alg: none)",
                    "description": "The Authorization JWT uses 'alg: none', which disables signature verification completely.",
                    "evidence": f"alg={jwt_header.get('alg')}",
                    "remediation": "Reject JWTs with 'alg: none'. Require RS256 or HS256 with a secret of at least 256 bits.",
                })

        if jwt_payload:
            exp = jwt_payload.get("exp")
            if exp:
                try:
                    exp_dt = datetime.fromtimestamp(int(exp), tz=timezone.utc)
                    now = datetime.now(timezone.utc)
                    if exp_dt < now:
                        findings.append({
                            "id": "AUTH-002a",
                            "category": "AUTH",
                            "severity": MEDIUM,
                            "title": "Expired JWT token sent in request",
                            "description": "The request carries an Authorization JWT that has already expired.",
                            "evidence": f"exp={exp_dt.isoformat()}",
                            "remediation": "Implement automatic token refresh before expiry. Never send expired tokens.",
                        })
                    elif (exp_dt - now) > timedelta(days=30):
                        findings.append({
                            "id": "AUTH-002b",
                            "category": "AUTH",
                            "severity": LOW,
                            "title": "JWT token lifetime exceeds 30 days",
                            "description": "Long-lived JWTs increase the window of opportunity if a token is compromised.",
                            "evidence": f"expires={exp_dt.isoformat()} (~{(exp_dt-now).days} days remaining)",
                            "remediation": "Use short-lived access tokens (<=1 hour) combined with refresh tokens.",
                        })
                except Exception:
                    pass

            sensitive_in_jwt = _SENSITIVE_RESPONSE_KEYS.intersection(
                {k.lower() for k in jwt_payload.keys()}
            )
            if sensitive_in_jwt:
                findings.append({
                    "id": "AUTH-003",
                    "category": "AUTH",
                    "severity": HIGH,
                    "title": "JWT payload contains sensitive fields",
                    "description": "JWT payloads are Base64-encoded (NOT encrypted). Anyone with the token can read these fields.",
                    "evidence": f"Fields: {', '.join(sorted(sensitive_in_jwt))}",
                    "remediation": "Never store passwords or PII in JWT payloads. Use JWE (encrypted JWT) for sensitive claims.",
                })

    sensitive_params = {"token", "access_token", "refresh_token", "api_key",
                        "apikey", "secret", "password", "passwd", "client_secret", "key"}
    found_in_qs = sensitive_params.intersection({k.lower() for k in query_params.keys()})
    if found_in_qs and method.upper() == "GET":
        findings.append({
            "id": "AUTH-004",
            "category": "AUTH",
            "severity": HIGH,
            "title": "Sensitive credential in GET URL query string",
            "description": "Tokens or secrets in URL query strings appear in browser history, server logs, referrer headers, and CDN caches.",
            "evidence": f"Parameters: {', '.join(sorted(found_in_qs))} in {parsed_url.path}",
            "remediation": "Pass credentials in the Authorization header or POST body, never in GET query strings.",
        })

    set_cookie = resp_headers.get("set-cookie", "")
    if set_cookie:
        issues = []
        cl = set_cookie.lower()
        if "httponly" not in cl:
            issues.append("missing HttpOnly (XSS risk)")
        if "secure" not in cl:
            issues.append("missing Secure (MITM risk)")
        if "samesite" not in cl:
            issues.append("missing SameSite (CSRF risk)")
        if issues:
            findings.append({
                "id": "AUTH-005",
                "category": "AUTH",
                "severity": MEDIUM,
                "title": "Insecure Set-Cookie attributes",
                "description": f"The Set-Cookie header is: {', '.join(issues)}.",
                "evidence": set_cookie[:200],
                "remediation": "Always set cookies with HttpOnly; Secure; SameSite=Strict attributes.",
            })

    all_text = " ".join(filter(None, [
        request_body or "", response_body or "",
        " ".join(req_headers.values()),
        " ".join(resp_headers.values()),
    ]))
    for prefix, service in _SECRET_PREFIXES:
        if prefix in all_text:
            idx = all_text.find(prefix)
            snippet = all_text[max(0, idx):idx + 40]
            findings.append({
                "id": "AUTH-006",
                "category": "AUTH",
                "severity": HIGH,
                "title": f"Hardcoded {service} detected in traffic",
                "description": f"A known {service} prefix was found in request/response traffic. This is a critical credential leak.",
                "evidence": f"{snippet}...",
                "remediation": f"Revoke and rotate the {service} immediately. Never include secret keys in frontend traffic.",
            })
            break

    # -- LEAK ------------------------------------------------------------------

    if isinstance(resp_body_dict, (dict, list)):
        leaked_keys = _find_sensitive_keys(resp_body_dict)
        if leaked_keys:
            findings.append({
                "id": "LEAK-001",
                "category": "LEAK",
                "severity": HIGH,
                "title": "Sensitive fields exposed in API response",
                "description": "The server response includes fields that should never reach the frontend.",
                "evidence": f"Fields: {', '.join(leaked_keys[:5])}{'...' if len(leaked_keys) > 5 else ''}",
                "remediation": "Use an allowlist for serialized response fields. Never return password hashes, internal flags, or card data.",
            })

    for hdr in _SERVER_HEADER_KEYS:
        val = resp_headers.get(hdr, "")
        if val:
            findings.append({
                "id": "LEAK-002",
                "category": "LEAK",
                "severity": LOW,
                "title": "Server technology fingerprint exposed",
                "description": f"The response header '{hdr}' reveals server software and version.",
                "evidence": f"{hdr}: {val}",
                "remediation": f"Remove or mask the '{hdr}' header in your reverse proxy / web server config.",
            })

    if response_body and (status_code or 0) >= 400:
        m = _STACK_TRACE.search(response_body)
        if m:
            snippet = response_body[max(0, m.start()):m.start() + 150].strip()
            findings.append({
                "id": "LEAK-003",
                "category": "LEAK",
                "severity": HIGH,
                "title": "Server stack trace leaked in error response",
                "description": "Error responses expose internal file paths and framework details that aid attackers.",
                "evidence": snippet,
                "remediation": "Enable production error mode that returns generic messages. Log details server-side only.",
            })

    if response_body:
        card_m = re.search(r"\b(?:\d[ -]?){13,16}\b", response_body)
        ssn_m  = re.search(r"\b\d{3}-\d{2}-\d{4}\b", response_body)
        if card_m:
            findings.append({
                "id": "LEAK-004a",
                "category": "LEAK",
                "severity": HIGH,
                "title": "Possible payment card number in API response",
                "description": "A 13-16 digit number pattern (possible card number) was found in the response.",
                "evidence": card_m.group(0),
                "remediation": "Never return full card numbers. Mask to last 4 digits: **** **** **** 1234.",
            })
        if ssn_m:
            findings.append({
                "id": "LEAK-004b",
                "category": "LEAK",
                "severity": HIGH,
                "title": "Possible SSN / national ID in API response",
                "description": "An NNN-NN-NNNN pattern matching a US Social Security Number was detected.",
                "evidence": ssn_m.group(0),
                "remediation": "Mask all national ID numbers. Only return last 4 digits when UI display is required.",
            })

    # -- INJECT ----------------------------------------------------------------

    check_targets = [request_body or "", parsed_url.query]
    for val_list in query_params.values():
        check_targets.extend(val_list)

    for target in check_targets:
        if _SQLI.search(target):
            findings.append({
                "id": "INJECT-001",
                "category": "INJECT",
                "severity": HIGH,
                "title": "SQL injection payload detected in outgoing request",
                "description": "A classic SQLi pattern was found. This may indicate a missing sanitization gap in the frontend.",
                "evidence": target[:200],
                "remediation": "Use parameterized queries / prepared statements. Validate and reject malicious patterns server-side.",
            })
            break

    for target in check_targets:
        if _XSS.search(target):
            findings.append({
                "id": "INJECT-002",
                "category": "INJECT",
                "severity": MEDIUM,
                "title": "XSS payload detected in outgoing request",
                "description": "Script injection patterns were found. A reflected or stored XSS could allow session token theft.",
                "evidence": target[:200],
                "remediation": "Apply context-aware output encoding server-side. Use Content-Security-Policy headers.",
            })
            break

    for target in check_targets:
        if _PATH_TRAVERSAL.search(target):
            findings.append({
                "id": "INJECT-003",
                "category": "INJECT",
                "severity": HIGH,
                "title": "Path traversal / LFI payload detected in request",
                "description": "Directory traversal patterns or system file paths detected in request.",
                "evidence": target[:200],
                "remediation": "Sanitize path inputs, avoid passing user input directly to filesystem APIs.",
            })
            break

    # -- NET -------------------------------------------------------------------

    host = parsed_url.hostname or ""
    if url and url.startswith("http://") and host not in ("127.0.0.1", "localhost", "::1"):
        findings.append({
            "id": "NET-001",
            "category": "NET",
            "severity": HIGH,
            "title": "Cleartext HTTP request (no TLS encryption)",
            "description": "All headers, cookies, and body data are visible to network observers.",
            "evidence": url[:150],
            "remediation": "Migrate all API endpoints to HTTPS. Enable HSTS to prevent downgrade attacks.",
        })

    acao = resp_headers.get("access-control-allow-origin", "")
    acac = resp_headers.get("access-control-allow-credentials", "")
    if acao == "*" and acac.lower() == "true":
        findings.append({
            "id": "NET-002",
            "category": "NET",
            "severity": HIGH,
            "title": "Permissive CORS with credentials enabled",
            "description": "ACAO: * combined with ACAC: true enables cross-origin credential theft.",
            "evidence": f"ACAO: {acao}, ACAC: {acac}",
            "remediation": "Set ACAO to an explicit allowlist. Never combine wildcard origin with Allow-Credentials: true.",
        })
    elif acao == "*":
        findings.append({
            "id": "NET-002b",
            "category": "NET",
            "severity": LOW,
            "title": "Overly permissive CORS (Allow-Origin: *)",
            "description": "Any website can read this API response. Fine for public APIs, risky if response is user-specific.",
            "evidence": f"ACAO: {acao}",
            "remediation": "Restrict ACAO to trusted domains unless this is an intentionally public endpoint.",
        })

    content_type = resp_headers.get("content-type", "")
    if any(ct in content_type for ct in ("text/html", "application/json")):
        missing = [name for hdr, name in _SECURITY_HEADERS.items() if hdr not in resp_headers]
        if missing:
            findings.append({
                "id": "NET-003",
                "category": "NET",
                "severity": LOW,
                "title": "Missing HTTP security response headers",
                "description": "Security headers protect against clickjacking, MIME sniffing, and XSS.",
                "evidence": f"Missing: {', '.join(missing)}",
                "remediation": "Add missing security headers in your web server / reverse proxy config.",
            })

    auth_paths = {"/login", "/signin", "/auth", "/token", "/password", "/forgot", "/reset"}
    path_lower = (parsed_url.path or "").lower()
    is_auth_ep = any(ap in path_lower for ap in auth_paths)
    has_rl = any(h in resp_headers for h in (
        "x-ratelimit-limit", "x-rate-limit-limit", "ratelimit-limit", "retry-after",
    ))
    if is_auth_ep and not has_rl:
        findings.append({
            "id": "NET-004",
            "category": "NET",
            "severity": MEDIUM,
            "title": "No rate-limiting headers on authentication endpoint",
            "description": f"'{parsed_url.path}' appears auth-related but returns no rate-limiting headers.",
            "evidence": f"Path: {parsed_url.path}, Status: {status_code}",
            "remediation": "Implement rate limiting (5 failed attempts per IP per 15 min). Return X-RateLimit-Limit and Retry-After headers.",
        })

    # -- PERF ------------------------------------------------------------------

    if recent_requests:
        fingerprint = f"{(method or '').upper()}:{(url or '').split('?')[0]}"
        dups = [
            r for r in recent_requests
            if f"{(r.get('method') or '').upper()}:{(r.get('url') or '').split('?')[0]}" == fingerprint
        ]
        if len(dups) >= 3:
            findings.append({
                "id": "PERF-001",
                "category": "PERF",
                "severity": MEDIUM,
                "title": f"Duplicate request burst detected ({len(dups)}x in recent window)",
                "description": "The same endpoint was called rapidly multiple times. Likely a React hook without dependencies, un-debounced input, or missing cache.",
                "evidence": f"{fingerprint} -- {len(dups)} duplicate calls",
                "remediation": "Audit useEffect dependency arrays. Add debounce (300-500ms) on search inputs. Use React Query / SWR for deduplication.",
            })

        path_base = re.sub(r"/\d+", "/{id}", parsed_url.path)
        n_plus_1 = [
            r for r in recent_requests
            if re.sub(r"/\d+", "/{id}", urlparse(r.get("url", "")).path) == path_base
            and re.search(r"/\d+", urlparse(r.get("url", "")).path)
        ]
        if len(n_plus_1) >= 4:
            findings.append({
                "id": "PERF-002",
                "category": "PERF",
                "severity": LOW,
                "title": "Possible N+1 request pattern detected",
                "description": f"Multiple sequential calls to '{path_base}' with different IDs were detected.",
                "evidence": f"{len(n_plus_1)} sequential calls to {path_base}",
                "remediation": "Replace individual fetches with a batch endpoint (GET /items?ids=1,2,3). Consider GraphQL or DataLoader.",
            })

    return findings


def audit_summary(findings):
    """Return a concise summary dict for a list of findings."""
    by_sev = {HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0}
    for f in findings:
        sev = f.get("severity", INFO)
        by_sev[sev] = by_sev.get(sev, 0) + 1

    score = by_sev[HIGH] * 10 + by_sev[MEDIUM] * 4 + by_sev[LOW] * 1
    if score == 0:
        grade = "A"
    elif score <= 4:
        grade = "B"
    elif score <= 10:
        grade = "C"
    elif score <= 20:
        grade = "D"
    else:
        grade = "F"

    return {
        "total":  len(findings),
        "high":   by_sev[HIGH],
        "medium": by_sev[MEDIUM],
        "low":    by_sev[LOW],
        "info":   by_sev[INFO],
        "score":  score,
        "grade":  grade,
    }
