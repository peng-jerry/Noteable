"""Note endpoints, mounted at /api/v1/notes. All require an access token.

GET    /                              list notes (summaries): filter, search, sort, paginate
POST   /                              create a note
GET    /titles                        every note's id + title (link autocomplete)
POST   /reorder                       set the manual order of notes in a folder
GET    /<id>                          one note, with full Markdown content
PATCH  /<id>                          update title / content / folder / pinned / tags
DELETE /<id>                          move a note to the trash
POST   /<id>/duplicate                copy a note
GET    /<id>/backlinks                notes that [[link]] to this one
GET    /<id>/versions                 version history (newest first)
POST   /<id>/versions                 save a named version now
GET    /<id>/versions/<vid>           one version, with content
POST   /<id>/versions/<vid>/restore   restore a version (current text is saved first)
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from ...common.auth import current_user
from ...common.pagination import paginate
from ...common.request import load_body, load_query
from ...errors import NotFoundError, ValidationError
from ...extensions import db
from ...models import Note, NoteVersion, Tag
from ...models.base import utcnow
from ..folders.service import get_owned_folder, resolve_parent
from . import service
from .schemas import (
    NoteCreateSchema,
    NoteListQuerySchema,
    NoteUpdateSchema,
    ReorderSchema,
    VersionCreateSchema,
)

bp = Blueprint("notes", __name__, url_prefix="/notes")

UNFILED = "unfiled"


@bp.get("")
@jwt_required()
def list_notes():
    user = current_user()
    args = load_query(NoteListQuerySchema())
    query = service.active_notes(user.id)

    if "folder_id" in args:
        if args["folder_id"] == UNFILED:
            query = query.filter(Note.folder_id.is_(None))
        else:
            get_owned_folder(user.id, args["folder_id"])  # 404 if not theirs
            query = query.filter(Note.folder_id == args["folder_id"])

    for tag_id in filter(None, (args.get("tags") or "").split(",")):
        query = query.filter(Note.tags.any(Tag.id == tag_id.strip()))

    terms, tag_names = service.parse_search(args.get("q") or "")
    query, score = service.apply_search(query, terms, tag_names)

    if "pinned" in args:
        query = query.filter(Note.is_pinned.is_(args["pinned"]))

    sort, descending = args["sort"], args["order"] == "desc"
    if sort == "relevance" and score is None:
        sort, descending = "updated_at", True
    if sort == "relevance":
        order = [score.desc(), Note.updated_at.desc()]
    elif sort == "position":
        # Manual order ignores pinning so dragging always does what you see.
        order = [Note.position.asc(), Note.created_at.desc()]
    else:
        column = func.lower(Note.title) if sort == "title" else getattr(Note, sort)
        # Pinned notes always come first.
        order = [Note.is_pinned.desc(), column.desc() if descending else column.asc()]
    query = query.order_by(*order, Note.id)

    notes, pagination = paginate(query, args["page"], args["per_page"])
    summaries = []
    for note in notes:
        summary = note.to_summary()
        if terms:
            summary["excerpt"] = service.snippet(note.content, terms)
        summaries.append(summary)
    body = {"notes": summaries, "pagination": pagination}
    if args.get("q"):
        body["search"] = {"terms": terms, "tags": tag_names}
    return jsonify(body)


@bp.get("/titles")
@jwt_required()
def list_titles():
    notes = (
        service.active_notes(current_user().id)
        .with_entities(Note.id, Note.title, Note.folder_id)
        .order_by(Note.updated_at.desc())
        .limit(5000)
        .all()
    )
    return jsonify({"notes": [{"id": i, "title": t, "folder_id": f} for i, t, f in notes]})


@bp.post("")
@jwt_required()
def create_note():
    user = current_user()
    data = load_body(NoteCreateSchema(), required=False)
    resolve_parent(user.id, data["folder_id"], field="folder_id")
    tags = service.get_or_create_tags(user.id, data.pop("tags"))

    note = Note(user_id=user.id, position=service.top_position(user.id, data["folder_id"]), **data)
    note.tags = tags
    db.session.add(note)
    db.session.flush()
    service.refresh_links(note)
    service.claim_dangling_links(note)
    db.session.commit()
    return jsonify({"note": note.to_dict()}), 201


@bp.post("/reorder")
@jwt_required()
def reorder_notes():
    user = current_user()
    data = load_body(ReorderSchema())
    folder_id = data["folder_id"]
    if folder_id is not None:
        get_owned_folder(user.id, folder_id)

    folder_filter = Note.folder_id.is_(None) if folder_id is None else Note.folder_id == folder_id
    in_folder = (
        service.active_notes(user.id)
        .filter(folder_filter)
        .order_by(Note.position.asc(), Note.created_at.desc())
        .all()
    )
    by_id = {n.id: n for n in in_folder}
    requested = list(dict.fromkeys(data["note_ids"]))
    missing = [i for i in requested if i not in by_id]
    if missing:
        raise ValidationError(
            "Some of those notes aren't in this folder.",
            code="invalid_order",
            details={"note_ids": [f"Not in this folder: {', '.join(missing[:5])}"]},
        )
    ordered = [by_id[i] for i in requested] + [n for n in in_folder if n.id not in set(requested)]
    for index, note in enumerate(ordered):
        note.position = float(index)
    db.session.commit()
    return jsonify({"note_ids": [n.id for n in ordered]})


@bp.get("/<note_id>")
@jwt_required()
def get_note(note_id):
    note = service.get_owned_note(current_user().id, note_id)
    return jsonify({"note": note.to_dict()})


@bp.patch("/<note_id>")
@jwt_required()
def update_note(note_id):
    user = current_user()
    note = service.get_owned_note(user.id, note_id)
    data = load_body(NoteUpdateSchema(), partial=True)

    if "folder_id" in data and data["folder_id"] != note.folder_id:
        resolve_parent(user.id, data["folder_id"], field="folder_id")
        note.position = service.top_position(user.id, data["folder_id"])
    if "tags" in data:
        note.tags = service.get_or_create_tags(user.id, data.pop("tags"))

    title_changed = "title" in data and data["title"] != note.title
    content_changed = "content" in data and data["content"] != note.content
    if title_changed or content_changed:
        service.maybe_auto_snapshot(note)

    old_title = note.title
    for field, value in data.items():
        setattr(note, field, value)
    db.session.flush()

    links_updated = service.rename_links(note, old_title) if title_changed else 0
    if content_changed or title_changed:
        service.refresh_links(note)
    db.session.commit()
    return jsonify({"note": note.to_dict(), "links_updated": links_updated})


@bp.delete("/<note_id>")
@jwt_required()
def delete_note(note_id):
    """Move to the trash. Permanent deletion happens from /trash."""
    note = service.get_owned_note(current_user().id, note_id)
    note.deleted_at = utcnow()
    note.trashed_with = None
    db.session.commit()
    return "", 204


@bp.post("/<note_id>/duplicate")
@jwt_required()
def duplicate_note(note_id):
    user = current_user()
    source = service.get_owned_note(user.id, note_id)
    copy = Note(
        user_id=user.id,
        folder_id=source.folder_id,
        title=f"{source.title[:193]} (copy)",
        content=source.content,
        position=service.top_position(user.id, source.folder_id),
    )
    copy.tags = list(source.tags)
    db.session.add(copy)
    db.session.flush()
    service.refresh_links(copy)
    db.session.commit()
    return jsonify({"note": copy.to_dict()}), 201


@bp.get("/<note_id>/backlinks")
@jwt_required()
def get_backlinks(note_id):
    note = service.get_owned_note(current_user().id, note_id)
    items = [
        {
            "id": n.id,
            "title": n.title,
            "excerpt": service.snippet(n.content, [f"[[{note.title}"], radius=60),
            "updated_at": n.to_summary()["updated_at"],
        }
        for n in service.backlinks(note)
    ]
    return jsonify({"backlinks": items})


# ---------------------------------------------------------------- versions


def _get_version(note: Note, version_id: str) -> NoteVersion:
    version = NoteVersion.query.filter_by(id=version_id, note_id=note.id).first()
    if version is None:
        raise NotFoundError("Version not found.", code="version_not_found")
    return version


@bp.get("/<note_id>/versions")
@jwt_required()
def list_versions(note_id):
    note = service.get_owned_note(current_user().id, note_id)
    versions = NoteVersion.query.filter_by(note_id=note.id).order_by(NoteVersion.created_at.desc()).all()
    return jsonify({"versions": [v.to_dict() for v in versions], "limit": service.MAX_VERSIONS_PER_NOTE})


@bp.post("/<note_id>/versions")
@jwt_required()
def create_version(note_id):
    note = service.get_owned_note(current_user().id, note_id)
    data = load_body(VersionCreateSchema(), required=False)
    version = service.snapshot(note, "manual", data.get("label") or None)
    db.session.commit()
    return jsonify({"version": version.to_dict()}), 201


@bp.get("/<note_id>/versions/<version_id>")
@jwt_required()
def get_version(note_id, version_id):
    note = service.get_owned_note(current_user().id, note_id)
    return jsonify({"version": _get_version(note, version_id).to_dict(include_content=True)})


@bp.post("/<note_id>/versions/<version_id>/restore")
@jwt_required()
def restore_version(note_id, version_id):
    note = service.get_owned_note(current_user().id, note_id)
    version = _get_version(note, version_id)
    # Read the text first: at the version limit, the snapshot below prunes the oldest.
    title, content = version.title, version.content
    service.snapshot(note, "restore", "Before restoring an older version")

    old_title = note.title
    note.title, note.content = title, content
    db.session.flush()
    if note.title != old_title:
        service.rename_links(note, old_title)
    service.refresh_links(note)
    db.session.commit()
    return jsonify({"note": note.to_dict()})
