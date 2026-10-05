"""Template endpoints, mounted at /api/v1/templates. All require an access token.

GET    /        built-in templates followed by the user's own
POST   /        create a template: { name, description?, title?, content? }
PATCH  /<id>    edit one of your templates
DELETE /<id>    delete one of your templates

Built-in templates (ids starting with "builtin-") are read-only. Creating a
note from a template happens on the client, which fills in placeholders and
then calls POST /notes.
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from marshmallow import Schema, fields, validate

from ...common.auth import current_user
from ...common.request import load_body
from ...common.validators import TrimmedString
from ...errors import ForbiddenError, NotFoundError
from ...extensions import db
from ...models import Template
from ..notes.schemas import MAX_CONTENT_LENGTH
from .builtins import BUILTIN_IDS, builtin_dicts

bp = Blueprint("templates", __name__, url_prefix="/templates")


class TemplateSchema(Schema):
    name = TrimmedString(required=True, validate=validate.Length(min=1, max=100))
    description = TrimmedString(load_default="", validate=validate.Length(max=200))
    title = TrimmedString(load_default="", validate=validate.Length(max=200))
    content = fields.String(load_default="", validate=validate.Length(max=MAX_CONTENT_LENGTH))


def _get_template(user_id: str, template_id: str) -> Template:
    if template_id in BUILTIN_IDS:
        raise ForbiddenError("Built-in templates can't be changed.", code="builtin_template")
    template = Template.query.filter_by(id=template_id, user_id=user_id).first()
    if template is None:
        raise NotFoundError("Template not found.", code="template_not_found")
    return template


@bp.get("")
@jwt_required()
def list_templates():
    own = Template.query.filter_by(user_id=current_user().id).order_by(Template.name).all()
    return jsonify({"templates": builtin_dicts() + [t.to_dict() for t in own]})


@bp.post("")
@jwt_required()
def create_template():
    data = load_body(TemplateSchema())
    template = Template(user_id=current_user().id, **data)
    db.session.add(template)
    db.session.commit()
    return jsonify({"template": template.to_dict()}), 201


@bp.patch("/<template_id>")
@jwt_required()
def update_template(template_id):
    template = _get_template(current_user().id, template_id)
    data = load_body(TemplateSchema(), partial=True)
    for field, value in data.items():
        setattr(template, field, value)
    db.session.commit()
    return jsonify({"template": template.to_dict()})


@bp.delete("/<template_id>")
@jwt_required()
def delete_template(template_id):
    template = _get_template(current_user().id, template_id)
    db.session.delete(template)
    db.session.commit()
    return "", 204
