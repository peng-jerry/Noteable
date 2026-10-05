from datetime import timedelta

from app.extensions import db
from app.models import Folder, Note
from app.models.base import utcnow


def note(api, **body):
    return api("post", "/notes", body, expect=201).get_json()["note"]


def folder(api, name, parent_id=None):
    return api("post", "/folders", {"name": name, "parent_id": parent_id}, expect=201).get_json()["folder"]


def test_deleted_note_goes_to_trash_and_restores(api):
    n = note(api, title="Keep")
    api("delete", f"/notes/{n['id']}", expect=204)
    assert api("get", "/notes").get_json()["notes"] == []
    assert api("get", f"/notes/{n['id']}").status_code == 404
    assert api("patch", f"/notes/{n['id']}", {"title": "x"}).status_code == 404

    items = api("get", "/trash").get_json()["items"]
    assert [(i["type"], i["title"]) for i in items] == [("note", "Keep")]
    assert items[0]["expires_at"] > items[0]["deleted_at"]
    assert api("get", f"/trash/notes/{n['id']}").get_json()["note"]["title"] == "Keep"
    assert api("get", "/trash/count").get_json()["count"] == 1

    api("post", f"/trash/notes/{n['id']}/restore", expect=200)
    assert [x["title"] for x in api("get", "/notes").get_json()["notes"]] == ["Keep"]
    assert api("get", "/trash").get_json()["items"] == []


def test_folder_trash_takes_contents_and_restores_them(api):
    a = folder(api, "A")
    b = folder(api, "B", a["id"])
    note(api, title="in A", folder_id=a["id"])
    note(api, title="in B", folder_id=b["id"])
    loose = note(api, title="already trashed", folder_id=b["id"])
    api("delete", f"/notes/{loose['id']}", expect=204)

    assert api("delete", f"/folders/{a['id']}").get_json()["trashed"] == {"folders": 2, "notes": 2}
    assert api("get", "/folders").get_json()["folders"] == []
    items = api("get", "/trash").get_json()["items"]
    folder_item = next(i for i in items if i["type"] == "folder")
    assert folder_item["contains"] == {"folders": 1, "notes": 2}
    assert len(items) == 2  # the folder + the note trashed on its own

    api("post", f"/trash/folders/{a['id']}/restore", expect=200)
    assert {f["name"] for f in api("get", "/folders").get_json()["folders"]} == {"A", "B"}
    assert {n["title"] for n in api("get", "/notes").get_json()["notes"]} == {"in A", "in B"}
    # The separately trashed note stays in the trash.
    assert [i["title"] for i in api("get", "/trash").get_json()["items"]] == ["already trashed"]


def test_restore_goes_to_unfiled_or_renames_on_conflict(api):
    f = folder(api, "Work")
    n = note(api, title="orphan", folder_id=f["id"])
    api("delete", f"/notes/{n['id']}", expect=204)
    api("delete", f"/folders/{f['id']}", expect=200)
    restored = api("post", f"/trash/notes/{n['id']}/restore").get_json()["note"]
    assert restored["folder_id"] is None

    folder(api, "Work")  # a new folder takes the old name
    renamed = api("post", f"/trash/folders/{f['id']}/restore").get_json()["folder"]
    assert renamed["name"] == "Work (restored)"


def test_delete_forever_and_empty(api):
    a = note(api, title="a")
    b = note(api, title="b")
    f = folder(api, "F")
    note(api, title="inside", folder_id=f["id"])
    for n in (a, b):
        api("delete", f"/notes/{n['id']}", expect=204)
    api("delete", f"/folders/{f['id']}", expect=200)

    api("delete", f"/trash/notes/{a['id']}", expect=204)
    assert api("get", f"/trash/notes/{a['id']}").status_code == 404
    api("delete", "/trash", expect=200)
    assert api("get", "/trash").get_json()["items"] == []
    assert Note.query.count() == 0 and Folder.query.count() == 0


def test_items_older_than_30_days_are_purged(api, app):
    old = note(api, title="old")
    recent = note(api, title="recent")
    for n in (old, recent):
        api("delete", f"/notes/{n['id']}", expect=204)
    db.session.get(Note, old["id"]).deleted_at = utcnow() - timedelta(days=31)
    db.session.commit()
    assert [i["title"] for i in api("get", "/trash").get_json()["items"]] == ["recent"]
    assert db.session.get(Note, old["id"]) is None


def test_trashed_folder_name_can_be_reused(api):
    f = folder(api, "Reuse")
    api("delete", f"/folders/{f['id']}", expect=200)
    folder(api, "Reuse")
