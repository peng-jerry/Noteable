import io
import json
import zipfile
from datetime import timedelta

from app.api.attachments.service import MAX_IMAGE_BYTES, purge_orphans
from app.extensions import db
from app.models import Attachment

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 32


def upload(client, headers, data=PNG, name="pic.png", **form):
    body = {"file": (io.BytesIO(data), name), **{k: str(v) for k, v in form.items()}}
    return client.post("/api/v1/attachments", headers=headers, data=body, content_type="multipart/form-data")


def test_upload_and_download(client, auth):
    res = upload(client, auth, kind="photo", width=640, height=480)
    assert res.status_code == 201, res.get_json()
    att = res.get_json()["attachment"]
    assert (att["kind"], att["mime_type"], att["width"], att["size"]) == ("photo", "image/png", 640, len(PNG))
    assert att["markdown"] == f"![Photo](attachment:{att['id']})"

    img = client.get(f"/api/v1/attachments/{att['id']}", headers=auth)
    assert img.status_code == 200 and img.data == PNG
    assert img.mimetype == "image/png"
    assert img.headers["X-Attachment-Kind"] == "photo"
    assert img.headers["X-Content-Type-Options"] == "nosniff"
    # Revalidation: an unchanged image answers 304.
    again = client.get(f"/api/v1/attachments/{att['id']}", headers={**auth, "If-None-Match": img.headers["ETag"]})
    assert again.status_code == 304


def test_type_is_sniffed_not_trusted(client, auth):
    assert upload(client, auth, data=JPEG, name="looks.png").get_json()["attachment"]["mime_type"] == "image/jpeg"
    assert upload(client, auth, data=WEBP, name="x").get_json()["attachment"]["mime_type"] == "image/webp"
    svg = upload(client, auth, data=b"<svg onload=alert(1)>", name="x.svg")
    assert svg.status_code == 415 and svg.get_json()["error"]["code"] == "unsupported_image"


def test_validation_and_limits(client, auth):
    res = client.post("/api/v1/attachments", headers=auth, data={}, content_type="multipart/form-data")
    assert res.status_code == 422
    assert upload(client, auth, kind="video").status_code == 422
    assert upload(client, auth, width="huge").status_code == 422
    assert upload(client, auth, doodle="not json").status_code == 422
    assert upload(client, auth, note_id="not-a-note").status_code == 422
    big = upload(client, auth, data=PNG + b"\x00" * MAX_IMAGE_BYTES)
    assert big.status_code == 413 and big.get_json()["error"]["code"] == "image_too_large"


def test_uploads_bigger_than_the_json_limit_are_allowed(client, auth, app):
    # The API's normal body limit is 1 MB; images may be up to 5 MB.
    two_mb = PNG + b"\x00" * (2 * 1024 * 1024)
    assert upload(client, auth, data=two_mb).status_code == 201


def test_doodle_strokes_round_trip_and_replace_in_place(client, auth):
    strokes = {"width": 1200, "height": 750, "strokes": [{"tool": "pen", "color": "#000", "size": 4, "points": [[1, 2, 0.5]]}]}
    att = upload(client, auth, kind="doodle", doodle=json.dumps(strokes)).get_json()["attachment"]
    got = client.get(f"/api/v1/attachments/{att['id']}/doodle", headers=auth).get_json()
    assert got["doodle"] == strokes

    strokes["strokes"].append({"tool": "eraser", "size": 10, "points": [[3, 4, 0.5]]})
    body = {"file": (io.BytesIO(JPEG), "d.jpg"), "kind": "doodle", "doodle": json.dumps(strokes)}
    res = client.put(f"/api/v1/attachments/{att['id']}", headers=auth, data=body, content_type="multipart/form-data")
    assert res.status_code == 200 and res.get_json()["attachment"]["id"] == att["id"]
    assert client.get(f"/api/v1/attachments/{att['id']}", headers=auth).data == JPEG
    assert len(client.get(f"/api/v1/attachments/{att['id']}/doodle", headers=auth).get_json()["doodle"]["strokes"]) == 2

    photo = upload(client, auth).get_json()["attachment"]
    assert client.get(f"/api/v1/attachments/{photo['id']}/doodle", headers=auth).status_code == 404


def test_images_are_private_and_deletable(client, auth, register):
    att = upload(client, auth).get_json()["attachment"]
    bob, _ = register(email="bob@example.com")
    assert client.get(f"/api/v1/attachments/{att['id']}", headers=bob).status_code == 404
    assert client.delete(f"/api/v1/attachments/{att['id']}", headers=bob).status_code == 404
    assert client.get(f"/api/v1/attachments/{att['id']}").status_code == 401
    assert client.delete(f"/api/v1/attachments/{att['id']}", headers=auth).status_code == 204
    assert client.get(f"/api/v1/attachments/{att['id']}", headers=auth).status_code == 404


def test_unused_images_are_purged_after_a_day(client, auth, api):
    used = upload(client, auth).get_json()["attachment"]
    in_trash = upload(client, auth).get_json()["attachment"]
    in_template = upload(client, auth).get_json()["attachment"]
    orphan = upload(client, auth).get_json()["attachment"]
    fresh = upload(client, auth).get_json()["attachment"]
    api("post", "/notes", {"content": f"![p](attachment:{used['id']})"}, expect=201)
    trashed = api("post", "/notes", {"content": f"![p](attachment:{in_trash['id']})"}, expect=201).get_json()["note"]
    api("delete", f"/notes/{trashed['id']}", expect=204)
    api("post", "/templates", {"name": "t", "content": f"![p](attachment:{in_template['id']})"}, expect=201)
    for a in Attachment.query.filter(Attachment.id != fresh["id"]):
        a.created_at = a.created_at - timedelta(days=2)
    db.session.commit()

    assert purge_orphans() == 1
    remaining = {a.id for a in Attachment.query}
    assert remaining == {used["id"], in_trash["id"], in_template["id"], fresh["id"]}
    assert orphan["id"] not in remaining


def test_export_includes_images_with_relative_links(client, auth, api):
    att = upload(client, auth, kind="doodle", doodle=json.dumps({"strokes": []})).get_json()["attachment"]
    folder = api("post", "/folders", {"name": "School"}, expect=201).get_json()["folder"]
    note = api(
        "post", "/notes", {"title": "Drawing", "content": f"![Doodle](attachment:{att['id']})", "folder_id": folder["id"]}, expect=201
    ).get_json()["note"]

    everything = zipfile.ZipFile(io.BytesIO(client.get("/api/v1/export", headers=auth).data))
    assert f"_images/{att['id']}.png" in everything.namelist()
    assert f"_images/{att['id']}.doodle.json" in everything.namelist()
    assert everything.read(f"_images/{att['id']}.png") == PNG
    assert f"](../_images/{att['id']}.png)" in everything.read("School/Drawing.md").decode()

    single = zipfile.ZipFile(io.BytesIO(client.get(f"/api/v1/export?note_id={note['id']}", headers=auth).data))
    assert sorted(single.namelist()) == sorted(["Drawing.md", f"_images/{att['id']}.png", f"_images/{att['id']}.doodle.json"])
    assert f"](_images/{att['id']}.png)" in single.read("Drawing.md").decode()
    assert client.get("/api/v1/export?note_id=nope", headers=auth).status_code == 404
