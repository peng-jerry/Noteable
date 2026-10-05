"""Reusable marshmallow fields and validators."""

import re

from marshmallow import ValidationError, fields, validate

PASSWORD_MIN = 8
PASSWORD_MAX = 128


class TrimmedString(fields.String):
    """A string field that strips surrounding whitespace on load."""

    def _deserialize(self, value, attr, data, **kwargs):
        result = super()._deserialize(value, attr, data, **kwargs)
        return result.strip() if isinstance(result, str) else result


def validate_password(value: str) -> None:
    if len(value) < PASSWORD_MIN:
        raise ValidationError(f"Password must be at least {PASSWORD_MIN} characters.")
    if len(value) > PASSWORD_MAX:
        raise ValidationError(f"Password must be at most {PASSWORD_MAX} characters.")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValidationError("Password must contain at least one letter and one number.")


not_blank = validate.Length(min=1, error="This field cannot be blank.")
