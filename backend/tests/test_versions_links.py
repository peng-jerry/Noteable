from datetime import timedelta

from app.extensions import db
from app.models import NoteVersion


def note(api, **body):
    return api("post", "/notes", body, expect=201).get_json()["note"]


def age_versions(note_id, minutes=11):
    for v in NoteVersion.query.filter_by(note_id=note_id):
        v.created_at = v.created_at - timedelta(minutes=minutes)
    db.session.commit()


def test_auto_versions_are_throttled(api):
    n = note(api, title="t", content="one")
    api("patch", f"/notes/{n['id']}", {"content": "two"})
    api("patch", f"/notes/{n['id']}", {"content": "three"})
    versions = api("get", f"/notes/{n['id']}/versions").get_json()["versions"]
    assert [v["kind"] for v in versions] == ["auto"]  # only one within 10 minutes
    age_versions(n["id"])
    api("patch", f"/notes/{n['id']}", {"content": "four"})
    assert len(api("get", f"/notes/{n['id']}/versions").get_json()["versions"]) == 2


def test_manual_version_and_restore(api):
    n = note(api, title="Draft", content="first")
    v = api("post", f"/notes/{n['id']}/versions", {"label": "v1"}, expect=201).get_json()["version"]
    assert (v["kind"], v["label"]) == ("manual", "v1")
    api("patch", f"/notes/{n['id']}", {"title": "Final", "content": "second"})
    full = api("get", f"/notes/{n['id']}/versions/{v['id']}").get_json()["version"]
    assert full["content"] == "first"

    restored = api("post", f"/notes/{n['id']}/versions/{v['id']}/restore").get_json()["note"]
    assert (restored["title"], restored["content"]) == ("Draft", "first")
    kinds = [x["kind"] for x in api("get", f"/notes/{n['id']}/versions").get_json()["versions"]]
    assert kinds[0] == "restore"  # the pre-restore text was kept
    assert api("get", f"/notes/{n['id']}/versions/nope").status_code == 404


def test_versions_are_capped(api, app):
    from app.api.notes import service

    n = note(api, title="t", content="x")
    for i in range(service.MAX_VERSIONS_PER_NOTE + 5):
        api("post", f"/notes/{n['id']}/versions", {"label": str(i)})
    assert len(api("get", f"/notes/{n['id']}/versions").get_json()["versions"]) == service.MAX_VERSIONS_PER_NOTE


def test_backlinks_and_rename_rewrites_links(api):
    target = note(api, title="Flask Basics")
    source = note(api, title="Index", content="See [[flask basics]] and [[Missing Page]]. `[[not a link]]`")
    backs = api("get", f"/notes/{target['id']}/backlinks").get_json()["backlinks"]
    assert [b["title"] for b in backs] == ["Index"]

    res = api("patch", f"/notes/{target['id']}", {"title": "Flask 101"}).get_json()
    assert res["links_updated"] == 1
    content = api("get", f"/notes/{source['id']}").get_json()["note"]["content"]
    assert content == "See [[Flask 101]] and [[Missing Page]]. `[[not a link]]`"

    # A note created later with a dangling link's title picks up the backlink.
    page = note(api, title="Missing Page")
    assert [b["title"] for b in api("get", f"/notes/{page['id']}/backlinks").get_json()["backlinks"]] == ["Index"]


def test_titles_index_excludes_trash(api):
    a = note(api, title="A")
    note(api, title="B")
    api("delete", f"/notes/{a['id']}", expect=204)
    assert [n["title"] for n in api("get", "/notes/titles").get_json()["notes"]] == ["B"]
