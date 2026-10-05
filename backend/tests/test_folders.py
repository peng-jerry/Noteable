from app.api.folders.service import MAX_DEPTH


def make_folder(client, headers, name, parent_id=None):
    res = client.post("/api/v1/folders", headers=headers, json={"name": name, "parent_id": parent_id})
    assert res.status_code == 201, res.get_json()
    return res.get_json()["folder"]


def test_create_and_list_nested_folders(client, auth):
    work = make_folder(client, auth, "Work")
    projects = make_folder(client, auth, "Projects", work["id"])
    assert projects["parent_id"] == work["id"]

    res = client.get("/api/v1/folders", headers=auth).get_json()
    assert {f["name"] for f in res["folders"]} == {"Work", "Projects"}
    assert res["unfiled_note_count"] == 0


def test_get_folder_has_path_children_and_counts(client, auth):
    a = make_folder(client, auth, "A")
    b = make_folder(client, auth, "B", a["id"])
    c = make_folder(client, auth, "C", b["id"])
    client.post("/api/v1/notes", headers=auth, json={"folder_id": c["id"]})

    res = client.get(f"/api/v1/folders/{c['id']}", headers=auth).get_json()
    assert [p["name"] for p in res["path"]] == ["A", "B"]
    assert res["folder"]["note_count"] == 1

    res = client.get(f"/api/v1/folders/{a['id']}", headers=auth).get_json()
    assert [ch["name"] for ch in res["children"]] == ["B"]


def test_sibling_names_must_be_unique_case_insensitive(client, auth):
    work = make_folder(client, auth, "Work")
    res = client.post("/api/v1/folders", headers=auth, json={"name": "work"})
    assert res.status_code == 409
    assert res.get_json()["error"]["code"] == "folder_name_taken"
    # Same name under a different parent is fine.
    make_folder(client, auth, "Work", work["id"])


def test_blank_name_rejected(client, auth):
    res = client.post("/api/v1/folders", headers=auth, json={"name": "   "})
    assert res.status_code == 422


def test_rename_and_move(client, auth):
    a = make_folder(client, auth, "A")
    b = make_folder(client, auth, "B")
    res = client.patch(f"/api/v1/folders/{b['id']}", headers=auth, json={"name": "B2", "parent_id": a["id"]})
    assert res.status_code == 200
    assert res.get_json()["folder"]["parent_id"] == a["id"]
    res = client.patch(f"/api/v1/folders/{b['id']}", headers=auth, json={"parent_id": None})
    assert res.get_json()["folder"]["parent_id"] is None


def test_cannot_move_into_itself_or_descendant(client, auth):
    a = make_folder(client, auth, "A")
    b = make_folder(client, auth, "B", a["id"])
    for target in (a["id"], b["id"]):
        res = client.patch(f"/api/v1/folders/{a['id']}", headers=auth, json={"parent_id": target})
        assert res.status_code == 422
        assert res.get_json()["error"]["code"] == "invalid_parent"


def test_max_depth(client, auth):
    parent = None
    for i in range(MAX_DEPTH):
        parent = make_folder(client, auth, f"L{i}", parent and parent["id"])
    res = client.post("/api/v1/folders", headers=auth, json={"name": "too deep", "parent_id": parent["id"]})
    assert res.status_code == 422
    assert res.get_json()["error"]["code"] == "max_depth_exceeded"


def test_delete_moves_folder_subfolders_and_notes_to_trash(client, auth):
    a = make_folder(client, auth, "A")
    b = make_folder(client, auth, "B", a["id"])
    client.post("/api/v1/notes", headers=auth, json={"folder_id": a["id"]})
    client.post("/api/v1/notes", headers=auth, json={"folder_id": b["id"]})
    client.post("/api/v1/notes", headers=auth, json={"title": "keep me"})

    res = client.delete(f"/api/v1/folders/{a['id']}", headers=auth)
    assert res.get_json()["trashed"] == {"folders": 2, "notes": 2}
    assert client.get("/api/v1/folders", headers=auth).get_json()["folders"] == []
    notes = client.get("/api/v1/notes", headers=auth).get_json()["notes"]
    assert [n["title"] for n in notes] == ["keep me"]


def test_users_cannot_see_or_touch_each_others_folders(client, auth, register):
    folder = make_folder(client, auth, "Private")
    bob, _ = register(email="bob@example.com")

    assert client.get("/api/v1/folders", headers=bob).get_json()["folders"] == []
    for method in ("get", "patch", "delete"):
        res = getattr(client, method)(f"/api/v1/folders/{folder['id']}", headers=bob, json={"name": "x"})
        assert res.status_code == 404
    # Can't nest into someone else's folder either.
    res = client.post("/api/v1/folders", headers=bob, json={"name": "x", "parent_id": folder["id"]})
    assert res.status_code == 422
