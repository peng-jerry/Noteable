from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from ..extensions import db
from .base import utcnow


class TokenBlocklist(db.Model):
    """JWT IDs (`jti`) revoked by logging out or changing a password.

    Rows only need to live until the token would have expired anyway;
    `purge_expired` clears out the old ones.
    """

    __tablename__ = "token_blocklist"

    id: Mapped[int] = mapped_column(primary_key=True)
    jti: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)
    token_type: Mapped[str] = mapped_column(String(10), nullable=False)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    @classmethod
    def is_revoked(cls, jti: str) -> bool:
        return db.session.query(cls.id).filter_by(jti=jti).first() is not None

    @classmethod
    def purge_expired(cls) -> int:
        deleted = cls.query.filter(cls.expires_at < utcnow()).delete()
        db.session.commit()
        return deleted
