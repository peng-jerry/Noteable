from marshmallow import Schema, fields, post_load, validate

from ...common.pagination import PaginationQuerySchema
from ...common.validators import TrimmedString

MAX_CONTENT_LENGTH = 200_000  # characters of Markdown per note

title_rules = validate.Length(max=200, error="Title must be at most 200 characters.")
content_rules = validate.Length(
    max=MAX_CONTENT_LENGTH, error=f"Note content must be at most {MAX_CONTENT_LENGTH:,} characters."
)


class NoteCreateSchema(Schema):
    title = TrimmedString(load_default="", validate=title_rules)
    content = fields.String(load_default="", validate=content_rules)
    # null / omitted = unfiled
    folder_id = fields.String(allow_none=True, load_default=None)
    is_pinned = fields.Boolean(load_default=False)

    @post_load
    def default_title(self, data, **_kwargs):
        data["title"] = data["title"] or "Untitled"
        return data


class NoteUpdateSchema(Schema):
    title = TrimmedString(validate=title_rules)
    content = fields.String(validate=content_rules)
    folder_id = fields.String(allow_none=True)
    is_pinned = fields.Boolean()

    @post_load
    def default_title(self, data, **_kwargs):
        if "title" in data and not data["title"]:
            data["title"] = "Untitled"
        return data


class NoteListQuerySchema(PaginationQuerySchema):
    # A folder ID, or "unfiled" for notes not in any folder. Omit for all notes.
    folder_id = fields.String()
    # Case-insensitive search over title and content.
    q = TrimmedString(validate=validate.Length(max=200))
    pinned = fields.Boolean()
    sort = fields.String(
        load_default="updated_at",
        validate=validate.OneOf(["updated_at", "created_at", "title"]),
    )
    order = fields.String(load_default="desc", validate=validate.OneOf(["asc", "desc"]))
