from sqlalchemy import ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, deferred, mapped_column

from ..extensions import db
from .base import TimestampMixin, UUIDPrimaryKeyMixin, iso


class Attachment(UUIDPrimaryKeyMixin, TimestampMixin, db.Model):
    """An image (photo, upload or doodle) belonging to a user.

    Notes reference attachments in their Markdown as ![alt](attachment:<id>).
    Attachments belong to the user rather than one note, so duplicates, version
    history and templates can share them; unreferenced ones are purged (see
    api/attachments/service.py). For doodles, `doodle` holds the strokes so the
    drawing can be reopened and edited.
    """

    __tablename__ = "attachments"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    note_id: Mapped[str | None] = mapped_column(String(36))  # where it was first added (informational)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, default="image")
    mime_type: Mapped[str] = mapped_column(String(40), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    # Large columns load only when used, so listing/checking stays cheap.
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))
    doodle: Mapped[str | None] = deferred(mapped_column(Text))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "mime_type": self.mime_type,
            "size": self.size,
            "width": self.width,
            "height": self.height,
            "note_id": self.note_id,
            "markdown": f"![{self.kind.capitalize()}](attachment:{self.id})",
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }
