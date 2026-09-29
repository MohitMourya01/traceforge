"""
TraceForge - Integration Tests for FastAPI Endpoints
"""

import json
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel
from sqlmodel.pool import StaticPool

from app.main import app
from app.db.database import get_session
from app.db.models import CapturedRequest


# ─── Test DB Fixture ──────────────────────────────────────────────────────────

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


# ─── Health ──────────────────────────────────────────────────────────────────

def test_health(client: TestClient):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_root(client: TestClient):
    resp = client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "TraceForge"


# ─── Ingest ──────────────────────────────────────────────────────────────────

SAMPLE_REQUEST = {
    "request_id": "test-uuid-001",
    "tab_id": 1,
    "tab_url": "http://localhost:3000",
    "tab_title": "My App",
    "method": "POST",
    "url": "http://localhost:8000/api/login",
    "domain": "localhost:8000",
    "path": "/api/login",
    "request_headers": {"Content-Type": "application/json", "Authorization": "Bearer tok123"},
    "request_body": '{"email": "mohit@test.com", "password": "s3cr3t"}',
    "response_headers": {"Content-Type": "application/json"},
    "response_body": '{"access_token": "jwt_xyz", "user_id": 42}',
    "status_code": 200,
    "duration_ms": 183.5,
}


def test_ingest_request(client: TestClient):
    resp = client.post("/api/ingest", json=SAMPLE_REQUEST)
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["request_id"] == "test-uuid-001"


def test_ingest_auto_redacts_secrets(client: TestClient, session: Session):
    client.post("/api/ingest", json=SAMPLE_REQUEST)
    req = session.exec(
        __import__("sqlmodel").select(CapturedRequest)
        .where(CapturedRequest.request_id == "test-uuid-001")
    ).first()
    assert req is not None
    assert req.was_redacted is True
    headers = json.loads(req.request_headers)
    assert headers["Authorization"] == "[REDACTED]"
    body = json.loads(req.request_body)
    assert body["password"] == "[REDACTED]"
    resp_body = json.loads(req.response_body)
    assert resp_body["access_token"] == "[REDACTED]"


# ─── List & Get ──────────────────────────────────────────────────────────────

def test_list_requests(client: TestClient):
    client.post("/api/ingest", json=SAMPLE_REQUEST)
    resp = client.get("/api/requests")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_get_request_by_id(client: TestClient):
    ingest_resp = client.post("/api/ingest", json=SAMPLE_REQUEST)
    req_id = ingest_resp.json()["id"]
    resp = client.get(f"/api/requests/{req_id}")
    assert resp.status_code == 200
    assert resp.json()["method"] == "POST"


def test_get_nonexistent_request(client: TestClient):
    resp = client.get("/api/requests/999999")
    assert resp.status_code == 404


def test_filter_by_method(client: TestClient):
    client.post("/api/ingest", json=SAMPLE_REQUEST)
    resp = client.get("/api/requests?method=POST")
    assert resp.status_code == 200
    for r in resp.json():
        assert r["method"] == "POST"


def test_filter_by_status_class(client: TestClient):
    client.post("/api/ingest", json=SAMPLE_REQUEST)
    resp = client.get("/api/requests?status_class=2xx")
    assert resp.status_code == 200
    for r in resp.json():
        assert 200 <= r["status_code"] < 300


# ─── Code Generation ─────────────────────────────────────────────────────────

def test_codegen_returns_all_formats(client: TestClient):
    ingest_resp = client.post("/api/ingest", json=SAMPLE_REQUEST)
    req_id = ingest_resp.json()["id"]
    resp = client.post(f"/api/requests/{req_id}/codegen")
    assert resp.status_code == 200
    data = resp.json()
    assert "curl" in data
    assert "python_httpx" in data
    assert "python_requests" in data
    assert "js_fetch" in data
    assert "js_axios" in data
    # cURL should contain the URL
    assert "localhost:8000" in data["curl"]


# ─── Stats ────────────────────────────────────────────────────────────────────

def test_stats(client: TestClient):
    client.post("/api/ingest", json=SAMPLE_REQUEST)
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_requests" in data
    assert "error_requests" in data
    assert data["total_requests"] >= 1


# ─── Mock Rules ──────────────────────────────────────────────────────────────

def test_create_mock_rule(client: TestClient):
    rule = {
        "name": "Simulate 500 on login",
        "match_url_pattern": "/api/login",
        "override_status_code": 500,
        "override_body": '{"error": "Simulated failure"}',
        "simulated_delay_ms": 1000,
    }
    resp = client.post("/api/mock-rules", json=rule)
    assert resp.status_code == 201
    data = resp.json()
    assert data["override_status_code"] == 500


def test_list_mock_rules(client: TestClient):
    client.post("/api/mock-rules", json={
        "name": "Test rule",
        "match_url_pattern": "/api/test",
        "override_status_code": 404,
    })
    resp = client.get("/api/mock-rules")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_delete_mock_rule(client: TestClient):
    create_resp = client.post("/api/mock-rules", json={
        "name": "Delete me",
        "match_url_pattern": "/api/delete-test",
        "override_status_code": 204,
    })
    rule_id = create_resp.json()["id"]
    delete_resp = client.delete(f"/api/mock-rules/{rule_id}")
    assert delete_resp.status_code == 200

    list_resp = client.get("/api/mock-rules")
    ids = [r["id"] for r in list_resp.json()]
    assert rule_id not in ids
