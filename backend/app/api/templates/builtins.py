"""Starter templates every account gets. Placeholders ({{date}}, {{time}},
{{datetime}}, {{weekday}}, {{title}}, {{folder}}) are filled in by the
client when a note is created, using the user's own clock and locale."""

BUILTIN_TEMPLATES = [
    {
        "id": "builtin-lecture",
        "name": "Lecture notes",
        "description": "Topics, key ideas, examples and questions for one class.",
        "title": "Lecture — {{date}}",
        "content": (
            "# {{title}}\n\n**Course:** {{folder}}  \n**Date:** {{weekday}}, {{date}}\n\n"
            "## Topics\n- \n\n## Key ideas\n- \n\n## Examples\n\n\n"
            "## Questions to follow up\n- [ ] \n"
        ),
    },
    {
        "id": "builtin-meeting",
        "name": "Meeting notes",
        "description": "Attendees, agenda, decisions and action items.",
        "title": "Meeting — {{date}}",
        "content": (
            "# {{title}}\n\n**When:** {{datetime}}  \n**Attendees:** \n\n"
            "## Agenda\n1. \n\n## Notes\n- \n\n## Decisions\n- \n\n"
            "## Action items\n- [ ] Who — what — by when\n"
        ),
    },
    {
        "id": "builtin-todo",
        "name": "To-do list",
        "description": "A checklist split by priority.",
        "title": "To-do — {{date}}",
        "content": "# {{title}}\n\n## Today\n- [ ] \n\n## This week\n- [ ] \n\n## Someday\n- [ ] \n",
    },
    {
        "id": "builtin-journal",
        "name": "Daily journal",
        "description": "A short daily reflection.",
        "title": "{{weekday}}, {{date}}",
        "content": (
            "# {{title}}\n\n## How I'm feeling\n\n\n## What happened\n\n\n"
            "## Grateful for\n- \n\n## Tomorrow\n- [ ] \n"
        ),
    },
    {
        "id": "builtin-project",
        "name": "Project plan",
        "description": "Goal, milestones, tasks and risks for a project.",
        "title": "Project: ",
        "content": (
            "# {{title}}\n\n> Started {{date}}\n\n## Goal\n\n\n## Milestones\n| Milestone | Due | Status |\n"
            "|---|---|---|\n|  |  |  |\n\n## Tasks\n- [ ] \n\n## Risks & open questions\n- \n"
        ),
    },
]

BUILTIN_IDS = {t["id"] for t in BUILTIN_TEMPLATES}


def builtin_dicts() -> list[dict]:
    return [{**t, "builtin": True, "created_at": None, "updated_at": None} for t in BUILTIN_TEMPLATES]
