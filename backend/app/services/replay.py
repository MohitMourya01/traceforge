"""
TraceForge - Request Replay Service

Replays a captured request (optionally with modifications) using httpx.
Returns the full response including headers, body, and timing.
"""

import time
import json
import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def replay_request(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    timeout: float = 30.0,
) -> dict:
    """
    Send an HTTP request and return structured result.

    Args:
        method: HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
        url: Full request URL including query string
        headers: Request headers dict (already unredacted by user)
        body: Raw request body string (JSON, form, etc.)
        timeout: Request timeout in seconds

    Returns:
        dict with status_code, headers, body, duration_ms, size
    """
    headers = headers or {}

    # Remove pseudo-headers that httpx can't send
    cleaned_headers = {
        k: v for k, v in headers.items()
        if not k.startswith(":") and k.lower() not in ("content-length", "host")
    }

    start = time.perf_counter()
    error_message = None
    response_body = None
    status_code = None
    response_headers = {}

    try:
        async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=timeout) as client:
            # Build content payload
            content = body.encode("utf-8") if isinstance(body, str) else body

            resp = await client.request(
                method=method.upper(),
                url=url,
                headers=cleaned_headers,
                content=content,
            )

            status_code = resp.status_code
            response_headers = dict(resp.headers)

            # Try to decode body as text
            try:
                response_body = resp.text
            except Exception:
                response_body = f"<binary content: {len(resp.content)} bytes>"

    except httpx.TimeoutException:
        error_message = f"Request timed out after {timeout}s"
    except httpx.ConnectError as e:
        error_message = f"Connection failed: {str(e)}"
    except Exception as e:
        error_message = f"Unexpected error: {str(e)}"

    duration_ms = round((time.perf_counter() - start) * 1000, 2)

    return {
        "success": error_message is None,
        "status_code": status_code,
        "status_text": _status_text(status_code),
        "response_headers": response_headers,
        "response_body": response_body,
        "duration_ms": duration_ms,
        "response_size": len(response_body.encode()) if response_body else 0,
        "error": error_message,
    }


def _status_text(code: int | None) -> str:
    """Return a human-readable status text for common HTTP codes."""
    texts = {
        200: "OK", 201: "Created", 204: "No Content",
        301: "Moved Permanently", 302: "Found", 304: "Not Modified",
        400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
        404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
        409: "Conflict", 429: "Too Many Requests",
        500: "Internal Server Error", 502: "Bad Gateway",
        503: "Service Unavailable", 504: "Gateway Timeout",
    }
    return texts.get(code, "Unknown") if code else "Unknown"
