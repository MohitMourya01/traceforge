# TraceForge — Project Description

## Overview

TraceForge is a local-first browser API traffic recorder and inspection workspace. It consists of a Chrome Manifest V3 extension, a Python FastAPI backend, and a React dashboard. The extension observes page `fetch` and `XMLHttpRequest` calls, sends captured request and response details to the local backend, and the backend redacts selected secrets, stores records in SQLite, and runs a set of heuristic security and performance checks. The dashboard provides live traffic inspection, audit findings, replay, generated request examples, and browser-side mock rules.

The project is intended for developers and security engineers debugging and reviewing web application API behavior during local development. It is a diagnostic aid: its security checks are pattern-based observations of captured traffic, not a complete vulnerability scanner or proof that an application is secure.

## What it can do

### Capture and inspect browser API traffic

- Capture page-originated `fetch` and `XMLHttpRequest` activity through scripts injected into web pages by the extension.
- Record method, URL, request and response headers and bodies, status, timing, tab metadata, and request size information where supplied by the interceptor.
- Pause and resume capture from the dashboard or extension controls; the backend and extension synchronize recording state.
- Browse recent requests, inspect an individual request, and filter or clear stored history through the API/dashboard.
- Stream new request and audit events to the Studio over WebSockets.

Capture is based on page JavaScript APIs. It does not claim to record every browser network event, such as traffic from all browser internals, service workers, navigations, or non-Fetch/XHR protocols.

### Redact selected secrets before persistence

At ingestion, the backend replaces values in configured sensitive headers (for example authorization, cookies, and API-key headers) and selected JSON/form body keys (for example password, token, and card-number fields) with `[REDACTED]`. It stores the resulting request and response data locally in SQLite and indicates when redaction occurred.

Redaction is key- and pattern-based. It does not guarantee detection of secrets embedded in arbitrary text, unrecognized field names, URL query parameters, or non-JSON/non-form payloads. Treat captured data as sensitive and review the configured patterns before using the tool with real credentials or personal data.

### Run Sentinel heuristic audits

The backend evaluates captured traffic with local rules and persists findings with severity, evidence, and remediation guidance. Current rule families include:

- Authentication and credential indicators, such as sensitive information in URLs or request patterns.
- Possible token, private-key, payment-card, or national-ID exposure in captured data.
- SQL injection, XSS, and path-traversal payload patterns in outgoing request inputs.
- Cleartext HTTP, permissive CORS, missing common response security headers, and absent rate-limit headers on likely authentication endpoints.
- Repeated calls to the same endpoint and possible N+1-style URL patterns, using recent requests associated with a tab.

Findings are assigned HIGH, MEDIUM, LOW, or INFO severity. A weighted score is converted into an A–F grade for display. These are heuristic signals and may produce false positives or miss issues; grades should not be interpreted as an application security certification. Some rules depend on the captured request/response fields being available.

### Replay requests and generate examples

- Replay a captured or manually specified HTTP request through the backend, with editable method, URL, headers, body, and optional settings exposed by the API.
- Generate copy-ready cURL, Python `httpx`, Python `requests`, JavaScript `fetch`, and JavaScript Axios snippets from a stored request.
- Redacted values in generated cURL examples are represented with placeholders so users can provide credentials themselves.

Replay sends a real outbound HTTP request from the backend to the selected URL. Use it only with endpoints you are authorized to access.

### Mock selected requests in the browser

Create, update, enable/disable, and delete rules matching requests by method and URL pattern (including regex mode). A rule can supply a response status, headers, body, and simulated delay. The backend broadcasts rule updates to the extension, which passes them to the page interceptor for matching Fetch/XHR calls. This is useful for testing UI loading, error, and edge states without changing the API server.

Mocking takes place in the instrumented page's Fetch/XHR path; it is not a general-purpose proxy and does not alter unrelated browser traffic.

## Components and data flow

