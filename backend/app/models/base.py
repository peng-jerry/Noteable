"""Shared column mixins for models."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


def as_utc(dt: datetime) -> datetime:
    """SQLite drops tzinfo on read; every stored datetime is UTC, so re-add it."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def iso(dt: datetime | None) -> str | None:
    """Serialise a datetime as ISO-8601 UTC, e.g. 2026-10-04T12:00:00Z."""
    if dt is None:
        return None
    return as_utc(dt).isoformat().replace("+00:00", "Z")


class UUIDPrimaryKeyMixin:
    # UUIDs (rather than auto-increment ints) can't be guessed and stay safe
    # to expose later in share links. Stored as strings so they work the same
    # on SQLite and Postgres.
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )
