"""Image attachments, mounted at /api/v1/attachments. All require an access token.

POST   /              upload (multipart): file, kind (photo|doodle|image),
                      width?, height?, note_id?, doodle? (JSON strokes)
GET    /<id>          the image bytes (only for its owner). The frontend fetches
                      it with the token and shows it from a blob: URL.
GET    /<id>/doodle   the editable strokes of a doodle
PUT    /<id>          replace the image (and strokes) in place, e.g. after
                      editing a doodle; notes keep the same reference
DELETE /<id>          delete it

Notes reference images in Markdown as ![alt](attachment:<id>).
"""

import io
import json

from flask import Blueprint, jsonify, request, send_file
from flask_jwt_extended import jwt_required

from ...common.auth import current_user
from ...errors import NotFoundError, ValidationError
from ...extensions import db
from ...models import Attachment, Note
from .service import MAX_IMAGE_BYTES, read_upload

bp = Blueprint("attachments", __name__, url_prefix="/attachments")

# Images are bigger than any JSON body; allow a little over the image limit
# for the multipart wrapping and doodle strokes (this route only).
UPLOAD_LIMIT = MAX_IMAGE_BYTES + 3 * 1024 * 1024


def _get(user_id: str, attachment_id: str) -> Attachment:
    attachment = Attachment.query.filter_by(id=attachment_id, user_id=user_id).first()
    if attachment is None:
        raise NotFoundError("Image not found.", code="attachment_not_found")
    return attachment


def _check_note(user_id: str, note_id: str | None) -> None:
    if note_id and not Note.query.filter_by(id=note_id, user_id=user_id).first():
        raise ValidationError("Note not found.", details={"note_id": ["Note not found."]})


@bp.post("")
@jwt_required()
def upload():
    request.max_content_length = UPLOAD_LIMIT
    user = current_user()
    fields = read_upload(request)
    _check_note(user.id, fields["note_id"])
    attachment = Attachment(user_id=user.id, **fields)
    db.session.add(attachment)
    db.session.commit()
    return jsonify({"attachment": attachment.to_dict()}), 201


@bp.get("/<attachment_id>")
@jwt_required()
def download(attachment_id):
    attachment = _get(current_user().id, attachment_id)
    response = send_file(
        io.BytesIO(attachment.data),
        mimetype=attachment.mime_type,
        etag=f"{attachment.id}-{attachment.updated_at.timestamp()}",
        conditional=True,
        max_age=0,
    )
    response.headers["Cache-Control"] = "private, no-cache"
    response.headers["X-Attachment-Kind"] = attachment.kind
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@bp.get("/<attachment_id>/doodle")
@jwt_required()
def get_doodle(attachment_id):
    attachment = _get(current_user().id, attachment_id)
    if not attachment.doodle:
        raise NotFoundError("This image isn't an editable doodle.", code="not_a_doodle")
    return jsonify({"attachment": attachment.to_dict(), "doodle": json.loads(attachment.doodle)})


@bp.put("/<attachment_id>")
@jwt_required()
def replace(attachment_id):
    request.max_content_length = UPLOAD_LIMIT
    user = current_user()
    attachment = _get(user.id, attachment_id)
    fields = read_upload(request)
    fields.pop("note_id")
    for key, value in fields.items():
        if key == "doodle" and value is None:
            continue  # keep existing strokes unless new ones are sent
        setattr(attachment, key, value)
    db.session.commit()
    return jsonify({"attachment": attachment.to_dict()})


@bp.delete("/<attachment_id>")
@jwt_required()
def delete(attachment_id):
    attachment = _get(current_user().id, attachment_id)
    db.session.delete(attachment)
    db.session.commit()
    return "", 204
