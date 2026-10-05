def note(api, **body):
    return api("post", "/notes", body, expect=201).get_json()["note"]


def titles(res):
    return [n["title"] for n in res.get_json()["notes"]]


def test_all_terms_must_match_and_title_matches_rank_higher(api):
    note(api, title="Cooking", content="flask of soup and a react to it")
    note(api, title="Flask tutorial", content="building react apps")
    note(api, title="Other", content="only flask here")
    res = api("get", "/notes?q=flask react&sort=relevance")
    assert titles(res) == ["Flask tutorial", "Cooking"]
    assert res.get_json()["search"] == {"terms": ["flask", "react"], "tags": []}


def test_partial_words_and_snippets(api):
    long = "intro " * 40 + "the photosynthesis section starts here " + "outro " * 40
    note(api, title="Bio", content=long)
    notes = api("get", "/notes?q=photosyn").get_json()["notes"]
    assert notes[0]["excerpt"].startswith("…") and "photosynthesis" in notes[0]["excerpt"]


def test_tag_operator_and_phrases(api):
    note(api, title="A", content="exam prep notes", tags=["exam"])
    note(api, title="B", content="exam prep notes")
    note(api, title="C", content="prep for the exam", tags=["exam prep"])
    assert titles(api("get", "/notes?q=tag:exam")) == ["A"]
    assert titles(api("get", '/notes?q=tag:"exam prep"')) == ["C"]
    assert set(titles(api("get", '/notes?q="exam prep"'))) == {"A", "B"}


def test_sort_directions(api):
    for t in ["b", "a", "c"]:
        note(api, title=t)
    assert titles(api("get", "/notes?sort=title&order=asc")) == ["a", "b", "c"]
    assert titles(api("get", "/notes?sort=title&order=desc")) == ["c", "b", "a"]
    assert titles(api("get", "/notes?sort=created_at&order=asc")) == ["b", "a", "c"]


def test_manual_order_and_reorder(api):
    folder = api("post", "/folders", {"name": "F"}, expect=201).get_json()["folder"]
    a = note(api, title="a", folder_id=folder["id"])
    b = note(api, title="b", folder_id=folder["id"])
    c = note(api, title="c", folder_id=folder["id"])
    # New notes go to the top of the manual order.
    url = f"/notes?folder_id={folder['id']}&sort=position"
    assert titles(api("get", url)) == ["c", "b", "a"]
    api("post", "/notes/reorder", {"folder_id": folder["id"], "note_ids": [a["id"], c["id"]]}, expect=200)
    assert titles(api("get", url)) == ["a", "c", "b"]
    elsewhere = note(api, title="unfiled")
    res = api("post", "/notes/reorder", {"folder_id": folder["id"], "note_ids": [elsewhere["id"]]})
    assert res.status_code == 422 and res.get_json()["error"]["code"] == "invalid_order"


def test_relevance_without_query_falls_back(api):
    note(api, title="x")
    assert api("get", "/notes?sort=relevance").status_code == 200


def test_duplicate_and_star(api):
    folder = api("post", "/folders", {"name": "F"}, expect=201).get_json()["folder"]
    n = note(api, title="Orig", content="body", tags=["t"], folder_id=folder["id"], is_pinned=True)
    copy = api("post", f"/notes/{n['id']}/duplicate", expect=201).get_json()["note"]
    assert (copy["title"], copy["content"], copy["folder_id"]) == ("Orig (copy)", "body", folder["id"])
    assert [t["name"] for t in copy["tags"]] == ["t"] and copy["is_pinned"] is False
    starred = api("patch", f"/folders/{folder['id']}", {"is_starred": True}).get_json()["folder"]
    assert starred["is_starred"] is True
