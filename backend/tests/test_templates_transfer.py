import io
import zipfile


def test_builtin_and_custom_templates(api):
    templates = api("get", "/templates").get_json()["templates"]
    assert any(t["builtin"] and t["name"] == "Lecture notes" for t in templates)
    t = api("post", "/templates", {"name": "Lab report", "title": "Lab — {{date}}", "content": "# Aim"}, expect=201).get_json()["template"]
    edited = api("patch", f"/templates/{t['id']}", {"description": "Weekly lab"}).get_json()["template"]
    assert (edited["description"], edited["content"]) == ("Weekly lab", "# Aim")  # partial update keeps content
    assert api("patch", "/templates/builtin-lecture", {"name": "x"}).status_code == 403
    assert api("post", "/templates", {"name": ""}).status_code == 422
    api("delete", f"/templates/{t['id']}", expect=204)
    assert not any(not x["builtin"] for x in api("get", "/templates").get_json()["templates"])


def test_import_creates_folders_titles_and_tags(api):
    files = [
        {"path": "School/15-113/week1.md", "content": "# Week 1\nIntro"},
        {"path": "School/15-113/week2.txt", "content": "plain text"},
        {"path": "School/notes.md", "content": '---\ntitle: "From front matter"\ntags: [exam, "cs"]\npinned: true\n---\nBody'},
        {"path": "image.png", "content": "x"},
    ]
    res = api("post", "/import", {"files": files}, expect=201).get_json()
    assert res["created"] == {"notes": 3, "folders": 2}
    assert res["skipped"][0]["path"] == "image.png"
    notes = {n["title"]: n for n in api("get", "/notes").get_json()["notes"]}
    assert set(notes) == {"Week 1", "week2", "From front matter"}
    fm = api("get", f"/notes/{notes['From front matter']['id']}").get_json()["note"]
    assert fm["content"] == "Body" and fm["is_pinned"] and [t["name"] for t in fm["tags"]] == ["cs", "exam"]

    # A second batch reuses the existing folders.
    again = api("post", "/import", {"files": [{"path": "school/15-113/week3.md", "content": "x"}]}).get_json()
    assert again["created"]["folders"] == 0


def test_import_into_folder_and_limits(api):
    f = api("post", "/folders", {"name": "Inbox"}, expect=201).get_json()["folder"]
    res = api("post", "/import", {"folder_id": f["id"], "files": [{"path": "a.md", "content": "x" * 200_001}]}).get_json()
    assert res["created"]["notes"] == 0 and "Longer than" in res["skipped"][0]["reason"]
    assert api("post", "/import", {"files": []}).status_code == 422


def test_export_zip_round_trips(api, client, auth):
    f = api("post", "/folders", {"name": "School"}, expect=201).get_json()["folder"]
    sub = api("post", "/folders", {"name": "Empty", "parent_id": f["id"]}, expect=201).get_json()["folder"]
    api("post", "/notes", {"title": "Lecture: 1/2", "content": "hi", "folder_id": f["id"], "tags": ["cs"]}, expect=201)
    api("post", "/notes", {"title": "Loose", "content": "x"}, expect=201)
    api("post", "/notes", {"title": "Loose", "content": "y"}, expect=201)

    res = client.get("/api/v1/export", headers=auth)
    assert res.status_code == 200 and res.mimetype == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(res.data)).namelist()
    assert "School/Lecture- 1-2.md" in names and "School/Empty/" in names
    assert {"Loose.md", "Loose (2).md"} <= set(names)
    body = zipfile.ZipFile(io.BytesIO(res.data)).read("School/Lecture- 1-2.md").decode()
    assert body.startswith('---\ntitle: "Lecture: 1/2"\ntags: ["cs"]') and body.endswith("hi")

    one = client.get(f"/api/v1/export?folder_id={sub['id']}", headers=auth)
    assert zipfile.ZipFile(io.BytesIO(one.data)).namelist() == ["Empty/"]
    assert client.get("/api/v1/export?folder_id=nope", headers=auth).status_code == 422
