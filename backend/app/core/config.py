"""
TraceForge - Application Configuration
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    APP_NAME: str = "TraceForge"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 7890

    # Database
    DB_DIR: str = str(Path(__file__).parent.parent.parent / "data")
    DATABASE_URL: str = f"sqlite:///{Path(__file__).parent.parent.parent / 'data' / 'traceforge.db'}"

    # Security
    SLOW_REQUEST_THRESHOLD_MS: float = 2000.0   # Requests slower than this are flagged
    ERROR_STATUS_CODES: list[int] = [400, 401, 403, 404, 408, 429, 500, 502, 503, 504]

    # CORS (allow the React dev server on any common dev port)
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000",
        "chrome-extension://*",
    ]

    # Redaction
    SENSITIVE_HEADER_PATTERNS: list[str] = [
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "api-key",
        "x-auth-token",
        "access-token",
        "refresh-token",
        "client-secret",
        "x-access-token",
        "x-refresh-token",
        "x-client-secret",
        "proxy-authorization",
    ]

    SENSITIVE_BODY_KEYS: list[str] = [
        "password",
        "pass",
        "passwd",
        "secret",
        "token",
        "access_token",
        "refresh_token",
        "client_secret",
        "api_key",
        "apikey",
        "private_key",
        "credit_card",
        "card_number",
        "cvv",
        "ssn",
        "social_security",
    ]


settings = Settings()


# Ensure DB directory exists
Path(settings.DB_DIR).mkdir(parents=True, exist_ok=True)
