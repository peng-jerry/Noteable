"""Note endpoints, mounted at /api/v1/notes. All require an access token.

GET    /         list notes (summaries) with filtering, search, sort, pagination
POST   /         create a note
GET    /<id>     one note, with full Markdown content
PATCH  /<id>     update title / content / folder / pinned
DELETE /<id>     delete a note
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func, or_

from ...common.auth import current_user
from ...common.pagination import paginate
from ...common.request import load_body, load_query
from ...errors import NotFoundError
from ...extensions import db
from ...models import Note
from ..folders.service import get_owned_folder, resolve_parent
from .schemas import NoteCreateSchema, NoteListQuerySchema, NoteUpdateSchema

bp = Blueprint("notes", __name__, url_prefix="/notes")

UNFILED = "unfiled"


def _get_owned_note(user_id: str, note_id: str) -> Note:
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    if note is None:
        raise NotFoundError("Note not found.", code="note_not_found")
    return note


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@bp.get("")
@jwt_required()
def list_notes():
    user = current_user()
    args = load_query(NoteListQuerySchema())
    query = Note.query.filter(Note.user_id == user.id)

    if "folder_id" in args:
        if args["folder_id"] == UNFILED:
            query = query.filter(Note.folder_id.is_(None))
        else:
            get_owned_folder(user.id, args["folder_id"])  # 404 if not theirs
            query = query.filter(Note.folder_id == args["folder_id"])

    if args.get("q"):
        pattern = f"%{_escape_like(args['q'].lower())}%"
        query = query.filter(
            or_(
                func.lower(Note.title).like(pattern, escape="\\"),
                func.lower(Note.content).like(pattern, escape="\\"),
            )
        )

    if "pinned" in args:
        query = query.filter(Note.is_pinned.is_(args["pinned"]))

    sort_column = func.lower(Note.title) if args["sort"] == "title" else getattr(Note, args["sort"])
    sort_column = sort_column.asc() if args["order"] == "asc" else sort_column.desc()
    # Pinned notes always come first; id breaks ties so paging is stable.
    query = query.order_by(Note.is_pinned.desc(), sort_column, Note.id)

    notes, pagination = paginate(query, args["page"], args["per_page"])
    return jsonify({"notes": [n.to_summary() for n in notes], "pagination": pagination})


@bp.post("")
@jwt_required()
def create_note():
    user = current_user()
    data = load_body(NoteCreateSchema(), required=False)
    resolve_parent(user.id, data["folder_id"], field="folder_id")

    note = Note(user_id=user.id, **data)
    db.session.add(note)
    db.session.commit()
    return jsonify({"note": note.to_dict()}), 201


@bp.get("/<note_id>")
@jwt_required()
def get_note(note_id):
    note = _get_owned_note(current_user().id, note_id)
    return jsonify({"note": note.to_dict()})


@bp.patch("/<note_id>")
@jwt_required()
def update_note(note_id):
    user = current_user()
    note = _get_owned_note(user.id, note_id)
    data = load_body(NoteUpdateSchema(), partial=True)
    if "folder_id" in data:
        resolve_parent(user.id, data["folder_id"], field="folder_id")

    for field, value in data.items():
        setattr(note, field, value)
    db.session.commit()
    return jsonify({"note": note.to_dict()})


@bp.delete("/<note_id>")
@jwt_required()
def delete_note(note_id):
    note = _get_owned_note(current_user().id, note_id)
    db.session.delete(note)
    db.session.commit()
    return "", 204
