"""Account and session endpoints, mounted at /api/v1/auth.

Public:    POST /register, POST /login
Refresh:   POST /refresh          (Authorization: Bearer <refresh token>)
Protected: POST /logout, GET/PATCH/DELETE /me, POST /me/password
"""

from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import (
    create_access_token,
    decode_token,
    get_jwt,
    jwt_required,
)
from jwt import PyJWTError
from werkzeug.security import check_password_hash, generate_password_hash

from ...common.auth import current_user, issue_tokens
from ...common.request import load_body
from ...errors import ConflictError, UnauthorizedError, ValidationError
from ...extensions import db, limiter
from ...models import TokenBlocklist, User
from ...models.base import utcnow
from ..trash.service import purge_expired
from .schemas import (
    ChangePasswordSchema,
    DeleteAccountSchema,
    LoginSchema,
    LogoutSchema,
    RegisterSchema,
    UpdateProfileSchema,
)

bp = Blueprint("auth", __name__, url_prefix="/auth")

# Compared against when an email doesn't exist, so a failed login takes the
# same time either way and doesn't reveal which emails have accounts.
_DUMMY_HASH = generate_password_hash("not-a-real-password")


def _auth_limit() -> str:
    return current_app.config["RATELIMIT_AUTH"]


def _revoke(payload: dict) -> None:
    if TokenBlocklist.is_revoked(payload["jti"]):
        return
    db.session.add(
        TokenBlocklist(
            jti=payload["jti"],
            token_type=payload.get("type", "access"),
            user_id=payload["sub"],
            expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
        )
    )


@bp.post("/register")
@limiter.limit(_auth_limit)
def register():
    data = load_body(RegisterSchema())
    if User.query.filter_by(email=data["email"]).first():
        raise ConflictError(
            "An account with this email already exists.",
            code="email_taken",
            details={"email": ["An account with this email already exists."]},
        )

    user = User(email=data["email"], display_name=data["display_name"])
    user.set_password(data["password"])
    user.last_login_at = utcnow()
    db.session.add(user)
    db.session.commit()

    return jsonify({"user": user.to_dict(), **issue_tokens(user)}), 201


@bp.post("/login")
@limiter.limit(_auth_limit)
def login():
    data = load_body(LoginSchema())
    user = User.query.filter_by(email=data["email"]).first()

    if user is None:
        check_password_hash(_DUMMY_HASH, data["password"])
        raise UnauthorizedError("Invalid email or password.", code="invalid_credentials")
    if not user.check_password(data["password"]):
        raise UnauthorizedError("Invalid email or password.", code="invalid_credentials")
    if not user.is_active:
        raise UnauthorizedError("This account has been disabled.", code="account_disabled")

    user.last_login_at = utcnow()
    db.session.commit()
    purge_expired(user.id)  # empty out trash older than 30 days
    return jsonify({"user": user.to_dict(), **issue_tokens(user)})


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    """Exchange a refresh token for a new (non-fresh) access token."""
    access_token = create_access_token(identity=current_user().id, fresh=False)
    return jsonify({"access_token": access_token, "token_type": "Bearer"})


@bp.post("/logout")
@jwt_required()
def logout():
    """Revoke the current access token, and the refresh token if supplied."""
    data = load_body(LogoutSchema(), required=False)
    access_payload = get_jwt()
    _revoke(access_payload)

    if data.get("refresh_token"):
        try:
            refresh_payload = decode_token(data["refresh_token"], allow_expired=True)
        except PyJWTError:
            refresh_payload = None
        # Only revoke a valid refresh token that belongs to this same user.
        if (
            refresh_payload
            and refresh_payload.get("type") == "refresh"
            and refresh_payload.get("sub") == access_payload["sub"]
        ):
            _revoke(refresh_payload)

    db.session.commit()
    return jsonify({"message": "Logged out."})


@bp.get("/me")
@jwt_required()
def get_me():
    return jsonify({"user": current_user().to_dict()})


@bp.patch("/me")
@jwt_required()
def update_me():
    data = load_body(UpdateProfileSchema(), partial=True)
    user = current_user()
    for field, value in data.items():
        setattr(user, field, value)
    db.session.commit()
    return jsonify({"user": user.to_dict()})


@bp.post("/me/password")
@jwt_required()
@limiter.limit(_auth_limit)
def change_password():
    """Change password, sign out every other session, and return new tokens."""
    data = load_body(ChangePasswordSchema())
    user = current_user()
    if not user.check_password(data["current_password"]):
        raise ValidationError(
            "Current password is incorrect.",
            code="invalid_credentials",
            details={"current_password": ["Current password is incorrect."]},
        )
    if data["current_password"] == data["new_password"]:
        raise ValidationError(
            "New password must be different from the current one.",
            details={"new_password": ["New password must be different from the current one."]},
        )

    user.set_password(data["new_password"])
    user.tokens_valid_after = utcnow()
    db.session.commit()
    return jsonify({"user": user.to_dict(), **issue_tokens(user)})


@bp.delete("/me")
@jwt_required(fresh=True)
@limiter.limit(_auth_limit)
def delete_me():
    """Permanently delete the account and all of its folders and notes.

    Requires a *fresh* token (from logging in, not from /refresh) plus the
    password, so a stolen long-lived session can't wipe the account.
    """
    data = load_body(DeleteAccountSchema())
    user = current_user()
    if not user.check_password(data["password"]):
        raise ValidationError(
            "Password is incorrect.",
            code="invalid_credentials",
            details={"password": ["Password is incorrect."]},
        )
    db.session.delete(user)
    db.session.commit()
    return "", 204
