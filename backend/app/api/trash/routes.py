"""Trash endpoints, mounted at /api/v1/trash. All require an access token.

GET    /                          trashed notes and folders (expired ones are purged first)
GET    /notes/<id>                a trashed note, read-only, to preview before restoring
POST   /notes/<id>/restore        restore a note (to Unfiled if its folder is gone)
POST   /folders/<id>/restore      restore a folder and everything trashed with it
DELETE /notes/<id>                delete a trashed note permanently
DELETE /folders/<id>              delete a trashed folder and its contents permanently
DELETE /                          empty the trash
GET    /count                     how many items are in the trash (sidebar badge)
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from ...common.auth import current_user
from ...errors import NotFoundError
from ...extensions import db
from ...models import Folder, Note
from ...models.base import iso
from ..folders.service import MAX_DEPTH, active_folders, ancestors, folder_map
from ..notes.service import get_owned_note, top_position
from .service import RETENTION, expires_at, purge_expired

bp = Blueprint("trash", __name__, url_prefix="/trash")


def _get_trashed_folder(user_id: str, folder_id: str) -> Folder:
    folder = Folder.query.filter(
        Folder.id == folder_id,
        Folder.user_id == user_id,
        Folder.deleted_at.isnot(None),
        Folder.trashed_with.is_(None),
    ).first()
    if folder is None:
        raise NotFoundError("Folder not found in the trash.", code="folder_not_found")
    return folder


def _location(folder_id: str | None, active: dict) -> str | None:
    """'School / 15-113' for an active folder, else None."""
    if folder_id is None or folder_id not in active:
        return None
    folder = active[folder_id]
    return " / ".join(f.name for f in [*ancestors(folder, active), folder])


@bp.get("")
@jwt_required()
def list_trash():
    user = current_user()
    purge_expired(user.id)
    active = folder_map(user.id)
    items = []

    folders = Folder.query.filter(
        Folder.user_id == user.id, Folder.deleted_at.isnot(None), Folder.trashed_with.is_(None)
    ).all()
    for folder in folders:
        items.append(
            {
                "type": "folder",
                "id": folder.id,
                "name": folder.name,
                "location": _location(folder.parent_id, active),
                "contains": {
                    "folders": Folder.query.filter_by(trashed_with=folder.id).count(),
                    "notes": Note.query.filter_by(trashed_with=folder.id).count(),
                },
                "deleted_at": iso(folder.deleted_at),
                "expires_at": expires_at(folder.deleted_at),
            }
        )

    notes = Note.query.filter(
        Note.user_id == user.id, Note.deleted_at.isnot(None), Note.trashed_with.is_(None)
    ).all()
    for note in notes:
        items.append(
            {
                "type": "note",
                "id": note.id,
                "title": note.title,
                "excerpt": note.excerpt,
                "location": _location(note.folder_id, active),
                "deleted_at": iso(note.deleted_at),
                "expires_at": expires_at(note.deleted_at),
            }
        )

    items.sort(key=lambda i: i["deleted_at"], reverse=True)
    return jsonify({"items": items, "retention_days": RETENTION.days})


@bp.get("/notes/<note_id>")
@jwt_required()
def get_trashed_note(note_id):
    note = get_owned_note(current_user().id, note_id, trashed=True)
    return jsonify({"note": note.to_dict()})


@bp.post("/notes/<note_id>/restore")
@jwt_required()
def restore_note(note_id):
    user = current_user()
    note = get_owned_note(user.id, note_id, trashed=True)
    if note.folder_id and not active_folders(user.id).filter_by(id=note.folder_id).first():
        note.folder_id = None  # its folder is gone or still in the trash
    note.position = top_position(user.id, note.folder_id)
    note.deleted_at = None
    note.trashed_with = None
    db.session.commit()
    return jsonify({"note": note.to_dict()})


@bp.post("/folders/<folder_id>/restore")
@jwt_required()
def restore_folder(folder_id):
    user = current_user()
    folder = _get_trashed_folder(user.id, folder_id)
    active = folder_map(user.id)

    # Back where it was if that parent still exists and depth allows; else top level.
    if folder.parent_id not in active:
        folder.parent_id = None
    else:
        parent_depth = len(ancestors(active[folder.parent_id], active)) + 1
        if parent_depth + _height(folder) > MAX_DEPTH:
            folder.parent_id = None

    folder.name = _free_name(user.id, folder.name, folder.parent_id)
    folder.deleted_at = None
    Folder.query.filter_by(trashed_with=folder.id).update(
        {Folder.deleted_at: None, Folder.trashed_with: None}, synchronize_session=False
    )
    Note.query.filter_by(trashed_with=folder.id).update(
        {Note.deleted_at: None, Note.trashed_with: None}, synchronize_session=False
    )
    db.session.commit()
    return jsonify({"folder": folder.to_dict()})


def _height(folder: Folder) -> int:
    """Depth of the subtree trashed together with this folder (1 = no subfolders)."""
    members = Folder.query.filter_by(trashed_with=folder.id).all()
    children = {}
    for f in members:
        children.setdefault(f.parent_id, []).append(f.id)

    def height(fid):
        return 1 + max((height(c) for c in children.get(fid, [])), default=0)

    return height(folder.id)


def _free_name(user_id: str, name: str, parent_id: str | None) -> str:
    """The folder's name, or 'Name (restored)' etc. if a sibling now has it."""
    siblings = {
        n.lower()
        for (n,) in active_folders(user_id)
        .filter(Folder.parent_id.is_(None) if parent_id is None else Folder.parent_id == parent_id)
        .with_entities(Folder.name)
        .all()
    }
    candidate, n = name, 1
    while candidate.lower() in siblings:
        suffix = " (restored)" if n == 1 else f" (restored {n})"
        candidate = name[: 100 - len(suffix)] + suffix
        n += 1
    return candidate


@bp.delete("/notes/<note_id>")
@jwt_required()
def delete_note_forever(note_id):
    note = get_owned_note(current_user().id, note_id, trashed=True)
    db.session.delete(note)
    db.session.commit()
    return "", 204


@bp.delete("/folders/<folder_id>")
@jwt_required()
def delete_folder_forever(folder_id):
    folder = _get_trashed_folder(current_user().id, folder_id)
    db.session.delete(folder)  # cascades to everything inside
    db.session.commit()
    return "", 204


@bp.delete("")
@jwt_required()
def empty_trash():
    user = current_user()
    notes = Note.query.filter(Note.user_id == user.id, Note.deleted_at.isnot(None)).delete(
        synchronize_session=False
    )
    folders = Folder.query.filter(
        Folder.user_id == user.id, Folder.deleted_at.isnot(None), Folder.trashed_with.is_(None)
    ).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({"deleted": {"notes": notes, "folders": folders}})


@bp.get("/count")
@jwt_required()
def trash_count():
    user = current_user()
    notes = (
        db.session.query(func.count(Note.id))
        .filter(Note.user_id == user.id, Note.deleted_at.isnot(None), Note.trashed_with.is_(None))
        .scalar()
    )
    folders = (
        db.session.query(func.count(Folder.id))
        .filter(Folder.user_id == user.id, Folder.deleted_at.isnot(None), Folder.trashed_with.is_(None))
        .scalar()
    )
    return jsonify({"count": notes + folders})
