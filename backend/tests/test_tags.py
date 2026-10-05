def note(api, **body):
    return api("post", "/notes", body, expect=201).get_json()["note"]


def test_tags_are_created_from_notes_case_insensitively(api):
    n = note(api, title="a", tags=["Exam", "#physics", "exam"])
    assert [t["name"] for t in n["tags"]] == ["Exam", "physics"]
    tags = api("get", "/tags").get_json()["tags"]
    assert {t["name"]: t["note_count"] for t in tags} == {"Exam": 1, "physics": 1}
    assert all(t["color"] for t in tags)


def test_replace_tags_on_update(api):
    n = note(api, tags=["one"])
    updated = api("patch", f"/notes/{n['id']}", {"tags": ["two", "ONE"]}).get_json()["note"]
    assert [t["name"] for t in updated["tags"]] == ["one", "two"]
    cleared = api("patch", f"/notes/{n['id']}", {"tags": []}).get_json()["note"]
    assert cleared["tags"] == []


def test_tag_validation(api):
    assert api("post", "/notes", {"tags": ["a,b"]}).status_code == 422
    assert api("post", "/notes", {"tags": ["   "]}).status_code == 422
    assert api("post", "/notes", {"tags": [f"t{i}" for i in range(21)]}).status_code == 422


def test_crud_rename_recolour_delete(api):
    tag = api("post", "/tags", {"name": "Work", "color": "rose"}, expect=201).get_json()["tag"]
    assert api("post", "/tags", {"name": "work"}).get_json()["error"]["code"] == "tag_name_taken"
    assert api("post", "/tags", {"name": "x", "color": "neon"}).status_code == 422
    n = note(api, tags=["Work"])
    renamed = api("patch", f"/tags/{tag['id']}", {"name": "Job", "color": "teal"}).get_json()["tag"]
    assert (renamed["name"], renamed["color"]) == ("Job", "teal")
    assert api("get", f"/notes/{n['id']}").get_json()["note"]["tags"][0]["name"] == "Job"
    api("delete", f"/tags/{tag['id']}", expect=204)
    assert api("get", f"/notes/{n['id']}").get_json()["note"]["tags"] == []


def test_filter_by_multiple_tags_requires_all(api):
    a = note(api, title="a", tags=["x", "y"])
    note(api, title="b", tags=["x"])
    ids = {t["name"]: t["id"] for t in api("get", "/tags").get_json()["tags"]}
    res = api("get", f"/notes?tags={ids['x']},{ids['y']}").get_json()["notes"]
    assert [n["id"] for n in res] == [a["id"]]
    assert len(api("get", f"/notes?tags={ids['x']}").get_json()["notes"]) == 2


def test_tags_are_private(api, client, register):
    tag = api("post", "/tags", {"name": "mine"}, expect=201).get_json()["tag"]
    bob, _ = register(email="bob@example.com")
    assert client.get("/api/v1/tags", headers=bob).get_json()["tags"] == []
    assert client.patch(f"/api/v1/tags/{tag['id']}", headers=bob, json={"name": "x"}).status_code == 404
