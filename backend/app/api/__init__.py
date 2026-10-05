"""API registry.

Every feature is its own blueprint, nested under one versioned parent so all
routes live at /api/v1/<feature>/... To add a feature to the wider site
(e.g. a calendar or a portfolio CMS):

  1. create app/api/<feature>/ with routes.py (a `bp` Blueprint) and schemas.py
  2. add its models in app/models/ and import them in app/models/__init__.py
  3. register its blueprint in FEATURE_BLUEPRINTS below
  4. run `flask db migrate -m "add <feature>"` and `flask db upgrade`

If a breaking change is ever needed, add a `v2` parent blueprint alongside
`v1` instead of changing v1's behaviour under existing clients.
"""

from flask import Blueprint, Flask

from . import health
from .auth.routes import bp as auth_bp
from .folders.routes import bp as folders_bp
from .notes.routes import bp as notes_bp
from .tags.routes import bp as tags_bp
from .templates.routes import bp as templates_bp
from .transfer.routes import bp as transfer_bp
from .trash.routes import bp as trash_bp

FEATURE_BLUEPRINTS = [
    health.bp,
    auth_bp,
    folders_bp,
    notes_bp,
    tags_bp,
    templates_bp,
    trash_bp,
    transfer_bp,
]


def register_api(app: Flask) -> None:
    api_v1 = Blueprint("api_v1", __name__, url_prefix="/api/v1")
    for bp in FEATURE_BLUEPRINTS:
        api_v1.register_blueprint(bp)
    app.register_blueprint(api_v1)
