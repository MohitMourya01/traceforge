"""
TraceForge - Phase 2 Integration Smoke Test

Simulates what the Chrome extension does:
  1. POST a captured request to /api/ingest  (as the extension would)
  2. Connect to /ws/studio WebSocket         (as the React Studio would)
  3. Verify the live event arrives via WS    (end-to-end flow)
  4. Test mock rule creation + retrieval
  5. Test replay endpoint

Run with: python tests/test_e2e_extension_flow.py
(Backend must be running: python run.py)
"""

# This test requires a live backend + WebSocket connection.
# Excluded from the normal pytest run via pytest.ini (collect_ignore_glob).
import pytest

pytestmark = pytest.mark.skip(
    reason="E2E smoke test — requires a live backend (python run.py). Run manually."
)

import sys
import asyncio
import json
import httpx
import websockets

# Force UTF-8 output on Windows
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND = "http://127.0.0.1:7890"
WS_STUDIO = "ws://127.0.0.1:7890/ws/studio"

SAMPLE = {
    "request_id": "e2e-smoke-001",
    "tab_id": 42,
    "tab_url": "http://localhost:3000/dashboard",
    "tab_title": "My App - Dashboard",
    "method": "POST",
    "url": "http://localhost:8000/api/orders",
    "domain": "localhost:8000",
    "path": "/api/orders",
    "request_headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer smoke_test_token",
    },
    "request_body": '{"product_id": 99, "quantity": 2, "password": "dont_store_me"}',
    "response_headers": {"Content-Type": "application/json"},
    "response_body": '{"order_id": 555, "access_token": "tok_abc", "status": "created"}',
    "status_code": 201,
    "duration_ms": 245.3,
    "resource_type": "fetch",
    "action_label": "click: Place Order",
    "action_batch_id": "batch-smoke-001",
}


async def test_full_flow():
    print("\n[TRACEFORGE] Phase 2 E2E Smoke Test\n" + "-" * 42)

    async with httpx.AsyncClient() as client:

        # ── 1. Health check
        resp = await client.get(f"{BACKEND}/health")
        assert resp.status_code == 200, "❌ Backend not running!"
        print("✅ 1. Backend health check passed")

        # ── 2. Connect to WS Studio + listen for live event
        received_event = asyncio.Event()
        received_data = {}

        async def ws_listener():
            async with websockets.connect(WS_STUDIO) as ws:
                # First message is CONNECTED
                welcome = json.loads(await ws.recv())
                assert welcome["type"] == "CONNECTED", f"Expected CONNECTED, got {welcome}"
                print("[OK] 2. WebSocket Studio connected")

                # Wait for the NEW_REQUEST event (triggered by ingest below)
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
                assert msg["type"] == "NEW_REQUEST", f"Expected NEW_REQUEST, got {msg['type']}"
                received_data.update(msg["data"])
                received_event.set()

        listener_task = asyncio.create_task(ws_listener())
        await asyncio.sleep(0.3)  # Give WS a moment to connect

        # ── 3. Ingest (simulating extension POST)
        resp = await client.post(f"{BACKEND}/api/ingest", json=SAMPLE)
        assert resp.status_code == 201, f"❌ Ingest failed: {resp.text}"
        ingested_id = resp.json()["id"]
        print(f"[OK] 3. Extension ingest accepted (id={ingested_id})")

        # ── 4. Wait for WS live event
        await asyncio.wait_for(received_event.wait(), timeout=5.0)
        assert received_data["method"] == "POST"
        assert received_data["status_code"] == 201
        print(f"[OK] 4. Live WS event received -> {received_data['method']} {received_data['path']}")

        await listener_task

        # ── 5. Verify secret redaction was applied
        resp = await client.get(f"{BACKEND}/api/requests/{ingested_id}")
        req = resp.json()
        headers = json.loads(req["request_headers"])
        body = json.loads(req["request_body"])
        resp_body = json.loads(req["response_body"])

        assert headers["Authorization"] == "[REDACTED]", "FAIL: Authorization not redacted!"
        assert body["password"] == "[REDACTED]", "FAIL: Password not redacted!"
        assert resp_body["access_token"] == "[REDACTED]", "FAIL: access_token not redacted!"
        assert req["was_redacted"] is True
        print("[OK] 5. Secret redaction verified (Authorization, password, access_token -> [REDACTED])")

        # ── 6. Code generation
        resp = await client.post(f"{BACKEND}/api/requests/{ingested_id}/codegen")
        codegen = resp.json()
        assert "curl -X POST" in codegen["curl"]
        assert "httpx" in codegen["python_httpx"]
        assert "fetch(" in codegen["js_fetch"]
        print("[OK] 6. Code generation: cURL / Python httpx / JS fetch all generated")

        # ── 7. Mock rule creation
        rule = {
            "name": "E2E: Simulate 429 on orders",
            "match_url_pattern": "/api/orders",
            "match_method": "POST",
            "override_status_code": 429,
            "override_body": '{"error": "Rate limit exceeded"}',
            "simulated_delay_ms": 500,
        }
        resp = await client.post(f"{BACKEND}/api/mock-rules", json=rule)
        assert resp.status_code == 201
        rule_id = resp.json()["id"]
        print(f"[OK] 7. Mock rule created (id={rule_id}): POST /api/orders -> 429")

        # ── 8. Stats check
        resp = await client.get(f"{BACKEND}/api/stats")
        stats = resp.json()
        assert stats["total_requests"] >= 1
        print(f"[OK] 8. Stats: {stats['total_requests']} captured, {stats['error_requests']} errors, {stats['slow_requests']} slow")

        # ── Cleanup
        await client.delete(f"{BACKEND}/api/mock-rules/{rule_id}")

    print("\n" + "-" * 42)
    print("[PASS] All Phase 2 E2E tests passed!\n")
    print("Next step: Load the extension in Chrome and test with a real web app.")


if __name__ == "__main__":
    asyncio.run(test_full_flow())
