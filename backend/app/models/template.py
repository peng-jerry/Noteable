from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..extensions import db
from .base import TimestampMixin, UUIDPrimaryKeyMixin, iso


class Template(UUIDPrimaryKeyMixin, TimestampMixin, db.Model):
    """A user-made note template. `title` and `content` may contain
    placeholders such as {{date}}, filled in by the client when used.
    Built-in templates live in code (app/api/templates/builtins.py)."""

    __tablename__ = "templates"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "title": self.title,
            "content": self.content,
            "builtin": False,
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }
