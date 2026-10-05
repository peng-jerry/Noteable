from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from .base import TimestampMixin, UUIDPrimaryKeyMixin, iso


class User(UUIDPrimaryKeyMixin, TimestampMixin, db.Model):
    """An account. Shared across every feature of the wider site, so
    feature-specific data belongs in its own tables that reference `users.id`,
    not as extra columns here."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set on password change; any token issued before this is rejected.
    tokens_valid_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    folders = relationship(
        "Folder", back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )
    notes = relationship(
        "Note", back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "display_name": self.display_name,
            "created_at": iso(self.created_at),
            "last_login_at": iso(self.last_login_at),
        }

    def __repr__(self) -> str:
        return f"<User {self.email}>"
