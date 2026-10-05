from marshmallow import Schema, fields, post_load, validate

from ...common.pagination import PaginationQuerySchema
from ...common.validators import TrimmedString

MAX_CONTENT_LENGTH = 200_000  # characters of Markdown per note

title_rules = validate.Length(max=200, error="Title must be at most 200 characters.")
content_rules = validate.Length(
    max=MAX_CONTENT_LENGTH, error=f"Note content must be at most {MAX_CONTENT_LENGTH:,} characters."
)


def tags_field(**kwargs):
    """A list of tag names; unknown names are created on save."""
    return fields.List(fields.String(), validate=validate.Length(max=20), **kwargs)


class NoteCreateSchema(Schema):
    title = TrimmedString(load_default="", validate=title_rules)
    content = fields.String(load_default="", validate=content_rules)
    # null / omitted = unfiled
    folder_id = fields.String(allow_none=True, load_default=None)
    is_pinned = fields.Boolean(load_default=False)
    tags = tags_field(load_default=list)

    @post_load
    def default_title(self, data, **_kwargs):
        data["title"] = data["title"] or "Untitled"
        return data


class NoteUpdateSchema(Schema):
    title = TrimmedString(validate=title_rules)
    content = fields.String(validate=content_rules)
    folder_id = fields.String(allow_none=True)
    is_pinned = fields.Boolean()
    tags = tags_field()

    @post_load
    def default_title(self, data, **_kwargs):
        if "title" in data and not data["title"]:
            data["title"] = "Untitled"
        return data


class NoteListQuerySchema(PaginationQuerySchema):
    # A folder ID, or "unfiled" for notes not in any folder. Omit for all notes.
    folder_id = fields.String()
    # Search text. Supports tag:name / tag:"two words" filters and "quoted phrases".
    q = TrimmedString(validate=validate.Length(max=200))
    # Comma-separated tag IDs; a note must have all of them.
    tags = fields.String()
    pinned = fields.Boolean()
    sort = fields.String(
        load_default="updated_at",
        validate=validate.OneOf(["updated_at", "created_at", "title", "relevance", "position"]),
    )
    order = fields.String(load_default="desc", validate=validate.OneOf(["asc", "desc"]))


class ReorderSchema(Schema):
    folder_id = fields.String(allow_none=True, load_default=None)
    note_ids = fields.List(fields.String(), required=True, validate=validate.Length(min=1, max=500))


class VersionCreateSchema(Schema):
    label = TrimmedString(validate=validate.Length(max=100), load_default=None, allow_none=True)
