"""Helpers for reading and validating request input."""

from typing import Any

from flask import request
from marshmallow import Schema

from ..errors import BadRequestError, ValidationError


def get_json_body(*, required: bool = True) -> dict[str, Any]:
    """Return the request body as a dict, or raise a clear 400.

    `required=False` treats a missing/empty body as `{}` (useful for
    endpoints where every field is optional).
    """
    if not request.data:
        if required:
            raise BadRequestError(
                "A JSON request body is required.", code="missing_body"
            )
        return {}
    if not request.is_json:
        raise BadRequestError(
            "Request body must be JSON (Content-Type: application/json).",
            code="invalid_content_type",
        )
    data = request.get_json(silent=True)
    if data is None:
        raise BadRequestError("Request body is not valid JSON.", code="invalid_json")
    if not isinstance(data, dict):
        raise BadRequestError(
            "Request body must be a JSON object.", code="invalid_json"
        )
    return data


def load_body(schema: Schema, *, partial: bool = False, required: bool = True) -> dict:
    """Parse the JSON body and validate it with a marshmallow schema.

    Schema errors propagate as marshmallow `ValidationError`, which the error
    handler turns into a 422 with per-field messages.
    """
    data = schema.load(get_json_body(required=required), partial=partial)
    if partial and not data:
        raise ValidationError("Provide at least one field to update.", code="empty_update")
    return data


def load_query(schema: Schema) -> dict:
    """Validate query-string parameters with a marshmallow schema."""
    return schema.load(request.args.to_dict())
