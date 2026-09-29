"""
TraceForge - Tests for Secret Redaction Engine
"""

import pytest
from app.core.redactor import redact_headers, redact_body, redact_body_string, redact_request


class TestRedactHeaders:
    def test_redacts_authorization(self):
        headers = {"Authorization": "Bearer token123", "Content-Type": "application/json"}
        redacted, was_redacted = redact_headers(headers)
        assert redacted["Authorization"] == "[REDACTED]"
        assert redacted["Content-Type"] == "application/json"
        assert was_redacted is True

    def test_redacts_cookie(self):
        headers = {"Cookie": "session=abc123; csrf=xyz"}
        redacted, was_redacted = redact_headers(headers)
        assert redacted["Cookie"] == "[REDACTED]"
        assert was_redacted is True

    def test_redacts_x_api_key(self):
        headers = {"X-Api-Key": "secret_key_here"}
        redacted, was_redacted = redact_headers(headers)
        assert redacted["X-Api-Key"] == "[REDACTED]"
        assert was_redacted is True

    def test_safe_headers_pass_through(self):
        headers = {"Content-Type": "application/json", "Accept": "*/*"}
        redacted, was_redacted = redact_headers(headers)
        assert redacted == headers
        assert was_redacted is False

    def test_empty_headers(self):
        redacted, was_redacted = redact_headers({})
        assert redacted == {}
        assert was_redacted is False

    def test_none_headers(self):
        redacted, was_redacted = redact_headers(None)
        assert redacted == {}
        assert was_redacted is False


class TestRedactBody:
    def test_redacts_password_key(self):
        body = {"username": "mohit", "password": "supersecret"}
        redacted, was_redacted = redact_body(body)
        assert redacted["password"] == "[REDACTED]"
        assert redacted["username"] == "mohit"
        assert was_redacted is True

    def test_redacts_nested_token(self):
        body = {"user": {"name": "Mohit", "access_token": "tok_abc"}}
        redacted, was_redacted = redact_body(body)
        assert redacted["user"]["access_token"] == "[REDACTED]"
        assert redacted["user"]["name"] == "Mohit"
        assert was_redacted is True

    def test_redacts_in_list(self):
        body = [{"password": "s3cr3t"}, {"name": "safe"}]
        redacted, was_redacted = redact_body(body)
        assert redacted[0]["password"] == "[REDACTED]"
        assert redacted[1]["name"] == "safe"
        assert was_redacted is True

    def test_safe_body_passes_through(self):
        body = {"name": "Mohit", "email": "mohit@example.com", "age": 30}
        redacted, was_redacted = redact_body(body)
        assert redacted == body
        assert was_redacted is False


class TestRedactBodyString:
    def test_redacts_json_string(self):
        import json
        body_str = '{"username": "mohit", "password": "secret123"}'
        redacted, was_redacted = redact_body_string(body_str)
        parsed = json.loads(redacted)
        assert parsed["password"] == "[REDACTED]"
        assert was_redacted is True

    def test_passes_through_non_json(self):
        body_str = "raw plain text body"
        redacted, was_redacted = redact_body_string(body_str)
        assert redacted == body_str
        assert was_redacted is False

    def test_redacts_form_encoded_password(self):
        body_str = "username=mohit&password=supersecret&remember=true"
        redacted, was_redacted = redact_body_string(body_str)
        assert "password=[REDACTED]" in redacted
        assert "username=mohit" in redacted
        assert was_redacted is True

    def test_empty_body(self):
        redacted, was_redacted = redact_body_string(None)
        assert redacted is None
        assert was_redacted is False


class TestFullRedactRequest:
    def test_full_redaction_pipeline(self):
        result = redact_request(
            request_headers={"Authorization": "Bearer abc", "Content-Type": "application/json"},
            request_body='{"email": "test@example.com", "password": "s3cr3t"}',
            response_headers={"Set-Cookie": "session=xyz; HttpOnly"},
            response_body='{"access_token": "tok_abc", "user_id": 123}',
        )

        import json
        assert result["request_headers"]["Authorization"] == "[REDACTED]"
        assert result["response_headers"]["Set-Cookie"] == "[REDACTED]"
        assert json.loads(result["request_body"])["password"] == "[REDACTED]"
        assert json.loads(result["response_body"])["access_token"] == "[REDACTED]"
        assert result["was_redacted"] is True
