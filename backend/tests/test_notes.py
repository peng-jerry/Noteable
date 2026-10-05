def make_note(client, headers, **data):
    res = client.post("/api/v1/notes", headers=headers, json=data)
    assert res.status_code == 201, res.get_json()
    return res.get_json()["note"]


def test_create_with_defaults(client, auth):
    note = make_note(client, auth)
    assert note["title"] == "Untitled"
    assert note["content"] == ""
    assert note["folder_id"] is None
    assert note["is_pinned"] is False


def test_create_with_empty_body(client, auth):
    res = client.post("/api/v1/notes", headers=auth)
    assert res.status_code == 201


def test_crud(client, auth):
    note = make_note(client, auth, title="Groceries", content="# List\n- milk")
    res = client.get(f"/api/v1/notes/{note['id']}", headers=auth)
    assert res.get_json()["note"]["content"] == "# List\n- milk"

    res = client.patch(f"/api/v1/notes/{note['id']}", headers=auth, json={"content": "- eggs", "is_pinned": True})
    updated = res.get_json()["note"]
    assert updated["content"] == "- eggs" and updated["is_pinned"] is True
    assert updated["title"] == "Groceries"

    assert client.delete(f"/api/v1/notes/{note['id']}", headers=auth).status_code == 204
    res = client.get(f"/api/v1/notes/{note['id']}", headers=auth)
    assert res.status_code == 404 and res.get_json()["error"]["code"] == "note_not_found"


def test_blank_title_becomes_untitled(client, auth):
    note = make_note(client, auth, title="Hi")
    res = client.patch(f"/api/v1/notes/{note['id']}", headers=auth, json={"title": "  "})
    assert res.get_json()["note"]["title"] == "Untitled"


def test_move_between_folders(client, auth):
    folder = client.post("/api/v1/folders", headers=auth, json={"name": "F"}).get_json()["folder"]
    note = make_note(client, auth, folder_id=folder["id"])
    assert note["folder_id"] == folder["id"]
    res = client.patch(f"/api/v1/notes/{note['id']}", headers=auth, json={"folder_id": None})
    assert res.get_json()["note"]["folder_id"] is None


def test_invalid_folder_rejected(client, auth):
    res = client.post("/api/v1/notes", headers=auth, json={"folder_id": "does-not-exist"})
    assert res.status_code == 422
    assert "folder_id" in res.get_json()["error"]["details"]


def test_content_length_limit(client, auth):
    res = client.post("/api/v1/notes", headers=auth, json={"content": "x" * 200_001})
    assert res.status_code == 422


def test_list_filters_search_and_pinned_first(client, auth):
    folder = client.post("/api/v1/folders", headers=auth, json={"name": "F"}).get_json()["folder"]
    make_note(client, auth, title="Alpha", content="apples")
    make_note(client, auth, title="Beta", content="bananas 100%", folder_id=folder["id"])
    make_note(client, auth, title="Gamma", content="grapes", is_pinned=True)

    titles = lambda res: [n["title"] for n in res.get_json()["notes"]]  # noqa: E731

    res = client.get("/api/v1/notes?sort=title&order=asc", headers=auth)
    assert titles(res) == ["Gamma", "Alpha", "Beta"]
    assert "content" not in res.get_json()["notes"][0]
    assert "excerpt" in res.get_json()["notes"][0]

    assert titles(client.get(f"/api/v1/notes?folder_id={folder['id']}", headers=auth)) == ["Beta"]
    assert set(titles(client.get("/api/v1/notes?folder_id=unfiled", headers=auth))) == {"Alpha", "Gamma"}
    assert titles(client.get("/api/v1/notes?q=APPLE", headers=auth)) == ["Alpha"]
    assert titles(client.get("/api/v1/notes?q=100%25", headers=auth)) == ["Beta"]
    assert titles(client.get("/api/v1/notes?q=%25", headers=auth)) == ["Beta"]  # % is literal
    assert titles(client.get("/api/v1/notes?pinned=true", headers=auth)) == ["Gamma"]


def test_pagination(client, auth):
    for i in range(5):
        make_note(client, auth, title=f"n{i}")
    res = client.get("/api/v1/notes?per_page=2&page=3", headers=auth).get_json()
    assert len(res["notes"]) == 1
    assert res["pagination"] == {
        "page": 3, "per_page": 2, "total": 5, "pages": 3, "has_next": False, "has_prev": True
    }


def test_bad_query_params(client, auth):
    res = client.get("/api/v1/notes?sort=bogus&per_page=1000", headers=auth)
    assert res.status_code == 422
    assert set(res.get_json()["error"]["details"]) == {"sort", "per_page"}


def test_users_cannot_see_or_touch_each_others_notes(client, auth, register):
    note = make_note(client, auth, title="secret")
    bob, _ = register(email="bob@example.com")

    assert client.get("/api/v1/notes", headers=bob).get_json()["notes"] == []
    assert client.get(f"/api/v1/notes/{note['id']}", headers=bob).status_code == 404
    assert client.patch(f"/api/v1/notes/{note['id']}", headers=bob, json={"title": "pwned"}).status_code == 404
    assert client.delete(f"/api/v1/notes/{note['id']}", headers=bob).status_code == 404
    assert client.get(f"/api/v1/notes/{note['id']}", headers=auth).get_json()["note"]["title"] == "secret"
