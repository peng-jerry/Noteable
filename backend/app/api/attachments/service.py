"""Image validation and cleanup for attachments."""

import json
import re
from datetime import timedelta

from ...errors import APIError, ValidationError
from ...extensions import db
from ...models import Attachment, Note, NoteVersion, Template
from ...models.base import utcnow

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # after the browser has shrunk photos, most are < 500 KB
MAX_DOODLE_CHARS = 2_000_000
KINDS = ("photo", "doodle", "image")
ORPHAN_GRACE = timedelta(hours=24)  # time to save the note that references a new upload

ATTACHMENT_REF = re.compile(r"attachment:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")

# Raster formats only: no SVG, which can carry scripts.
_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (b"GIF87a", "image/gif", "gif"),
    (b"GIF89a", "image/gif", "gif"),
)
EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}


class PayloadTooLarge(APIError):
    status_code = 413
    code = "image_too_large"
    message = "Images can be at most 5 MB."


class UnsupportedImage(APIError):
    status_code = 415
    code = "unsupported_image"
    message = "Only PNG, JPEG, GIF and WebP images are supported."


def sniff_image(data: bytes) -> str:
    """The real image type from the file's first bytes (never trust the filename)."""
    for signature, mime, _ in _SIGNATURES:
        if data.startswith(signature):
            return mime
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    raise UnsupportedImage()


def read_upload(request) -> dict:
    """Validate a multipart upload: file, kind, optional width/height/doodle/note_id."""
    upload = request.files.get("file")
    if upload is None:
        raise ValidationError("Choose an image to upload.", details={"file": ["An image file is required."]})
    data = upload.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise PayloadTooLarge()
    if not data:
        raise ValidationError("The image is empty.", details={"file": ["The image is empty."]})
    mime = sniff_image(data)

    form = request.form
    kind = form.get("kind", "image")
    if kind not in KINDS:
        raise ValidationError("Unknown image kind.", details={"kind": [f"Must be one of {', '.join(KINDS)}."]})

    def dimension(name):
        raw = form.get(name)
        if raw in (None, ""):
            return None
        try:
            value = int(raw)
        except ValueError:
            value = 0
        if not 1 <= value <= 20_000:
            raise ValidationError("Invalid image size.", details={name: ["Must be a whole number of pixels."]})
        return value

    doodle = form.get("doodle")
    if doodle is not None:
        if len(doodle) > MAX_DOODLE_CHARS:
            raise PayloadTooLarge("That drawing has too many strokes to save.", code="doodle_too_large")
        try:
            parsed = json.loads(doodle)
        except ValueError:
            parsed = None
        if not isinstance(parsed, dict) or not isinstance(parsed.get("strokes"), list):
            raise ValidationError("Invalid drawing data.", details={"doodle": ["Expected an object with a strokes list."]})

    return {
        "data": data,
        "mime_type": mime,
        "size": len(data),
        "kind": kind,
        "width": dimension("width"),
        "height": dimension("height"),
        "doodle": doodle,
        "note_id": form.get("note_id") or None,
    }


def referenced_ids(text: str) -> set[str]:
    return set(ATTACHMENT_REF.findall(text or ""))


def purge_orphans(user_id: str | None = None) -> int:
    """Delete attachments (older than a day) that no note, version or template uses."""
    query = Attachment.query.filter(Attachment.created_at < utcnow() - ORPHAN_GRACE)
    if user_id:
        query = query.filter(Attachment.user_id == user_id)
    removed = 0
    for attachment in query.all():
        pattern = f"%attachment:{attachment.id}%"
        uid = attachment.user_id
        used = (
            db.session.query(Note.id).filter(Note.user_id == uid, Note.content.like(pattern)).first()
            or db.session.query(NoteVersion.id)
            .join(Note, Note.id == NoteVersion.note_id)
            .filter(Note.user_id == uid, NoteVersion.content.like(pattern))
            .first()
            or db.session.query(Template.id).filter(Template.user_id == uid, Template.content.like(pattern)).first()
        )
        if not used:
            db.session.delete(attachment)
            removed += 1
    db.session.commit()
    return removed
