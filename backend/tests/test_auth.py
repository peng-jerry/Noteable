import time


def error_code(res):
    return res.get_json()["error"]["code"]


def test_health(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.get_json()["database"] == "ok"


def test_register_returns_user_and_tokens(register):
    _, body = register()
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["display_name"] == "Alice"
    assert "password_hash" not in body["user"]
    assert body["access_token"] and body["refresh_token"]


def test_register_normalizes_email_and_defaults_display_name(client):
    res = client.post(
        "/api/v1/auth/register", json={"email": "  Bob@Example.COM ", "password": "hunter2hunter"}
    )
    assert res.status_code == 201
    user = res.get_json()["user"]
    assert user["email"] == "bob@example.com"
    assert user["display_name"] == "bob"


def test_register_duplicate_email(client, register):
    register()
    res = client.post(
        "/api/v1/auth/register", json={"email": "ALICE@example.com", "password": "password123"}
    )
    assert res.status_code == 409
    assert error_code(res) == "email_taken"


def test_register_validation_errors(client):
    res = client.post("/api/v1/auth/register", json={"email": "nope", "password": "short"})
    assert res.status_code == 422
    details = res.get_json()["error"]["details"]
    assert "email" in details and "password" in details


def test_register_password_needs_letter_and_number(client):
    res = client.post(
        "/api/v1/auth/register", json={"email": "c@example.com", "password": "allletters"}
    )
    assert res.status_code == 422


def test_unknown_fields_rejected(client):
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "d@example.com", "password": "password123", "is_admin": True},
    )
    assert res.status_code == 422
    assert "is_admin" in res.get_json()["error"]["details"]


def test_missing_and_malformed_body(client):
    assert error_code(client.post("/api/v1/auth/login")) == "missing_body"
    res = client.post("/api/v1/auth/login", data="{bad", content_type="application/json")
    assert error_code(res) == "invalid_json"
    res = client.post("/api/v1/auth/login", data="x=1", content_type="text/plain")
    assert error_code(res) == "invalid_content_type"
    res = client.post("/api/v1/auth/login", json=["a", "b"])
    assert error_code(res) == "invalid_json"


def test_login(client, register):
    register()
    res = client.post(
        "/api/v1/auth/login", json={"email": "alice@example.com", "password": "password123"}
    )
    assert res.status_code == 200
    assert res.get_json()["user"]["last_login_at"]


def test_login_wrong_password_and_unknown_email_look_the_same(client, register):
    register()
    wrong = client.post(
        "/api/v1/auth/login", json={"email": "alice@example.com", "password": "wrongpass1"}
    )
    unknown = client.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": "wrongpass1"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.get_json() == unknown.get_json()


def test_protected_route_requires_token(client):
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401
    assert error_code(res) == "token_missing"

    res = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert res.status_code == 401
    assert error_code(res) == "token_invalid"


def test_me_and_update_profile(client, auth):
    assert client.get("/api/v1/auth/me", headers=auth).get_json()["user"]["display_name"] == "Alice"
    res = client.patch("/api/v1/auth/me", headers=auth, json={"display_name": "  Al  "})
    assert res.status_code == 200
    assert res.get_json()["user"]["display_name"] == "Al"
    res = client.patch("/api/v1/auth/me", headers=auth, json={})
    assert error_code(res) == "empty_update"


def test_refresh_flow(client, register):
    _, body = register()
    refresh_headers = {"Authorization": f"Bearer {body['refresh_token']}"}
    res = client.post("/api/v1/auth/refresh", headers=refresh_headers)
    assert res.status_code == 200
    new_access = res.get_json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200

    # An access token can't be used to refresh.
    access_headers = {"Authorization": f"Bearer {body['access_token']}"}
    assert client.post("/api/v1/auth/refresh", headers=access_headers).status_code == 401


def test_logout_revokes_access_and_refresh_tokens(client, register):
    headers, body = register()
    res = client.post(
        "/api/v1/auth/logout", headers=headers, json={"refresh_token": body["refresh_token"]}
    )
    assert res.status_code == 200
    res = client.get("/api/v1/auth/me", headers=headers)
    assert error_code(res) == "token_revoked"
    res = client.post(
        "/api/v1/auth/refresh", headers={"Authorization": f"Bearer {body['refresh_token']}"}
    )
    assert error_code(res) == "token_revoked"


def test_change_password_invalidates_old_tokens(client, register):
    headers, _ = register()
    # JWT issue times have 1-second resolution; make sure the old token is
    # from an earlier second than the password change.
    time.sleep(1.1)
    res = client.post(
        "/api/v1/auth/me/password",
        headers=headers,
        json={"current_password": "password123", "new_password": "newpassword456"},
    )
    assert res.status_code == 200
    new_headers = {"Authorization": f"Bearer {res.get_json()['access_token']}"}

    assert error_code(client.get("/api/v1/auth/me", headers=headers)) == "token_revoked"
    assert client.get("/api/v1/auth/me", headers=new_headers).status_code == 200
    login = client.post(
        "/api/v1/auth/login", json={"email": "alice@example.com", "password": "newpassword456"}
    )
    assert login.status_code == 200


def test_change_password_wrong_current(client, auth):
    res = client.post(
        "/api/v1/auth/me/password",
        headers=auth,
        json={"current_password": "nottheone1", "new_password": "newpassword456"},
    )
    assert res.status_code == 422
    assert "current_password" in res.get_json()["error"]["details"]


def test_delete_account_removes_everything(client, auth):
    folder = client.post("/api/v1/folders", headers=auth, json={"name": "Work"}).get_json()["folder"]
    client.post("/api/v1/notes", headers=auth, json={"title": "n", "folder_id": folder["id"]})

    res = client.delete("/api/v1/auth/me", headers=auth, json={"password": "wrong"})
    assert res.status_code == 422
    res = client.delete("/api/v1/auth/me", headers=auth, json={"password": "password123"})
    assert res.status_code == 204

    res = client.get("/api/v1/auth/me", headers=auth)
    assert res.status_code == 401
    from app.models import Folder, Note

    assert Folder.query.count() == 0 and Note.query.count() == 0


def test_unknown_route_and_method_are_json(client):
    res = client.get("/api/v1/nope")
    assert res.status_code == 404 and error_code(res) == "not_found"
    res = client.put("/api/v1/auth/login", json={})
    assert res.status_code == 405 and error_code(res) == "method_not_allowed"


def test_payload_too_large(client, app):
    app.config["MAX_CONTENT_LENGTH"] = 100
    res = client.post("/api/v1/auth/login", json={"email": "a" * 200, "password": "x"})
    assert res.status_code == 413 and error_code(res) == "payload_too_large"
