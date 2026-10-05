from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import TimestampMixin, UUIDPrimaryKeyMixin, iso

EXCERPT_LENGTH = 160


class Note(UUIDPrimaryKeyMixin, TimestampMixin, db.Model):
    """A Markdown note. `folder_id` of None means the note is unfiled."""

    __tablename__ = "notes"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="Untitled")
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    owner = relationship("User", back_populates="notes")
    folder = relationship("Folder", back_populates="notes")

    @property
    def excerpt(self) -> str:
        text = " ".join(self.content.split())
        if len(text) <= EXCERPT_LENGTH:
            return text
        return text[:EXCERPT_LENGTH].rstrip() + "…"

    def to_summary(self) -> dict:
        """Lightweight form for list views (no full content)."""
        return {
            "id": self.id,
            "title": self.title,
            "excerpt": self.excerpt,
            "folder_id": self.folder_id,
            "is_pinned": self.is_pinned,
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }

    def to_dict(self) -> dict:
        data = self.to_summary()
        data["content"] = self.content
        del data["excerpt"]
        return data

    def __repr__(self) -> str:
        return f"<Note {self.title!r}>"
