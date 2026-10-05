from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import UUIDPrimaryKeyMixin, iso, utcnow


class NoteVersion(UUIDPrimaryKeyMixin, db.Model):
    """A snapshot of a note's title and content.

    kind: "auto" (taken while editing, at most every few minutes), "manual"
    ("Save version"), or "restore" (taken just before restoring an older one).
    """

    __tablename__ = "note_versions"

    note_id: Mapped[str] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False, default="auto")
    label: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, index=True
    )

    note = relationship("Note", back_populates="versions")

    def to_dict(self, include_content: bool = False) -> dict:
        data = {
            "id": self.id,
            "note_id": self.note_id,
            "title": self.title,
            "kind": self.kind,
            "label": self.label,
            "words": len(self.content.split()),
            "created_at": iso(self.created_at),
        }
        if include_content:
            data["content"] = self.content
        return data
