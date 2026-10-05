"""JWT wiring: how tokens map to users and how revocation is checked.

Protect a route with `@jwt_required()` from flask_jwt_extended and read the
signed-in user with `current_user()`. Any future feature of the wider site
can reuse these the same way.
"""

from flask_jwt_extended import create_access_token, create_refresh_token, get_current_user

from ..extensions import db, jwt
from ..models import TokenBlocklist, User
from ..models.base import as_utc


def current_user() -> User:
    """The authenticated user for this request (inside @jwt_required)."""
    return get_current_user()


def issue_tokens(user: User) -> dict:
    return {
        "access_token": create_access_token(identity=user.id, fresh=True),
        "refresh_token": create_refresh_token(identity=user.id),
        "token_type": "Bearer",
    }


@jwt.user_identity_loader
def _identity(identity):
    return str(identity)


@jwt.user_lookup_loader
def _load_user(_header, payload):
    user = db.session.get(User, payload["sub"])
    if user is None or not user.is_active:
        return None
    return user


@jwt.token_in_blocklist_loader
def _is_revoked(_header, payload) -> bool:
    if TokenBlocklist.is_revoked(payload["jti"]):
        return True
    # Tokens issued before the user's last password change are no longer valid.
    user = db.session.get(User, payload["sub"])
    if user is not None and user.tokens_valid_after is not None:
        return payload["iat"] < int(as_utc(user.tokens_valid_after).timestamp())
    return False
