"""
TraceForge - Database Models
SQLModel models for SQLite storage
"""

from datetime import datetime, UTC
from typing import Optional
from sqlmodel import Field, SQLModel, Column
from sqlalchemy import Text
import json


class CapturedRequest(SQLModel, table=True):
    """Represents a single captured HTTP request/response pair."""

    __tablename__ = "captured_requests"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Identity
    request_id: str = Field(index=True, unique=True)  # UUID from extension
    tab_id: Optional[int] = Field(default=None, index=True)
    tab_url: Optional[str] = Field(default=None)
    tab_title: Optional[str] = Field(default=None)

    # Request fields
    method: str = Field(index=True)
    url: str = Field(sa_column=Column(Text))
    domain: Optional[str] = Field(default=None, index=True)
    path: Optional[str] = Field(sa_column=Column(Text, nullable=True))
    query_params: Optional[str] = Field(default=None, sa_column=Column(Text))
    request_headers: Optional[str] = Field(default=None, sa_column=Column(Text))
    request_body: Optional[str] = Field(default=None, sa_column=Column(Text))
    resource_type: Optional[str] = Field(default=None)

    # Response fields
    status_code: Optional[int] = Field(default=None, index=True)
    status_text: Optional[str] = Field(default=None)
    response_headers: Optional[str] = Field(default=None, sa_column=Column(Text))
    response_body: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Timing & Size
    duration_ms: Optional[float] = Field(default=None)
    request_size: Optional[int] = Field(default=None)
    response_size: Optional[int] = Field(default=None)

    # Metadata
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    action_label: Optional[str] = Field(default=None)
    action_batch_id: Optional[str] = Field(default=None, index=True)
    has_error: bool = Field(default=False, index=True)
    is_slow: bool = Field(default=False, index=True)
    was_redacted: bool = Field(default=False)

    # Sentinel audit summary (denormalised for fast filtering)
    audit_high:   int = Field(default=0, index=True)
    audit_medium: int = Field(default=0)
    audit_low:    int = Field(default=0)
    audit_grade:  Optional[str] = Field(default=None, index=True)


class AuditFinding(SQLModel, table=True):
    """One individual security/performance finding attached to a captured request."""

    __tablename__ = "audit_findings"

    id: Optional[int] = Field(default=None, primary_key=True)

    # FK-like reference (no FK constraint to keep SQLite simple)
    captured_request_id: int = Field(index=True)

    # Finding fields (mirrors sentinel.run_audit output)
    rule_id:     str = Field(index=True)          # e.g. "AUTH-001"
    category:    str = Field(index=True)          # AUTH | LEAK | INJECT | NET | PERF
    severity:    str = Field(index=True)          # HIGH | MEDIUM | LOW | INFO
    title:       str = Field(sa_column=Column(Text))
    description: str = Field(sa_column=Column(Text))
    evidence:    Optional[str] = Field(default=None, sa_column=Column(Text))
    remediation: Optional[str] = Field(default=None, sa_column=Column(Text))

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class MockRule(SQLModel, table=True):
    """A live mock/override rule that intercepts matching requests."""

    __tablename__ = "mock_rules"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    is_active: bool = Field(default=True, index=True)

    match_method: Optional[str] = Field(default=None)
    match_url_pattern: str
    match_url_is_regex: bool = Field(default=False)

    override_status_code: int = Field(default=200)
    override_status_text: Optional[str] = Field(default="OK")
    override_headers: Optional[str] = Field(default=None, sa_column=Column(Text))
    override_body: Optional[str] = Field(default=None, sa_column=Column(Text))

    simulated_delay_ms: int = Field(default=0)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
