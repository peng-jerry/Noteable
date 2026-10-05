"""Tag endpoints, mounted at /api/v1/tags. All require an access token.

GET    /        every tag with how many (non-trashed) notes use it
POST   /        create a tag: { name, color? }
PATCH  /<id>    rename and/or recolour
DELETE /<id>    delete a tag (it's removed from every note; the notes stay)

Notes get tags through PATCH /notes/<id> { "tags": ["name", ...] }, which
creates any tags that don't exist yet.
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from marshmallow import Schema, fields, validate
from sqlalchemy import func

from ...common.auth import current_user
from ...common.request import load_body
from ...errors import ConflictError, NotFoundError
from ...extensions import db
from ...models import TAG_COLORS, Note, Tag, note_tags
from ..notes.service import clean_tag_name

bp = Blueprint("tags", __name__, url_prefix="/tags")


class TagSchema(Schema):
    name = fields.String(required=True)
    color = fields.String(validate=validate.OneOf(TAG_COLORS))


def _get_tag(user_id: str, tag_id: str) -> Tag:
    tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    if tag is None:
        raise NotFoundError("Tag not found.", code="tag_not_found")
    return tag


def _ensure_unique(user_id: str, name: str, exclude_id: str | None = None) -> None:
    query = Tag.query.filter(Tag.user_id == user_id, Tag.name_key == name.lower())
    if exclude_id:
        query = query.filter(Tag.id != exclude_id)
    if query.first():
        raise ConflictError(
            f'A tag named "{name}" already exists.',
            code="tag_name_taken",
            details={"name": ["A tag with this name already exists."]},
        )


@bp.get("")
@jwt_required()
def list_tags():
    user = current_user()
    counts = dict(
        db.session.query(note_tags.c.tag_id, func.count(Note.id))
        .join(Note, Note.id == note_tags.c.note_id)
        .filter(Note.user_id == user.id, Note.deleted_at.is_(None))
        .group_by(note_tags.c.tag_id)
        .all()
    )
    tags = Tag.query.filter_by(user_id=user.id).order_by(Tag.name_key).all()
    return jsonify({"tags": [t.to_dict(counts.get(t.id, 0)) for t in tags], "colors": list(TAG_COLORS)})


@bp.post("")
@jwt_required()
def create_tag():
    user = current_user()
    data = load_body(TagSchema())
    name = clean_tag_name(data["name"])
    _ensure_unique(user.id, name)
    count = Tag.query.filter_by(user_id=user.id).count()
    tag = Tag(user_id=user.id, color=data.get("color") or TAG_COLORS[count % len(TAG_COLORS)])
    tag.set_name(name)
    db.session.add(tag)
    db.session.commit()
    return jsonify({"tag": tag.to_dict(0)}), 201


@bp.patch("/<tag_id>")
@jwt_required()
def update_tag(tag_id):
    user = current_user()
    tag = _get_tag(user.id, tag_id)
    data = load_body(TagSchema(), partial=True)
    if "name" in data:
        name = clean_tag_name(data["name"])
        _ensure_unique(user.id, name, exclude_id=tag.id)
        tag.set_name(name)
    if "color" in data:
        tag.color = data["color"]
    db.session.commit()
    return jsonify({"tag": tag.to_dict()})


@bp.delete("/<tag_id>")
@jwt_required()
def delete_tag(tag_id):
    tag = _get_tag(current_user().id, tag_id)
    db.session.delete(tag)
    db.session.commit()
    return "", 204
