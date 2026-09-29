"""
TraceForge - Secret Redaction Engine

Automatically detects and redacts sensitive data from request/response
headers and body payloads before storing them in the local database.
"""

import re
import json
import copy
from typing import Any

from app.core.config import settings

REDACTED = "[REDACTED]"

# Compile header pattern regex (case-insensitive)
_HEADER_PATTERNS = [re.compile(p, re.IGNORECASE) for p in settings.SENSITIVE_HEADER_PATTERNS]
_BODY_KEYS = {k.lower() for k in settings.SENSITIVE_BODY_KEYS}


def redact_headers(headers: dict[str, Any] | None) -> tuple[dict[str, str], bool]:
    """
    Redact sensitive header values.

    Returns:
        (redacted_headers, was_redacted) tuple
    """
    if not headers or not isinstance(headers, dict):
        return {}, False

    redacted = {}
    was_redacted = False

    for key, value in headers.items():
        k_str = str(key)
        v_str = str(value) if value is not None else ""
        if any(p.search(k_str) for p in _HEADER_PATTERNS):
            redacted[k_str] = REDACTED
            was_redacted = True
        else:
            redacted[k_str] = v_str

    return redacted, was_redacted


def redact_body(body: Any) -> tuple[Any, bool]:
    """
    Recursively redact sensitive keys from a parsed JSON body.

    Returns:
        (redacted_body, was_redacted) tuple
    """
    if body is None:
        return None, False

    if isinstance(body, dict):
        redacted = {}
        was_redacted = False
        for key, value in body.items():
            k_str = str(key)
            if k_str.lower() in _BODY_KEYS:
                redacted[k_str] = REDACTED
                was_redacted = True
            else:
                inner, inner_redacted = redact_body(value)
                redacted[k_str] = inner
                was_redacted = was_redacted or inner_redacted
        return redacted, was_redacted

    elif isinstance(body, list):
        results = [redact_body(item) for item in body]
        redacted_list = [r[0] for r in results]
        was_redacted = any(r[1] for r in results)
        return redacted_list, was_redacted

    return body, False


def redact_body_string(body_input: Any) -> tuple[str | None, bool]:
    """
    Attempt to parse body as JSON and redact sensitive keys.
    Falls back to returning original string if not valid JSON.

    Returns:
        (redacted_body_string, was_redacted) tuple
    """
    if body_input is None:
        return None, False

    if isinstance(body_input, (dict, list)):
        redacted, was_redacted = redact_body(body_input)
        return json.dumps(redacted, indent=2), was_redacted

    body_str = str(body_input).strip()
    if not body_str:
        return body_str, False

    # Try JSON
    try:
        parsed = json.loads(body_str)
        redacted, was_redacted = redact_body(parsed)
        return json.dumps(redacted, indent=2), was_redacted
    except (json.JSONDecodeError, ValueError):
        pass

    # Try form-encoded (key=value&key2=value2)
    if "=" in body_str and "&" in body_str:
        try:
            pairs = body_str.split("&")
            redacted_pairs = []
            was_redacted = False
            for pair in pairs:
                if "=" in pair:
                    k, _, v = pair.partition("=")
                    if k.lower() in _BODY_KEYS:
                        redacted_pairs.append(f"{k}={REDACTED}")
                        was_redacted = True
                    else:
                        redacted_pairs.append(pair)
                else:
                    redacted_pairs.append(pair)
            return "&".join(redacted_pairs), was_redacted
        except Exception:
            pass

    return body_str, False


def redact_request(
    request_headers: dict | None,
    request_body: str | None,
    response_headers: dict | None,
    response_body: str | None,
) -> dict:
    """
    Full redaction pass over a captured request/response.

    Returns a dict with all redacted values and a was_redacted flag.
    """
    req_headers, rh_redacted = redact_headers(request_headers)
    resp_headers, resp_h_redacted = redact_headers(response_headers)
    req_body, rb_redacted = redact_body_string(request_body)
    resp_body, resp_b_redacted = redact_body_string(response_body)

    was_redacted = rh_redacted or resp_h_redacted or rb_redacted or resp_b_redacted

    return {
        "request_headers": req_headers,
        "request_body": req_body,
        "response_headers": resp_headers,
        "response_body": resp_body,
        "was_redacted": was_redacted,
    }
