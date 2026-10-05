import pytest

from app import create_app
from app.extensions import db


@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def register(client):
    """Create an account and return (auth headers, response JSON)."""

    def _register(email="alice@example.com", password="password123", display_name="Alice"):
        res = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "display_name": display_name},
        )
        assert res.status_code == 201, res.get_json()
        body = res.get_json()
        return {"Authorization": f"Bearer {body['access_token']}"}, body

    return _register


@pytest.fixture
def auth(register):
    headers, _ = register()
    return headers
