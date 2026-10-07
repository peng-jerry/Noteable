"""Import and export, mounted at /api/v1. All require an access token.

POST /import   { folder_id?, files: [{ path, content }] }
               Creates a note per .md/.txt file. Folders in `path`
               ("School/15-113/week1.md") are created inside `folder_id`
               (or at the top level), reusing existing folders with the same
               name. Optional YAML-style front matter (title, tags, pinned) is
               read and removed. The client unzips archives and sends files in
               batches, so this endpoint stays under the request size limit.
GET  /export   ?folder_id= or ?note_id=  → a .zip of .md files that keeps
               the folder structure (everything if neither is given). Each
               file starts with front matter so re-importing restores titles
               and tags. Images go in an `_images/` folder (doodles also get a
               `.doodle.json` with their strokes) and notes link to them by
               relative path; the frontend's importer reverses this.
"""

import io
import json
import re
import zipfile
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, send_file
from flask_jwt_extended import jwt_required
from marshmallow import Schema, fields, validate

from ...common.auth import current_user
from ...common.request import load_body
from ...extensions import db
from ...models import Attachment, Folder, Note
from ...models.base import iso
from ..folders.service import MAX_DEPTH, active_folders, ancestors, descendant_ids, folder_map, resolve_parent
from ..notes.schemas import MAX_CONTENT_LENGTH
from ..attachments.service import EXTENSIONS, referenced_ids
from ..notes.service import active_notes, get_or_create_tags, get_owned_note, refresh_links, top_position

bp = Blueprint("transfer", __name__)

IMPORT_EXTENSIONS = (".md", ".markdown", ".txt")
MAX_FILES_PER_REQUEST = 100


class ImportFileSchema(Schema):
    path = fields.String(required=True, validate=validate.Length(min=1, max=500))
    content = fields.String(required=True)


class ImportSchema(Schema):
    folder_id = fields.String(allow_none=True, load_default=None)
    files = fields.List(
        fields.Nested(ImportFileSchema), required=True, validate=validate.Length(min=1, max=MAX_FILES_PER_REQUEST)
    )


# ---------------------------------------------------------------- front matter

_FRONT_MATTER = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.S)


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        try:
            return json.loads(value) if value[0] == '"' else value[1:-1]
        except ValueError:
            return value[1:-1]
    return value


def split_front_matter(text: str) -> tuple[dict, str]:
    """Read a small YAML-like header (key: value, lists as [a, b] or '- a')."""
    match = _FRONT_MATTER.match(text)
    if not match or len(match.group(1)) > 4000:
        return {}, text
    meta, current_list = {}, None
    for line in match.group(1).splitlines():
        if current_list is not None and re.match(r"^\s*-\s+", line):
            meta[current_list].append(_unquote(re.sub(r"^\s*-\s+", "", line)))
            continue
        key, sep, value = line.partition(":")
        if not sep:
            continue
        key, value = key.strip().lower(), value.strip()
        current_list = None
        if value.startswith("[") and value.endswith("]"):
            meta[key] = [_unquote(v) for v in value[1:-1].split(",") if v.strip()]
        elif value == "":
            meta[key] = []
            current_list = key
        else:
            meta[key] = _unquote(value)
    return meta, text[match.end():].lstrip("\r\n")


def _title_for(meta: dict, body: str, filename: str) -> str:
    if isinstance(meta.get("title"), str) and meta["title"].strip():
        return meta["title"].strip()[:200]
    for line in body.splitlines():
        if line.strip():
            heading = re.match(r"^#\s+(.+?)\s*#*\s*$", line.strip())
            if heading:
                return heading.group(1)[:200]
            break
    stem = filename.rsplit(".", 1)[0].strip()
    return (stem or "Untitled")[:200]


def _as_tag_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(v) for v in value if str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [v for v in value.split(",") if v.strip()]
    return []


# ---------------------------------------------------------------- import


@bp.post("/import")
@jwt_required()
def import_files():
    user = current_user()
    data = load_body(ImportSchema())
    root = resolve_parent(user.id, data["folder_id"], field="folder_id")
    folders = folder_map(user.id)
    root_depth = 0 if root is None else len(ancestors(root, folders)) + 1

    folder_cache: dict[tuple, str | None] = {(): root.id if root else None}
    created_folders = 0
    created, skipped = [], []

    def folder_for(parts: tuple) -> str | None:
        nonlocal created_folders
        if parts in folder_cache:
            return folder_cache[parts]
        parent_id = folder_for(parts[:-1])
        name = parts[-1][:100]
        existing = (
            active_folders(user.id)
            .filter(Folder.parent_id.is_(None) if parent_id is None else Folder.parent_id == parent_id)
            .filter(db.func.lower(Folder.name) == name.lower())
            .first()
        )
        if existing is None:
            existing = Folder(user_id=user.id, parent_id=parent_id, name=name)
            db.session.add(existing)
            db.session.flush()
            created_folders += 1
        folder_cache[parts] = existing.id
        return existing.id

    for item in data["files"]:
        path = item["path"].replace("\\", "/")
        parts = [p.strip() for p in path.split("/") if p.strip() and p.strip() not in (".", "..")]
        if not parts:
            skipped.append({"path": path, "reason": "Empty file name."})
            continue
        filename, folder_parts = parts[-1], tuple(parts[:-1])
        if not filename.lower().endswith(IMPORT_EXTENSIONS):
            skipped.append({"path": path, "reason": "Only .md, .markdown and .txt files can be imported."})
            continue
        if len(item["content"]) > MAX_CONTENT_LENGTH:
            skipped.append({"path": path, "reason": f"Longer than {MAX_CONTENT_LENGTH:,} characters."})
            continue
        if root_depth + len(folder_parts) > MAX_DEPTH:
            skipped.append({"path": path, "reason": f"Folders can be nested at most {MAX_DEPTH} levels deep."})
            continue

        meta, body = split_front_matter(item["content"])
        folder_id = folder_for(folder_parts)
        note = Note(
            user_id=user.id,
            folder_id=folder_id,
            title=_title_for(meta, body, filename),
            content=body,
            is_pinned=str(meta.get("pinned", "")).lower() == "true",
            position=top_position(user.id, folder_id),
        )
        try:
            note.tags = get_or_create_tags(user.id, _as_tag_list(meta.get("tags")))
        except Exception:  # noqa: BLE001 - bad tags shouldn't block the import
            note.tags = []
        db.session.add(note)
        db.session.flush()
        refresh_links(note)
        created.append({"id": note.id, "title": note.title, "folder_id": folder_id})

    db.session.commit()
    return (
        jsonify(
            {
                "created": {"notes": len(created), "folders": created_folders},
                "notes": created,
                "skipped": skipped,
            }
        ),
        201 if created else 200,
    )


