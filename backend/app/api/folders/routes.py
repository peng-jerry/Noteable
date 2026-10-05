"""Folder endpoints, mounted at /api/v1/folders. All require an access token.

GET    /             every folder the user owns (flat list; build the tree from parent_id)
POST   /             create a folder
GET    /<id>         one folder, with its breadcrumb path and direct children
PATCH  /<id>         rename and/or move a folder
PATCH  /<id>         also takes is_starred (starred folders are shown first in the sidebar)
DELETE /<id>         move a folder, its subfolders and their notes to the trash
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from ...common.auth import current_user
from ...common.request import load_body
from ...extensions import db
from ...models import Folder
from . import service
from .schemas import FolderCreateSchema, FolderUpdateSchema

bp = Blueprint("folders", __name__, url_prefix="/folders")


def _with_count(folder: Folder, counts: dict) -> dict:
    return {**folder.to_dict(), "note_count": counts.get(folder.id, 0)}


@bp.get("")
@jwt_required()
def list_folders():
    user = current_user()
    folders = service.active_folders(user.id).order_by(func.lower(Folder.name)).all()
    counts = service.note_counts(user.id)
    return jsonify(
        {
            "folders": [_with_count(f, counts) for f in folders],
            "unfiled_note_count": counts.get(None, 0),
        }
    )


@bp.post("")
@jwt_required()
def create_folder():
    user = current_user()
    data = load_body(FolderCreateSchema())
    parent = service.resolve_parent(user.id, data["parent_id"])
    service.ensure_valid_placement(None, parent, service.folder_map(user.id))
    service.ensure_unique_name(user.id, data["name"], data["parent_id"])

    folder = Folder(user_id=user.id, name=data["name"], parent_id=data["parent_id"])
    db.session.add(folder)
    db.session.commit()
    return jsonify({"folder": {**folder.to_dict(), "note_count": 0}}), 201


@bp.get("/<folder_id>")
@jwt_required()
def get_folder(folder_id):
    user = current_user()
    folder = service.get_owned_folder(user.id, folder_id)
    folders = service.folder_map(user.id)
    counts = service.note_counts(user.id)
    children = sorted(
        (f for f in folders.values() if f.parent_id == folder.id),
        key=lambda f: f.name.lower(),
    )
    return jsonify(
        {
            "folder": _with_count(folder, counts),
            "path": [{"id": f.id, "name": f.name} for f in service.ancestors(folder, folders)],
            "children": [_with_count(f, counts) for f in children],
        }
    )


@bp.patch("/<folder_id>")
@jwt_required()
def update_folder(folder_id):
    user = current_user()
    folder = service.get_owned_folder(user.id, folder_id)
    data = load_body(FolderUpdateSchema(), partial=True)

    new_parent_id = data.get("parent_id", folder.parent_id)
    new_name = data.get("name", folder.name)

    if "parent_id" in data:
        parent = service.resolve_parent(user.id, new_parent_id)
        service.ensure_valid_placement(folder, parent, service.folder_map(user.id))
    service.ensure_unique_name(user.id, new_name, new_parent_id, exclude_id=folder.id)

    folder.name = new_name
    folder.parent_id = new_parent_id
    if "is_starred" in data:
        folder.is_starred = data["is_starred"]
    db.session.commit()
    return jsonify({"folder": _with_count(folder, service.note_counts(user.id))})


@bp.delete("/<folder_id>")
@jwt_required()
def delete_folder(folder_id):
    user = current_user()
    folder = service.get_owned_folder(user.id, folder_id)
    counts = service.trash_folder(user.id, folder)
    db.session.commit()
    return jsonify({"trashed": counts})
