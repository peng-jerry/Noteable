from marshmallow import Schema, fields, validate

from ...common.validators import TrimmedString

name_rules = validate.Length(min=1, max=100, error="Folder name must be 1–100 characters.")


class FolderCreateSchema(Schema):
    name = TrimmedString(required=True, validate=name_rules)
    # null / omitted = top-level folder
    parent_id = fields.String(allow_none=True, load_default=None)


class FolderUpdateSchema(Schema):
    name = TrimmedString(validate=name_rules)
    # Set to null to move the folder to the top level.
    parent_id = fields.String(allow_none=True)
