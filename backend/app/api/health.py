"""Public service-status endpoints, mounted at /api/v1."""

from flask import Blueprint, current_app, jsonify
from sqlalchemy import text

from ..extensions import db, limiter

bp = Blueprint("health", __name__)


@bp.get("/health")
@limiter.exempt
def health():
    """Liveness + database check. Render's health check points here."""
    try:
        db.session.execute(text("SELECT 1"))
        database = "ok"
    except Exception:  # noqa: BLE001 - report, don't crash, the health check
        current_app.logger.exception("Health check: database unreachable")
        db.session.rollback()
        database = "unavailable"

    healthy = database == "ok"
    return (
        jsonify(
            {
                "status": "ok" if healthy else "degraded",
                "service": current_app.config["APP_NAME"],
                "version": current_app.config["API_VERSION"],
                "database": database,
            }
        ),
        200 if healthy else 503,
    )
