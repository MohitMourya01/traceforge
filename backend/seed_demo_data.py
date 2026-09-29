"""
Seed script — POSTs realistic demo requests to the running backend
so the Studio dashboard has data to display immediately.

Run with:  python seed_demo_data.py
(Backend must be running: python run.py)
"""

import sys, uuid, asyncio, httpx, json
from datetime import datetime, UTC, timedelta

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://127.0.0.1:7890"

DEMO_REQUESTS = [
    # ── Normal API calls ──────────────────────────────────────────────────────
    {
        "method": "GET", "url": "https://api.acme.com/v1/users",
        "domain": "api.acme.com", "path": "/v1/users",
        "status_code": 200, "duration_ms": 142,
        "tab_title": "Acme Admin", "tab_url": "https://admin.acme.com/users",
        "resource_type": "fetch",
        "request_headers": {"Accept": "application/json", "Authorization": "Bearer eyJhbGciOi..."},
        "response_headers": {"Content-Type": "application/json"},
        "response_body": json.dumps([{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]),
        "action_label": "page load",
    },
    {
        "method": "POST", "url": "https://api.acme.com/v1/orders",
        "domain": "api.acme.com", "path": "/v1/orders",
        "status_code": 201, "duration_ms": 318,
        "tab_title": "Acme Shop", "tab_url": "https://shop.acme.com/checkout",
        "resource_type": "fetch",
        "request_headers": {"Content-Type": "application/json", "Authorization": "Bearer tok_secret"},
        "request_body": json.dumps({"product_id": 42, "qty": 2, "password": "hunter2"}),
        "response_headers": {"Content-Type": "application/json"},
        "response_body": json.dumps({"order_id": 1001, "access_token": "tok_abc123", "status": "created"}),
        "action_label": "click: Place Order",
    },
    {
        "method": "GET", "url": "https://api.acme.com/v1/products?page=1&limit=20",
        "domain": "api.acme.com", "path": "/v1/products",
        "status_code": 200, "duration_ms": 88,
        "tab_title": "Acme Shop", "tab_url": "https://shop.acme.com/",
        "resource_type": "xhr",
        "request_headers": {"Accept": "application/json"},
        "response_body": json.dumps({"products": [{"id": 1, "name": "Widget", "price": 9.99}], "total": 120}),
    },
    {
        "method": "PUT", "url": "https://api.acme.com/v1/users/1/profile",
        "domain": "api.acme.com", "path": "/v1/users/1/profile",
        "status_code": 200, "duration_ms": 205,
        "tab_title": "Acme Admin", "tab_url": "https://admin.acme.com/profile",
        "resource_type": "fetch",
        "request_headers": {"Content-Type": "application/json", "x-api-key": "sk_live_secret"},
        "request_body": json.dumps({"name": "Alice Smith", "email": "alice@acme.com"}),
        "response_body": json.dumps({"id": 1, "name": "Alice Smith"}),
        "action_label": "click: Save",
    },
    {
        "method": "DELETE", "url": "https://api.acme.com/v1/sessions/abc",
        "domain": "api.acme.com", "path": "/v1/sessions/abc",
        "status_code": 204, "duration_ms": 60,
        "tab_title": "Acme App", "tab_url": "https://app.acme.com",
        "resource_type": "fetch",
        "request_headers": {"Authorization": "Bearer tok_session"},
        "action_label": "click: Logout",
    },
    # ── Errors ────────────────────────────────────────────────────────────────
    {
        "method": "POST", "url": "https://api.acme.com/v1/payments",
        "domain": "api.acme.com", "path": "/v1/payments",
        "status_code": 422, "status_text": "Unprocessable Entity",
        "duration_ms": 95,
        "tab_title": "Acme Shop", "tab_url": "https://shop.acme.com/checkout",
        "resource_type": "fetch",
        "request_headers": {"Content-Type": "application/json"},
        "request_body": json.dumps({"amount": -100}),
        "response_body": json.dumps({"error": "amount must be positive"}),
        "action_label": "click: Pay Now",
    },
    {
        "method": "GET", "url": "https://api.acme.com/v1/users/9999",
        "domain": "api.acme.com", "path": "/v1/users/9999",
        "status_code": 404, "status_text": "Not Found",
        "duration_ms": 45,
        "tab_title": "Acme Admin", "tab_url": "https://admin.acme.com/users/9999",
        "resource_type": "fetch",
        "response_body": json.dumps({"error": "User not found"}),
    },
    {
        "method": "POST", "url": "https://auth.acme.com/oauth/token",
        "domain": "auth.acme.com", "path": "/oauth/token",
        "status_code": 401, "status_text": "Unauthorized",
        "duration_ms": 112,
        "tab_title": "Acme Login", "tab_url": "https://app.acme.com/login",
        "resource_type": "fetch",
        "request_body": json.dumps({"grant_type": "password", "client_secret": "cs_very_secret"}),
        "response_body": json.dumps({"error": "invalid_client"}),
        "action_label": "click: Sign In",
    },
    {
        "method": "GET", "url": "https://api.acme.com/v1/reports/export",
        "domain": "api.acme.com", "path": "/v1/reports/export",
        "status_code": 500, "status_text": "Internal Server Error",
        "duration_ms": 3200,
        "tab_title": "Acme Reports", "tab_url": "https://admin.acme.com/reports",
        "resource_type": "fetch",
        "response_body": json.dumps({"error": "Database timeout"}),
        "action_label": "click: Export",
    },
    # ── Slow requests ─────────────────────────────────────────────────────────
    {
        "method": "GET", "url": "https://api.acme.com/v1/analytics/dashboard",
        "domain": "api.acme.com", "path": "/v1/analytics/dashboard",
        "status_code": 200, "duration_ms": 4700,
        "tab_title": "Acme Analytics", "tab_url": "https://admin.acme.com/analytics",
        "resource_type": "fetch",
        "response_body": json.dumps({"revenue": 12345, "users": 890}),
    },
    {
        "method": "POST", "url": "https://api.acme.com/v1/ml/predict",
        "domain": "api.acme.com", "path": "/v1/ml/predict",
        "status_code": 200, "duration_ms": 6100,
        "tab_title": "Acme AI", "tab_url": "https://app.acme.com/ai",
        "resource_type": "fetch",
        "request_body": json.dumps({"input": "classify this text"}),
        "response_body": json.dumps({"label": "positive", "confidence": 0.94}),
        "action_label": "click: Analyze",
    },
    # ── Third-party calls ─────────────────────────────────────────────────────
    {
        "method": "GET", "url": "https://cdn.stripe.com/v3/fingerprinted/js/stripe.js",
        "domain": "cdn.stripe.com", "path": "/v3/fingerprinted/js/stripe.js",
        "status_code": 200, "duration_ms": 210,
        "tab_title": "Acme Shop", "tab_url": "https://shop.acme.com/checkout",
        "resource_type": "script",
    },
    {
        "method": "POST", "url": "https://api.segment.io/v1/track",
        "domain": "api.segment.io", "path": "/v1/track",
        "status_code": 200, "duration_ms": 55,
        "tab_title": "Acme Shop", "tab_url": "https://shop.acme.com/",
        "resource_type": "fetch",
        "request_body": json.dumps({"event": "Product Viewed", "userId": "u_123"}),
        "response_body": json.dumps({"success": True}),
    },
    {
        "method": "GET", "url": "https://fonts.googleapis.com/css2?family=Inter",
        "domain": "fonts.googleapis.com", "path": "/css2",
        "status_code": 200, "duration_ms": 38,
        "tab_title": "Acme App", "tab_url": "https://app.acme.com",
        "resource_type": "stylesheet",
    },
    # ── PATCH ─────────────────────────────────────────────────────────────────
    {
        "method": "PATCH", "url": "https://api.acme.com/v1/settings",
        "domain": "api.acme.com", "path": "/v1/settings",
        "status_code": 200, "duration_ms": 178,
        "tab_title": "Acme Settings", "tab_url": "https://app.acme.com/settings",
        "resource_type": "fetch",
        "request_body": json.dumps({"theme": "dark", "notifications": True}),
        "response_body": json.dumps({"updated": True}),
        "action_label": "toggle: Dark Mode",
    },
]


async def seed():
    print(f"\n{'─'*50}")
    print("  traceforge — Seeding demo data")
    print(f"{'─'*50}")

    tab_ids = {"Acme Admin": 1, "Acme Shop": 2, "Acme App": 3,
               "Acme Login": 3, "Acme Reports": 1, "Acme Analytics": 1, "Acme AI": 3, "Acme Settings": 3}

    async with httpx.AsyncClient(timeout=10) as client:
        # Health check
        try:
            r = await client.get(f"{BASE}/health")
            assert r.status_code == 200
            print("✅ Backend is running\n")
        except Exception:
            print("❌ Backend is not running! Start it with: python run.py")
            return

        ok = 0
        for i, req in enumerate(DEMO_REQUESTS):
            payload = {
                "request_id": str(uuid.uuid4()),
                "tab_id": tab_ids.get(req.get("tab_title", ""), i + 1),
                "tab_url": req.get("tab_url", ""),
                "tab_title": req.get("tab_title", "Demo Tab"),
                "method": req["method"],
                "url": req["url"],
                "domain": req.get("domain", ""),
                "path": req.get("path", "/"),
                "request_headers": req.get("request_headers"),
                "request_body": req.get("request_body"),
                "response_headers": req.get("response_headers"),
                "response_body": req.get("response_body"),
                "status_code": req.get("status_code"),
                "status_text": req.get("status_text", "OK"),
                "duration_ms": req.get("duration_ms", 100),
                "resource_type": req.get("resource_type", "fetch"),
                "action_label": req.get("action_label"),
                "timestamp": (datetime.now(UTC) - timedelta(seconds=(len(DEMO_REQUESTS) - i) * 12)).isoformat(),
            }
            try:
                r = await client.post(f"{BASE}/api/ingest", json=payload)
                if r.status_code == 201:
                    print(f"  ✅ {req['method']:6} {req['path']}  → {req.get('status_code', '?')}")
                    ok += 1
                else:
                    print(f"  ⚠️  {req['method']:6} {req['path']}  → HTTP {r.status_code}: {r.text[:80]}")
            except Exception as e:
                print(f"  ❌ {req['method']:6} {req['path']}  → {e}")

        print(f"\n{'─'*50}")
        print(f"  Done — {ok}/{len(DEMO_REQUESTS)} requests seeded")
        print(f"  Open http://localhost:5174 to see them in the Studio")
        print(f"{'─'*50}\n")


if __name__ == "__main__":
    asyncio.run(seed())
