import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.main import app
from app.db.database import get_session

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

def test_sentinel_audit_sqli_and_jwt(client: TestClient):
    # Ingest a request containing an SQL injection in URL and JWT in query param
    payload = {
        "request_id": "test-sentinel-01",
        "method": "GET",
        "url": "https://api.example.com/users?id=1%20UNION%20SELECT%20username,password%20FROM%20users--&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
        "status_code": 200,
        "duration_ms": 45.0,
    }
    resp = client.post("/api/ingest", json=payload)
    assert resp.status_code == 201
    captured_id = resp.json()["id"]

    # Fetch request detail
    r_resp = client.get(f"/api/requests/{captured_id}")
    assert r_resp.status_code == 200
    r_data = r_resp.json()
    assert r_data["audit_grade"] in ("D", "F")
    assert r_data["audit_high"] >= 1

    # Fetch audit findings for this request
    audit_resp = client.get(f"/api/requests/{captured_id}/audit")
    assert audit_resp.status_code == 200
    audit_data = audit_resp.json()
    assert audit_data["total"] >= 2
    rule_ids = [f["rule_id"] for f in audit_data["findings"]]
    assert any("INJ" in r or "SQL" in r for r in rule_ids)
    assert any("AUTH" in r for r in rule_ids)

def test_sentinel_global_summary_and_feed(client: TestClient):
    # Ingest bad request
    client.post("/api/ingest", json={
        "request_id": "sec-test-2",
        "method": "POST",
        "url": "https://api.example.com/login",
        "request_body": "{\"user\": \"admin' OR '1'='1\"}",
        "status_code": 200,
        "duration_ms": 60.0
    })

    # Global summary
    sum_resp = client.get("/api/audit/summary")
    assert sum_resp.status_code == 200
    sum_data = sum_resp.json()
    assert sum_data["scanned_requests"] >= 1
    assert sum_data["high"] >= 1

    # Findings feed
    feed_resp = client.get("/api/audit/findings?severity=HIGH")
    assert feed_resp.status_code == 200
    feed_data = feed_resp.json()
    assert len(feed_data) >= 1
    assert all(f["severity"] == "HIGH" for f in feed_data)

def test_sentinel_rerun(client: TestClient):
    resp = client.post("/api/ingest", json={
        "request_id": "rerun-test",
        "method": "GET",
        "url": "https://api.example.com/data?file=../../../../etc/passwd",
        "status_code": 200,
    })
    req_id = resp.json()["id"]

    rerun_resp = client.post(f"/api/requests/{req_id}/audit/rerun")
    assert rerun_resp.status_code == 200
    assert rerun_resp.json()["total"] >= 1
