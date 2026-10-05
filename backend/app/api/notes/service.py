"""Note logic shared by the notes, trash, templates and import routes:
trash-aware lookups, tags, [[wiki links]], version snapshots and search."""

import re
from datetime import timedelta

from sqlalchemy import case, func, literal, or_

from ...errors import ConflictError, NotFoundError, ValidationError
from ...extensions import db
from ...models import TAG_COLORS, Note, NoteLink, NoteVersion, Tag
from ...models.base import as_utc, utcnow

MAX_TAGS_PER_NOTE = 20
AUTO_VERSION_INTERVAL = timedelta(minutes=10)
MAX_VERSIONS_PER_NOTE = 50

# ---------------------------------------------------------------- lookups


def active_notes(user_id: str):
    """Query for the user's notes that are not in the trash."""
    return Note.query.filter(Note.user_id == user_id, Note.deleted_at.is_(None))


def get_owned_note(user_id: str, note_id: str, *, trashed: bool = False) -> Note:
    """The user's note (404 otherwise). `trashed=True` looks in the trash instead."""
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    if note is None or (note.deleted_at is not None) != trashed:
        raise NotFoundError("Note not found.", code="note_not_found")
    return note


def top_position(user_id: str, folder_id: str | None) -> float:
    """A manual-order position that puts a note first in its folder."""
    folder_filter = Note.folder_id.is_(None) if folder_id is None else Note.folder_id == folder_id
    lowest = (
        db.session.query(func.min(Note.position))
        .filter(Note.user_id == user_id, Note.deleted_at.is_(None), folder_filter)
        .scalar()
    )
    return (lowest if lowest is not None else 1.0) - 1.0


# ---------------------------------------------------------------- tags


def clean_tag_name(raw: str) -> str:
    name = " ".join(str(raw).split()).lstrip("#").strip()
    if not name:
        raise ValidationError("Tag names can't be blank.", details={"tags": ["Tag names can't be blank."]})
    if len(name) > 40:
        raise ValidationError(
            "Tag names can be at most 40 characters.",
            details={"tags": ["Tag names can be at most 40 characters."]},
        )
    if "," in name:
        raise ValidationError("Tag names can't contain commas.", details={"tags": ["Tag names can't contain commas."]})
    return name


def get_or_create_tags(user_id: str, names: list[str]) -> list[Tag]:
    """Find tags by name (ignoring case), creating any that don't exist yet."""
    wanted: dict[str, str] = {}
    for raw in names:
        name = clean_tag_name(raw)
        wanted.setdefault(name.lower(), name)
    if len(wanted) > MAX_TAGS_PER_NOTE:
        raise ValidationError(
            f"A note can have at most {MAX_TAGS_PER_NOTE} tags.",
            details={"tags": [f"A note can have at most {MAX_TAGS_PER_NOTE} tags."]},
        )
    if not wanted:
        return []
    existing = {
        t.name_key: t
        for t in Tag.query.filter(Tag.user_id == user_id, Tag.name_key.in_(wanted)).all()
    }
    count = Tag.query.filter_by(user_id=user_id).count()
    tags = []
    for key, name in wanted.items():
        tag = existing.get(key)
        if tag is None:
            tag = Tag(user_id=user_id, color=TAG_COLORS[count % len(TAG_COLORS)])
            tag.set_name(name)
            db.session.add(tag)
            count += 1
        tags.append(tag)
    return tags


# ---------------------------------------------------------------- [[links]]

_FENCED = re.compile(r"```.*?(?:```|\Z)", re.S)
_INLINE_CODE = re.compile(r"`[^`\n]*`")
_WIKI_LINK = re.compile(r"\[\[([^\[\]\n]{1,200}?)\]\]")


def extract_link_keys(content: str) -> list[str]:
    """Lower-cased titles of [[links]] in the content, ignoring code."""
    text = _INLINE_CODE.sub("", _FENCED.sub("", content))
    keys = []
    for match in _WIKI_LINK.finditer(text):
        key = " ".join(match.group(1).split()).lower()
        if key and key not in keys:
            keys.append(key)
    return keys


def _note_by_title(user_id: str, key: str) -> Note | None:
    return (
        active_notes(user_id)
        .filter(func.lower(Note.title) == key)
        .order_by(Note.updated_at.desc())
        .first()
    )


def refresh_links(note: Note) -> None:
    """Re-read the note's [[links]] and record what they point to."""
    NoteLink.query.filter_by(source_id=note.id).delete()
    for key in extract_link_keys(note.content):
        target = _note_by_title(note.user_id, key)
        db.session.add(
            NoteLink(user_id=note.user_id, source_id=note.id, target_id=target.id if target else None, target_key=key)
        )


def claim_dangling_links(note: Note) -> None:
    """Point unresolved [[links]] that match this note's title at it."""
    NoteLink.query.filter(
        NoteLink.user_id == note.user_id,
        NoteLink.target_id.is_(None),
        NoteLink.target_key == note.title.lower(),
    ).update({NoteLink.target_id: note.id}, synchronize_session=False)


