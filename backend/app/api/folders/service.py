"""Folder-tree logic kept out of the route handlers.

A user's whole folder tree is loaded at once (it is small) and walked in
memory, which keeps cycle and depth checks simple and database-agnostic.
"""

from sqlalchemy import func

from ...errors import ConflictError, NotFoundError, ValidationError
from ...extensions import db
from ...models import Folder, Note

MAX_DEPTH = 10  # a top-level folder is depth 1


def get_owned_folder(user_id: str, folder_id: str) -> Folder:
    """Return the folder if it belongs to the user, otherwise 404.

    Other users' folders get the same 404 as missing ones, so IDs can't be
    probed to find out what exists.
    """
    folder = Folder.query.filter_by(id=folder_id, user_id=user_id).first()
    if folder is None:
        raise NotFoundError("Folder not found.", code="folder_not_found")
    return folder


def resolve_parent(user_id: str, parent_id: str | None, field: str = "parent_id") -> Folder | None:
    """Look up a folder referenced from a request body (422 if it isn't usable)."""
    if parent_id is None:
        return None
    folder = Folder.query.filter_by(id=parent_id, user_id=user_id).first()
    if folder is None:
        raise ValidationError(
            "Folder not found.", details={field: ["Folder not found."]}
        )
    return folder


def folder_map(user_id: str) -> dict[str, Folder]:
    return {f.id: f for f in Folder.query.filter_by(user_id=user_id).all()}


def ancestors(folder: Folder, folders: dict[str, Folder]) -> list[Folder]:
    """Folders from the top level down to (but not including) `folder`."""
    chain = []
    parent_id = folder.parent_id
    while parent_id is not None and parent_id in folders:
        parent = folders[parent_id]
        chain.append(parent)
        parent_id = parent.parent_id
    return list(reversed(chain))


def descendant_ids(folder_id: str, folders: dict[str, Folder]) -> set[str]:
    children: dict[str | None, list[str]] = {}
    for f in folders.values():
        children.setdefault(f.parent_id, []).append(f.id)
    found, stack = set(), [folder_id]
    while stack:
        for child in children.get(stack.pop(), []):
            if child not in found:
                found.add(child)
                stack.append(child)
    return found


def _subtree_height(folder_id: str, folders: dict[str, Folder]) -> int:
    """1 for a folder with no subfolders, 2 if it has children, etc."""
    children: dict[str | None, list[str]] = {}
    for f in folders.values():
        children.setdefault(f.parent_id, []).append(f.id)

    def height(fid: str) -> int:
        return 1 + max((height(c) for c in children.get(fid, [])), default=0)

    return height(folder_id)


def ensure_unique_name(user_id: str, name: str, parent_id: str | None, exclude_id: str | None = None) -> None:
    """Sibling folders can't share a name (case-insensitive)."""
    query = Folder.query.filter(
        Folder.user_id == user_id,
        Folder.parent_id.is_(None) if parent_id is None else Folder.parent_id == parent_id,
        func.lower(Folder.name) == name.lower(),
    )
    if exclude_id:
        query = query.filter(Folder.id != exclude_id)
    if db.session.query(query.exists()).scalar():
        raise ConflictError(
            f'A folder named "{name}" already exists here.',
            code="folder_name_taken",
            details={"name": ["A folder with this name already exists here."]},
        )


def ensure_valid_placement(folder: Folder | None, new_parent: Folder | None, folders: dict[str, Folder]) -> None:
    """Reject moves that would create a cycle or exceed MAX_DEPTH.

    `folder` is None when creating a new (childless) folder.
    """
    if new_parent is None:
        parent_depth = 0
    else:
        if folder is not None and (
            new_parent.id == folder.id or new_parent.id in descendant_ids(folder.id, folders)
        ):
            raise ValidationError(
                "A folder can't be moved inside itself or one of its subfolders.",
                code="invalid_parent",
                details={"parent_id": ["A folder can't be moved inside itself or one of its subfolders."]},
            )
        parent_depth = len(ancestors(new_parent, folders)) + 1

    height = 1 if folder is None else _subtree_height(folder.id, folders)
    if parent_depth + height > MAX_DEPTH:
        raise ValidationError(
            f"Folders can be nested at most {MAX_DEPTH} levels deep.",
            code="max_depth_exceeded",
            details={"parent_id": [f"Folders can be nested at most {MAX_DEPTH} levels deep."]},
        )


def note_counts(user_id: str) -> dict[str | None, int]:
    rows = (
        db.session.query(Note.folder_id, func.count(Note.id))
        .filter(Note.user_id == user_id)
        .group_by(Note.folder_id)
        .all()
    )
    return {folder_id: count for folder_id, count in rows}
