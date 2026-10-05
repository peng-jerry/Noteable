"""Centralised error handling.

Every error the API returns, expected or not, uses the same JSON shape:

    {
      "error": {
        "code": "validation_error",     # stable, machine-readable
        "message": "Invalid input.",    # human-readable
        "details": {...}                # optional, e.g. per-field errors
      }
    }

Routes raise the `APIError` subclasses below; the handlers registered in
`register_error_handlers` turn those (and framework/library errors) into
responses in this format. Unexpected exceptions are logged with a traceback
but never leak internals to the client.
"""

from typing import Any

from flask import Flask, current_app, jsonify
from marshmallow import ValidationError as MarshmallowValidationError
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from werkzeug.exceptions import HTTPException

from .extensions import db


class APIError(Exception):
    """Base class for errors that should be returned to the client."""

    status_code = 400
    code = "bad_request"
    message = "The request could not be processed."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        details: Any = None,
        status_code: int | None = None,
    ):
        super().__init__(message or self.message)
        self.message = message or self.message
        self.code = code or self.code
        self.details = details
        if status_code is not None:
            self.status_code = status_code


class BadRequestError(APIError):
    status_code = 400
    code = "bad_request"
    message = "The request could not be processed."


class ValidationError(APIError):
    status_code = 422
    code = "validation_error"
    message = "Some fields are invalid."


class UnauthorizedError(APIError):
    status_code = 401
    code = "unauthorized"
    message = "Authentication is required."


class ForbiddenError(APIError):
    status_code = 403
    code = "forbidden"
    message = "You do not have permission to do that."


class NotFoundError(APIError):
    status_code = 404
    code = "not_found"
    message = "The requested resource was not found."


class ConflictError(APIError):
    status_code = 409
    code = "conflict"
    message = "The request conflicts with existing data."


def error_response(status_code: int, code: str, message: str, details: Any = None):
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return jsonify({"error": body}), status_code


# Friendly codes for the HTTP errors Flask/Werkzeug raise on its own.
_HTTP_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    413: "payload_too_large",
    415: "unsupported_media_type",
    429: "rate_limited",
}


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(APIError)
    def handle_api_error(err: APIError):
        return error_response(err.status_code, err.code, err.message, err.details)

    @app.errorhandler(MarshmallowValidationError)
    def handle_schema_error(err: MarshmallowValidationError):
        return error_response(
            422, "validation_error", "Some fields are invalid.", err.messages
        )

    @app.errorhandler(HTTPException)
    def handle_http_exception(err: HTTPException):
        status = err.code or 500
        code = _HTTP_CODES.get(status, "http_error")
        message = err.description or err.name
        if status == 404:
            message = "The requested URL was not found on this server."
        elif status == 429:
            message = "Too many requests. Please slow down and try again shortly."
        return error_response(status, code, message)

    @app.errorhandler(IntegrityError)
    def handle_integrity_error(err: IntegrityError):
        db.session.rollback()
        current_app.logger.warning("Integrity error: %s", err.orig)
        return error_response(
            409, "conflict", "The request conflicts with existing data."
        )

    @app.errorhandler(OperationalError)
    def handle_operational_error(err: OperationalError):
        db.session.rollback()
        current_app.logger.error("Database unavailable: %s", err, exc_info=True)
        return error_response(
            503,
            "service_unavailable",
            "The database is temporarily unavailable. Please try again.",
        )

    @app.errorhandler(SQLAlchemyError)
    def handle_db_error(err: SQLAlchemyError):
        db.session.rollback()
        current_app.logger.error("Database error: %s", err, exc_info=True)
        return error_response(500, "database_error", "A database error occurred.")

    @app.errorhandler(Exception)
    def handle_unexpected_error(err: Exception):
        db.session.rollback()
        current_app.logger.exception("Unhandled exception")
        return error_response(
            500, "internal_error", "Something went wrong on our end."
        )


def register_jwt_error_handlers(jwt) -> None:
    """Return JWT failures in the standard error shape.

    Distinct codes let the frontend react correctly: on `token_expired` it
    should call /auth/refresh and retry; on anything else, log the user out.
    """

    @jwt.expired_token_loader
    def expired(_header, payload):
        kind = payload.get("type", "access")
        return error_response(
            401, "token_expired", f"Your {kind} token has expired."
        )

    @jwt.invalid_token_loader
    def invalid(reason):
        return error_response(401, "token_invalid", f"Invalid token: {reason}")

    @jwt.unauthorized_loader
    def missing(reason):
        return error_response(401, "token_missing", "Authentication is required.")

    @jwt.revoked_token_loader
    def revoked(_header, _payload):
        return error_response(401, "token_revoked", "This token has been revoked.")

    @jwt.needs_fresh_token_loader
    def needs_fresh(_header, _payload):
        return error_response(
            401, "fresh_token_required", "Please log in again to do this."
        )

    @jwt.user_lookup_error_loader
    def user_not_found(_header, _payload):
        return error_response(
            401, "user_not_found", "The account for this token no longer exists."
        )