def rename_links(note: Note, old_title: str) -> int:
    """After a rename, rewrite [[old title]] to [[new title]] in linking notes.

    Returns how many other notes were updated.
    """
    if old_title == note.title:
        return 0
    pattern = re.compile(r"\[\[\s*" + re.escape(old_title).replace(r"\ ", r"\s+") + r"\s*\]\]", re.I)
    links = NoteLink.query.filter_by(user_id=note.user_id, target_id=note.id).all()
    updated = 0
    for source_id in {link.source_id for link in links}:
        source = db.session.get(Note, source_id)
        if source is None:
            continue
        new_content = pattern.sub(f"[[{note.title}]]", source.content)
        if new_content != source.content:
            source.content = new_content
            if source.id != note.id:
                updated += 1
    for link in links:
        link.target_key = note.title.lower()
    claim_dangling_links(note)
    return updated


def backlinks(note: Note) -> list[Note]:
    source_ids = db.session.query(NoteLink.source_id).filter(
        NoteLink.target_id == note.id, NoteLink.source_id != note.id
    )
    return active_notes(note.user_id).filter(Note.id.in_(source_ids)).order_by(Note.updated_at.desc()).all()


# ---------------------------------------------------------------- versions


def snapshot(note: Note, kind: str = "manual", label: str | None = None) -> NoteVersion:
    version = NoteVersion(note_id=note.id, title=note.title, content=note.content, kind=kind, label=label)
    db.session.add(version)
    db.session.flush()
    _prune_versions(note.id)
    return version


def maybe_auto_snapshot(note: Note) -> None:
    """Before an edit, keep the current text if the last snapshot is old enough."""
    if not note.content.strip():
        return  # nothing worth keeping yet
    latest = (
        NoteVersion.query.filter_by(note_id=note.id).order_by(NoteVersion.created_at.desc()).first()
    )
    if latest is None or utcnow() - as_utc(latest.created_at) >= AUTO_VERSION_INTERVAL:
        snapshot(note, "auto")


def _prune_versions(note_id: str) -> None:
    stale = (
        NoteVersion.query.filter_by(note_id=note_id)
        .order_by(NoteVersion.created_at.desc())
        .offset(MAX_VERSIONS_PER_NOTE)
        .all()
    )
    for version in stale:
        db.session.delete(version)


def ensure_editable(note: Note) -> None:
    if note.deleted_at is not None:
        raise ConflictError("This note is in the trash. Restore it to edit it.", code="note_in_trash")


# ---------------------------------------------------------------- search

_TOKEN = re.compile(r'tag:"([^"]+)"|tag:(\S+)|"([^"]+)"|(\S+)', re.I)


def parse_search(q: str) -> tuple[list[str], list[str]]:
    """Split a search box string into (text terms, tag names).

    `tag:exam` and `tag:"exam prep"` filter by tag; quoted text is a phrase.
    """
    terms, tags = [], []
    for tag_bare, tag_quoted, phrase, word in ((m.group(1), m.group(2), m.group(3), m.group(4)) for m in _TOKEN.finditer(q)):
        if tag_bare or tag_quoted:
            tags.append((tag_bare or tag_quoted).strip().lower())
        elif phrase or word:
            term = (phrase or word).strip()
            if term:
                terms.append(term)
    return terms[:10], tags[:10]


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def apply_search(query, terms: list[str], tag_names: list[str]):
    """Filter a note query by text terms (every term must match the title or
    content) and tag names. Returns (query, relevance expression or None)."""
    for name in tag_names:
        query = query.filter(Note.tags.any(Tag.name_key == name))
    if not terms:
        return query, None

    title, content = func.lower(Note.title), func.lower(Note.content)
    score = literal(0.0)
    for term in terms:
        pattern = f"%{_escape_like(term.lower())}%"
        in_title = title.like(pattern, escape="\\")
        in_content = content.like(pattern, escape="\\")
        query = query.filter(or_(in_title, in_content))
        score = score + case((in_title, 3.0), else_=0.0) + case((in_content, 1.0), else_=0.0)

    if db.engine.dialect.name == "postgresql":
        # Postgres full-text ranking (stemmed: "running" also weighs "run").
        lexemes = [w for t in terms for w in re.findall(r"\w+", t.lower())]
        if lexemes:
            tsquery = func.to_tsquery("english", " | ".join(f"{w}:*" for w in lexemes))
            document = func.to_tsvector("english", func.coalesce(Note.title, "") + " " + func.coalesce(Note.content, ""))
            score = score + func.ts_rank_cd(document, tsquery) * 10
    return query, score


def snippet(content: str, terms: list[str], radius: int = 70) -> str:
    """A short excerpt of the content around the first matching term."""
    text = " ".join(content.split())
    lowered = text.lower()
    hits = [lowered.find(t.lower()) for t in terms if lowered.find(t.lower()) >= 0]
    if not hits:
        return text[: radius * 2].rstrip() + ("…" if len(text) > radius * 2 else "")
    start = max(0, min(hits) - radius)
    end = min(len(text), min(hits) + radius)
    return ("…" if start > 0 else "") + text[start:end].strip() + ("…" if end < len(text) else "")
