"""Trash rules.

- Deleting a note or folder sets `deleted_at`. A trashed folder takes its
  subfolders and notes with it; those record the folder in `trashed_with`.
- Only "top-level" items (trashed directly, `trashed_with` is None) appear in
  the trash list; restoring a folder restores everything trashed with it.
- Items older than RETENTION are deleted for good the next time the trash is
  looked at (or by `flask purge-trash`). Render's free tier has no cron.
"""

from datetime import timedelta

from ...extensions import db
from ...models import Folder, Note
from ...models.base import as_utc, iso, utcnow

RETENTION = timedelta(days=30)


def purge_expired(user_id: str | None = None) -> int:
    cutoff = utcnow() - RETENTION
    notes = Note.query.filter(
        Note.deleted_at.isnot(None), Note.deleted_at < cutoff, Note.trashed_with.is_(None)
    )
    folders = Folder.query.filter(
        Folder.deleted_at.isnot(None), Folder.deleted_at < cutoff, Folder.trashed_with.is_(None)
    )
    if user_id:
        notes = notes.filter(Note.user_id == user_id)
        folders = folders.filter(Folder.user_id == user_id)
    removed = notes.delete(synchronize_session=False)
    # Deleting a folder row cascades to its subfolders and notes in the database.
    removed += folders.delete(synchronize_session=False)
    db.session.commit()
    # Images no longer used by any note, version or template go too.
    from ..attachments.service import purge_orphans

    removed += purge_orphans(user_id)
    return removed


def expires_at(deleted_at) -> str:
    return iso(as_utc(deleted_at) + RETENTION)
