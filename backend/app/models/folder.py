from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import TimestampMixin, UUIDPrimaryKeyMixin, iso


class Folder(UUIDPrimaryKeyMixin, TimestampMixin, db.Model):
    """A folder. `parent_id` of None means a top-level folder; folders nest
    up to MAX_DEPTH levels. Deleting a folder moves it, its subfolders and
    their notes to the trash (`deleted_at`); everything trashed along with it
    records the folder's id in `trashed_with`."""

    __tablename__ = "folders"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_starred: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    trashed_with: Mapped[str | None] = mapped_column(String(36), index=True)

    owner = relationship("User", back_populates="folders")
    parent = relationship("Folder", remote_side="Folder.id", back_populates="children")
    children = relationship(
        "Folder", back_populates="parent", cascade="all, delete-orphan", passive_deletes=True
    )
    notes = relationship(
        "Note", back_populates="folder", cascade="all, delete-orphan", passive_deletes=True
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "parent_id": self.parent_id,
            "is_starred": self.is_starred,
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }

    def __repr__(self) -> str:
        return f"<Folder {self.name!r}>"
