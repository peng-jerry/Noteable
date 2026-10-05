from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..extensions import db
from .base import TimestampMixin, UUIDPrimaryKeyMixin, iso

# Colour names, not hex values: the frontend maps each to a shade that works
# in both light and dark themes.
TAG_COLORS = ("sky", "indigo", "violet", "rose", "orange", "amber", "emerald", "teal", "slate")


class Tag(UUIDPrimaryKeyMixin, TimestampMixin, db.Model):
    """A user's tag. Names are unique per user, ignoring case (`name_key`)."""

    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name_key"),)

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    name_key: Mapped[str] = mapped_column(String(40), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="sky")

    def set_name(self, name: str) -> None:
        self.name = name
        self.name_key = name.lower()

    def to_brief(self) -> dict:
        return {"id": self.id, "name": self.name, "color": self.color}

    def to_dict(self, note_count: int | None = None) -> dict:
        data = {**self.to_brief(), "created_at": iso(self.created_at)}
        if note_count is not None:
            data["note_count"] = note_count
        return data
