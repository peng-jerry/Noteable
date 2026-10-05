"""Application configuration.

Settings are read from environment variables (a local `.env` file is loaded
automatically in development). Pick a config class with `APP_ENV`:
`development` (default), `testing`, or `production`.
"""

import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()


def _normalize_database_url(url: str) -> str:
    """Make hosted Postgres URLs usable by SQLAlchemy + psycopg 3.

    Providers (Render, Neon, Supabase, Heroku) often hand out URLs starting
    with `postgres://` or a bare `postgresql://`, which SQLAlchemy would map
    to the wrong (or a missing) driver.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _split_csv(value: str) -> list[str]:
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


class Config:
    APP_NAME = "Noteable API"
    API_VERSION = "v1"

    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-me")

    SQLALCHEMY_DATABASE_URI = _normalize_database_url(
        os.getenv("DATABASE_URL", "sqlite:///noteable-dev.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Hosted Postgres (especially Neon) closes idle connections; pre-ping
    # detects dead ones instead of failing the next request.
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 280}

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret-change-me-32-bytes!")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.getenv("JWT_ACCESS_MINUTES", "15"))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=int(os.getenv("JWT_REFRESH_DAYS", "30"))
    )
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_ERROR_MESSAGE_KEY = "message"

    # Comma-separated list of frontend origins allowed to call the API.
    CORS_ORIGINS = _split_csv(
        os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    )

    # Reject request bodies larger than this (bytes) with a 413.
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(1024 * 1024)))

    RATELIMIT_ENABLED = os.getenv("RATELIMIT_ENABLED", "true").lower() == "true"
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "300 per minute")
    RATELIMIT_AUTH = os.getenv("RATELIMIT_AUTH", "10 per minute")

    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

    # How many reverse proxies sit in front of the app (Render: 1). Used to
    # read the real client IP from X-Forwarded-For for rate limiting.
    PROXY_HOPS = int(os.getenv("PROXY_HOPS", "1"))


class DevelopmentConfig(Config):
    DEBUG = True


class TestingConfig(Config):
    TESTING = True
    # Defaults to in-memory SQLite; set TEST_DATABASE_URL to run against Postgres.
    SQLALCHEMY_DATABASE_URI = _normalize_database_url(
        os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
    )
    SQLALCHEMY_ENGINE_OPTIONS = {}
    RATELIMIT_ENABLED = False
    JWT_SECRET_KEY = "test-jwt-secret-that-is-long-enough"


class ProductionConfig(Config):
    DEBUG = False

    REQUIRED_ENV = ("SECRET_KEY", "JWT_SECRET_KEY", "DATABASE_URL", "CORS_ORIGINS")

    @classmethod
    def validate(cls) -> None:
        """Fail fast on startup rather than run with insecure defaults."""
        missing = [name for name in cls.REQUIRED_ENV if not os.getenv(name)]
        if missing:
            raise RuntimeError(
                "Missing required environment variables for production: "
                + ", ".join(missing)
            )


CONFIGS = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(name: str | None = None) -> type[Config]:
    name = (name or os.getenv("APP_ENV", "development")).lower()
    if name not in CONFIGS:
        raise RuntimeError(
            f"Unknown APP_ENV '{name}'. Expected one of: {', '.join(CONFIGS)}"
        )
    config = CONFIGS[name]
    if config is ProductionConfig:
        ProductionConfig.validate()
    return config