1. **Chrome extension (`extension/`)** injects a page-world interceptor and an isolated-world content script. The interceptor observes supported calls; the content script relays events to the extension service worker.
2. **Extension background worker** posts captured events to `http://127.0.0.1:7890/api/ingest`, maintains a WebSocket connection to the backend, and distributes recording-state and mock-rule updates to tabs.
3. **Backend (`backend/`)** validates ingestion payloads, redacts configured data, writes request and finding records to SQLite, runs Sentinel checks, exposes REST endpoints, and broadcasts live events.
4. **Studio (`studio/`)** is a React/Vite single-page dashboard. Its Live Traffic view inspects requests, Sentinel Security presents findings and summary information, and Mock Rules manages browser-side overrides.

The backend defaults to `127.0.0.1:7890`; the Vite development server defaults to port `5173`. The extension currently has those backend URLs configured directly in its source.

## Main backend API

- `POST /api/ingest` — receive and store a captured request after redaction and schedule its audit.
- `GET /api/requests`, `GET /api/requests/{id}`, `DELETE /api/requests` — list, inspect, and clear request history.
- `GET /api/requests/{id}/audit`, `POST /api/requests/{id}/audit/rerun` — inspect or rerun one request's audit.
- `GET /api/audit/summary`, `GET /api/audit/findings` — retrieve overall audit metrics and findings.
- `POST /api/replay` — issue an HTTP replay request.
- `POST /api/requests/{id}/codegen` — generate request snippets.
- `GET/POST /api/mock-rules`, `PATCH/DELETE /api/mock-rules/{id}` — manage mock rules.
- `GET /api/stats`, `GET/POST /api/recording` — dashboard metrics and capture state.
- WebSocket routes provide extension and Studio event channels; interactive API documentation is exposed at `/docs`.

## Technology

- **Browser extension:** Chrome Manifest V3, JavaScript, Fetch/XHR interception, Chrome tabs/storage/scripting APIs.
- **Backend:** Python 3.11+, FastAPI, SQLModel, SQLite, HTTPX, and WebSockets.
- **Dashboard:** React, Vite, and Three.js/React Three Fiber visual effects.
- **Tests present:** pytest suites for API behavior, redaction, Sentinel rules, and an extension-to-backend flow.

## Running locally

1. Install Python 3.11+ and Node.js/npm.
2. In `backend/`, install dependencies with `pip install -r requirements.txt`, then run `python run.py`.
3. In `studio/`, run `npm install` and `npm run dev`.
4. In Chrome, open `chrome://extensions`, enable Developer mode, and load the repository's `extension/` directory as an unpacked extension.
5. Visit a supported web application. The extension connects to the local backend and begins capturing by default; pause capture from the Studio when needed.

## Boundaries and operational notes

- TraceForge is configured as a local development tool, not a hardened multi-user or production deployment. The backend binds to loopback by default and has permissive development CORS configuration; review configuration before exposing it to a network.
- The extension requests access to all HTTP/HTTPS hosts so it can instrument pages. Install and enable it only where this broad access is acceptable.
- Captured content is persisted in a local SQLite database until cleared. The clear-history endpoint removes captured request records; review database behavior and backups before relying on it as secure deletion.
- The security engine uses heuristics rather than static analysis of server source code, authenticated penetration testing, or exhaustive dynamic testing.
- Replay can trigger state-changing actions on remote services. Verify the method, URL, and payload before replaying.

## Repository map

- `extension/` — Manifest V3 extension, page interceptor, message bridge, service worker, and popup.
- `backend/app/api/` — REST and WebSocket routes and schemas.
- `backend/app/core/` — configuration, redaction, Sentinel rules, and code generation.
- `backend/app/db/` — SQLite setup and SQLModel records.
- `backend/app/services/` — replay and WebSocket connection management.
- `backend/tests/` — backend and end-to-end flow tests.
- `studio/src/` — dashboard pages, components, WebSocket hook, API client, and styles.