# ---------------------------------------------------------------- export

_UNSAFE = re.compile(r'[\\/:*?"<>|\x00-\x1f]+')


def safe_name(name: str, fallback: str = "Untitled") -> str:
    cleaned = _UNSAFE.sub("-", name).strip().strip(".").strip()
    return (cleaned or fallback)[:100]


IMAGES_DIR = "_images"


def image_name(attachment: Attachment) -> str:
    return f"{attachment.id}.{EXTENSIONS.get(attachment.mime_type, 'img')}"


def note_file(note: Note, image_paths: dict[str, str] | None = None, depth: int = 0) -> str:
    """The note as Markdown with front matter; attachment: links become relative paths."""
    content = note.content
    if image_paths:
        prefix = "../" * depth

        def relink(match):
            name = image_paths.get(match.group(1))
            return f"{prefix}{IMAGES_DIR}/{name}" if name else match.group(0)

        content = re.sub(r"attachment:([0-9a-f-]{36})", relink, content)
    lines = ["---", f"title: {json.dumps(note.title, ensure_ascii=False)}"]
    if note.tags:
        lines.append("tags: [" + ", ".join(json.dumps(t.name, ensure_ascii=False) for t in note.tags) + "]")
    if note.is_pinned:
        lines.append("pinned: true")
    lines += [f"created: {iso(note.created_at)}", f"updated: {iso(note.updated_at)}", "---", ""]
    return "\n".join(lines) + content


@bp.get("/export")
@jwt_required()
def export_zip():
    user = current_user()
    folders = folder_map(user.id)
    folder_id = request.args.get("folder_id") or None
    note_id = request.args.get("note_id") or None

    if note_id:
        note = get_owned_note(user.id, note_id)
        included, notes, base_depth = set(), [note], 0
        archive_name = f"{safe_name(note.title)}.zip"
    elif folder_id:
        root = resolve_parent(user.id, folder_id, field="folder_id")
        included = {root.id} | descendant_ids(root.id, folders)
        notes = active_notes(user.id).filter(Note.folder_id.in_(included)).all()
        base_depth = len(ancestors(root, folders))  # keep the exported folder itself
        archive_name = f"{safe_name(root.name)}.zip"
    else:
        included = set(folders)
        notes = active_notes(user.id).all()
        base_depth = 0
        archive_name = f"Noteable export {datetime.now(timezone.utc):%Y-%m-%d}.zip"

    def dir_path(fid: str | None) -> str:
        if fid is None:
            return ""
        chain = [*ancestors(folders[fid], folders), folders[fid]][base_depth:]
        return "/".join(safe_name(f.name, "Folder") for f in chain) + "/"

    def folder_of(note: Note) -> str | None:
        return None if note_id else note.folder_id

    # Images used by the exported notes.
    wanted = set().union(*(referenced_ids(n.content) for n in notes)) if notes else set()
    images = (
        Attachment.query.filter(Attachment.user_id == user.id, Attachment.id.in_(wanted)).all() if wanted else []
    )
    image_paths = {a.id: image_name(a) for a in images}

    buffer = io.BytesIO()
    used: set[str] = set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for fid in sorted(included, key=lambda i: dir_path(i)):
            archive.writestr(zipfile.ZipInfo(dir_path(fid)), "")  # keeps empty folders
        for note in sorted(notes, key=lambda n: (dir_path(folder_of(n)), n.title.lower())):
            directory = dir_path(folder_of(note))
            stem = directory + safe_name(note.title)
            path, n = f"{stem}.md", 2
            while path.lower() in used:
                path, n = f"{stem} ({n}).md", n + 1
            used.add(path.lower())
            archive.writestr(path, note_file(note, image_paths, depth=directory.count("/")))
        for attachment in images:
            archive.writestr(f"{IMAGES_DIR}/{image_paths[attachment.id]}", attachment.data)
            if attachment.doodle:
                archive.writestr(f"{IMAGES_DIR}/{attachment.id}.doodle.json", attachment.doodle)
    buffer.seek(0)
    return send_file(buffer, mimetype="application/zip", as_attachment=True, download_name=archive_name)
