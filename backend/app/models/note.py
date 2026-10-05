from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import TimestampMixin, UUIDPrimaryKeyMixin, iso

EXCERPT_LENGTH = 160

note_tags = Table(
    "note_tags",
    db.Model.metadata,
    Column("note_id", ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class Note(UUIDPrimaryKeyMixin, TimestampMixin, db.Model):
    """A Markdown note. `folder_id` of None means the note is unfiled.

    Deleting a note moves it to the trash (`deleted_at` is set). If it was
    trashed because its folder was, `trashed_with` holds that folder's id so
    restoring the folder brings the note back too.
    """

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
    # Manual sort order within a folder (lower comes first).
    position: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    trashed_with: Mapped[str | None] = mapped_column(String(36), index=True)

    owner = relationship("User", back_populates="notes")
    folder = relationship("Folder", back_populates="notes")
    tags = relationship("Tag", secondary=note_tags, lazy="selectin", order_by="Tag.name_key")
    versions = relationship(
        "NoteVersion", back_populates="note", cascade="all, delete-orphan", passive_deletes=True
    )

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
            "position": self.position,
            "tags": [tag.to_brief() for tag in self.tags],
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }

    def to_dict(self) -> dict:
        data = self.to_summary()
        data["content"] = self.content
        data["deleted_at"] = iso(self.deleted_at)
        del data["excerpt"]
        return data

    def __repr__(self) -> str:
        return f"<Note {self.title!r}>"
