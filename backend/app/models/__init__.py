"""All models are imported here so Flask-Migrate/Alembic can see them.

When you add a feature with its own tables, import its models here too.
"""

from .attachment import Attachment
from .folder import Folder
from .link import NoteLink
from .note import Note, note_tags
from .tag import TAG_COLORS, Tag
from .template import Template
from .token_blocklist import TokenBlocklist
from .user import User
from .version import NoteVersion

__all__ = [
    "Attachment",
    "User",
    "Folder",
    "Note",
    "note_tags",
    "NoteLink",
    "NoteVersion",
    "Tag",
    "TAG_COLORS",
    "Template",
    "TokenBlocklist",
]
