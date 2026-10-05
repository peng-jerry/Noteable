from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from ..extensions import db


class NoteLink(db.Model):
    """A [[wiki link]] from one note to another.

    `target_key` is the lower-cased title written inside the brackets;
    `target_id` is the note it resolved to (None until a note with that title
    exists). Keeping the id lets renames rewrite the link text everywhere.
    """

    __tablename__ = "note_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    source_id: Mapped[str] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    target_id: Mapped[str | None] = mapped_column(
        ForeignKey("notes.id", ondelete="SET NULL"), index=True
    )
    target_key: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
