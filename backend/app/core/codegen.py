"""
TraceForge - Code Generator

Converts a captured request into copy-paste ready code snippets:
  - cURL
  - Python httpx
  - Python requests
  - JavaScript fetch
  - JavaScript Axios
"""

import json
import shlex
from urllib.parse import urlparse, urlencode, parse_qs


def _parse_headers(headers_json: str | None) -> dict:
    if not headers_json:
        return {}
    try:
        return json.loads(headers_json)
    except Exception:
        return {}


def _parse_body(body: str | None) -> tuple[dict | None, str | None]:
    """Returns (parsed_dict, raw_string)."""
    if not body:
        return None, None
    try:
        return json.loads(body), body
    except Exception:
        return None, body


def generate_curl(method: str, url: str, headers_json: str | None, body: str | None) -> str:
    """Generate a cURL command for the given request."""
    headers = _parse_headers(headers_json)
    lines = [f"curl -X {method.upper()} '{url}'"]

    for key, value in headers.items():
        if value == "[REDACTED]":
            placeholder = key.upper().replace("-", "_")
            lines.append(f"  -H '{key}: YOUR_{placeholder}_HERE'")
        else:
            lines.append(f"  -H '{key}: {value}'")

    if body:
        escaped = body.replace("'", "'\\''")
        lines.append(f"  -d '{escaped}'")

    return " \\\n".join(lines)


def generate_python_httpx(method: str, url: str, headers_json: str | None, body: str | None) -> str:
    """Generate Python httpx async code."""
    headers = _parse_headers(headers_json)
    parsed_body, raw_body = _parse_body(body)

    lines = [
        "import httpx",
        "import asyncio",
        "",
        "async def make_request():",
        f"    url = {repr(url)}",
    ]

    if headers:
        lines.append(f"    headers = {json.dumps(headers, indent=8)}")
    else:
        lines.append("    headers = {}")

    if parsed_body:
        lines.append(f"    json_data = {json.dumps(parsed_body, indent=8)}")
        body_arg = "json=json_data"
    elif raw_body:
        lines.append(f"    data = {repr(raw_body)}")
        body_arg = "content=data"
    else:
        body_arg = None

    args = ["url=url", "headers=headers"]
    if body_arg:
        args.append(body_arg)

    lines += [
        "",
        "    async with httpx.AsyncClient() as client:",
        f"        response = await client.{method.lower()}({', '.join(args)})",
        "        print(response.status_code)",
        "        print(response.json())",
        "",
        "asyncio.run(make_request())",
    ]
    return "\n".join(lines)


def generate_python_requests(method: str, url: str, headers_json: str | None, body: str | None) -> str:
    """Generate Python requests code."""
    headers = _parse_headers(headers_json)
    parsed_body, raw_body = _parse_body(body)

    lines = [
        "import requests",
        "",
        f"url = {repr(url)}",
    ]

    if headers:
        lines.append(f"headers = {json.dumps(headers, indent=4)}")
    else:
        lines.append("headers = {}")

    if parsed_body:
        lines.append(f"json_data = {json.dumps(parsed_body, indent=4)}")
        body_arg = "json=json_data"
    elif raw_body:
        lines.append(f"data = {repr(raw_body)}")
        body_arg = "data=data"
    else:
        body_arg = None

    args = ["url", "headers=headers"]
    if body_arg:
        args.append(body_arg)

    lines += [
        "",
        f"response = requests.{method.lower()}({', '.join(args)})",
        "print(response.status_code)",
        "print(response.json())",
    ]
    return "\n".join(lines)


def generate_js_fetch(method: str, url: str, headers_json: str | None, body: str | None) -> str:
    """Generate JavaScript fetch code."""
    headers = _parse_headers(headers_json)
    parsed_body, raw_body = _parse_body(body)

    options: dict = {"method": method.upper()}
    if headers:
        options["headers"] = headers
    if raw_body:
        options["body"] = raw_body

    opts_str = json.dumps(options, indent=2)

    return f"""const response = await fetch('{url}', {opts_str});

const data = await response.json();
console.log(response.status, data);"""


def generate_js_axios(method: str, url: str, headers_json: str | None, body: str | None) -> str:
    """Generate JavaScript Axios code."""
    headers = _parse_headers(headers_json)
    parsed_body, raw_body = _parse_body(body)

    config: dict = {}
    if headers:
        config["headers"] = headers

    config_str = json.dumps(config, indent=2) if config else "{}"

    body_arg = ""
    if parsed_body:
        body_arg = f", {json.dumps(parsed_body, indent=2)}"
    elif raw_body:
        body_arg = f", {repr(raw_body)}"

    methods_with_body = {"post", "put", "patch"}
    if method.lower() in methods_with_body:
        return (
            f"import axios from 'axios';\n\n"
            f"const {{ data, status }} = await axios.{method.lower()}(\n"
            f"  '{url}'{body_arg},\n"
            f"  {config_str}\n"
            f");\n"
            f"console.log(status, data);"
        )
    else:
        return (
            f"import axios from 'axios';\n\n"
            f"const {{ data, status }} = await axios.{method.lower()}(\n"
            f"  '{url}',\n"
            f"  {config_str}\n"
            f");\n"
            f"console.log(status, data);"
        )


def generate_all(method: str, url: str, headers_json: str | None, body: str | None) -> dict[str, str]:
    """Generate all code snippets for a request."""
    return {
        "curl": generate_curl(method, url, headers_json, body),
        "python_httpx": generate_python_httpx(method, url, headers_json, body),
        "python_requests": generate_python_requests(method, url, headers_json, body),
        "js_fetch": generate_js_fetch(method, url, headers_json, body),
        "js_axios": generate_js_axios(method, url, headers_json, body),
    }
