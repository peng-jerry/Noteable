"""Noteable API application factory."""

import logging

from flask import Flask, jsonify
from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import get_config
from .errors import register_error_handlers, register_jwt_error_handlers
from .extensions import cors, db, jwt, limiter, migrate


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)  # API only; no static files
    app.config.from_object(get_config(config_name))
    app.json.sort_keys = False
    app.url_map.strict_slashes = False  # /notes and /notes/ both work

    _configure_logging(app)

    # Render sits behind a proxy; trust its X-Forwarded-* headers so the
    # rate limiter sees real client IPs and URLs use https.
    hops = app.config["PROXY_HOPS"]
    if hops:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=hops, x_proto=hops, x_host=hops)

    db.init_app(app)
    # Batch mode lets Alembic alter tables on SQLite (used locally).
    migrate.init_app(app, db, render_as_batch=True)
    jwt.init_app(app)
    limiter.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        allow_headers=["Content-Type", "Authorization"],
        expose_headers=["X-Attachment-Kind"],
        methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        max_age=600,
    )

    # Imported for its side effect of registering the JWT callbacks.
    from .common import auth  # noqa: F401
    from . import models  # noqa: F401
    from .api import register_api

    register_api(app)
    register_error_handlers(app)
    register_jwt_error_handlers(jwt)

    @app.cli.command("purge-tokens")
    def purge_tokens():
        """Delete revoked-token records that have expired anyway."""
        from .models import TokenBlocklist

        print(f"Purged {TokenBlocklist.purge_expired()} expired token record(s).")

    @app.cli.command("purge-trash")
    def purge_trash():
        """Permanently delete trash items older than the retention period."""
        from .api.trash.service import purge_expired

        print(f"Purged {purge_expired()} expired trash item(s).")

    @app.get("/")
    def index():
        return jsonify(
            {
                "service": app.config["APP_NAME"],
                "docs": "See README.md for the API reference.",
                "health": "/api/v1/health",
            }
        )

    return app


def _configure_logging(app: Flask) -> None:
    level = getattr(logging, str(app.config["LOG_LEVEL"]).upper(), logging.INFO)
    app.logger.setLevel(level)
    if not app.debug and not app.testing:
        handler = logging.StreamHandler()
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
        )
        app.logger.handlers = [handler]


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _record):
    """SQLite ignores foreign keys (and ON DELETE CASCADE) unless asked."""
    if dbapi_connection.__class__.__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
