"""Pagination for list endpoints."""

from marshmallow import Schema, fields, validate

DEFAULT_PER_PAGE = 50
MAX_PER_PAGE = 100


class PaginationQuerySchema(Schema):
    page = fields.Integer(load_default=1, validate=validate.Range(min=1))
    per_page = fields.Integer(
        load_default=DEFAULT_PER_PAGE, validate=validate.Range(min=1, max=MAX_PER_PAGE)
    )


def paginate(query, page: int, per_page: int) -> tuple[list, dict]:
    """Apply LIMIT/OFFSET to a SQLAlchemy query and return (items, metadata)."""
    total = query.order_by(None).count()
    items = query.limit(per_page).offset((page - 1) * per_page).all()
    pages = (total + per_page - 1) // per_page if total else 0
    return items, {
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": pages,
        "has_next": page < pages,
        "has_prev": page > 1,
    }
