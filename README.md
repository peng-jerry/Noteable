# Noteable

> **✏️ Jerry — sections marked "To write" are for you.** The course requires the
> README to be written in your own words, with any AI-generated documentation
> kept at the bottom under a clearly labelled heading. Everything Claude wrote
> is now in [AI-generated documentation](#ai-generated-documentation) below.
> Each "To write" box lists what the course asks for and facts you can check
> against. Delete each box (and this note) once you've written that section.

**Live app:** <https://peng-jerry.github.io/projects/noteable/> ·
**Write-up:** <https://peng-jerry.github.io/projects/project12/> ·
**Prompt log:** [prompt_log.md](prompt_log.md)

## What it does

> **To write:** what Noteable is and who it's for, in a few sentences.
> Facts: a Markdown note-taking web app with accounts, nested folders,
> coloured tags, templates, `[[links]]` between notes, version history, a
> 30-day trash, and import/export. React frontend on GitHub Pages, Flask API
> on Render, PostgreSQL on Neon. It's built as the first part of a larger site.

## How to use it

> **To write:** a short walkthrough for someone opening it for the first time:
> sign up, create a folder, write a note (Markdown, `[[` to link a note), tag
> it, search with `tag:name`, start a note from a template (▾ next to New
> note), drag notes onto folders, find things in Trash, and use the ⋯ menu
> for version history and export. Newer toolbar items: table, doodle, take a
> picture, indent/outdent, and ticking checklist boxes in the preview.
> Mention the first visit can take up to a minute while the free Render
> server wakes up.

## Features I'm most proud of

> **To write:** pick two to four and say *why*, in your own words.
> Possible candidates: offline-safe autosave with draft recovery; `[[links]]`
> that survive renames, plus backlinks; version history with a diff; trash that
> restores whole folders; import/export that round-trips through a `.zip`; drag
> & drop that also works with touch and the keyboard; the API designed to grow
> into a larger site; editable doodles; the in-app camera; tables you Tab
> through.

## Running it locally

> **To write:** the steps in your own words. Facts to check against:
> - Backend (Python 3.12+): `cd backend`, `python3 -m venv .venv`,
>   `source .venv/bin/activate`, `pip install -r requirements-dev.txt`,
>   `cp .env.example .env`, `flask --app wsgi db upgrade`,
>   `flask --app wsgi run --debug` → <http://127.0.0.1:5000>. Uses SQLite
>   locally, so no database setup is needed.
> - Frontend (Node 22.22+; on this machine `conda activate noteable`):
>   `cd frontend`, `npm install`, `npm run dev` → <http://localhost:5173>.
> - Tests: `pytest` in `backend/`, `npm test` in `frontend/`.

## How secrets are handled

> **To write:** facts to check against:
> - The backend needs `SECRET_KEY`, `JWT_SECRET_KEY` and `DATABASE_URL`. Locally
>   they go in `backend/.env`, which `.gitignore` excludes. `.env.example` is
>   only a template with placeholder values.
> - In production they're set in Render's dashboard: Render generated the two
>   keys, and the Neon connection string was pasted in by hand. None are in
>   git. The app refuses to start in production if any are missing, so it can
>   never run with the development defaults.
> - The frontend has no secrets. `VITE_API_URL` is a public address, which is
>   why `frontend/.env.production` is committed.
> - User passwords are stored only as scrypt hashes. Login tokens are JWTs kept
>   in the browser's `localStorage`. Logging out or changing your password
>   revokes them on the server.

## How I used AI

> **To write:** a brief summary of how you used AI and how you directed it.
> For example: you set the requirements and made the design choices through
> Claude's clarifying questions, it wrote the code and docs and tested them,
> and you handled the accounts and deployment (GitHub, Render, Neon), debugged
> the Render deploy error, and reviewed the results. Point to
> [prompt_log.md](prompt_log.md) for the full record.

### Citations

> **To check / edit:** a draft list of sources. Keep what applies.

- **Claude Code** (Anthropic), model **Claude Opus 5.5**, used in VS Code.
  It generated essentially all of the code, tests and the AI-generated
  documentation below, over 4–7 October 2026.
- **Backend libraries:** Flask, Flask-SQLAlchemy, Flask-Migrate (Alembic),
  Flask-JWT-Extended, Flask-Limiter, Flask-Cors, marshmallow, psycopg,
  gunicorn.
- **Frontend libraries:** React, React Router, Vite, react-markdown,
  remark-gfm, rehype-slug, @dnd-kit (drag & drop), fflate (zip), diff
  (version comparison).
- **Testing:** pytest, Vitest, Testing Library. Playwright was used to drive a
  real browser during development (not part of the repo).
- **Visual design:** reuses my portfolio's design. Its colour palette was
  adapted from [Linbo Gao's portfolio](https://linbo271828-cell.github.io/github.io/),
  and the typeface is IBM Plex Sans / Mono by IBM (SIL Open Font License).
  The icon shapes follow the style of [Lucide](https://lucide.dev) (ISC
  licence).
- **Textarea caret positioning** for `[[` autocomplete uses the common
  "mirror div" technique (as in the `textarea-caret-position` library).

---

## AI-generated documentation

*Everything below this line was written by Claude (Anthropic) via Claude Code,
as technical reference for the project. It is not part of my own write-up
above.*

A note-taking web app built for CMU 15-113 and hosted as part of my portfolio
([peng-jerry.github.io](https://peng-jerry.github.io)). Users sign up, then
create, edit and organise Markdown notes in nested folders. Everyone's notes are
private to their own account.

Noteable is designed as **the first part of a larger website**. The backend is
a general-purpose API with shared user accounts, and new features plug into it
as separate modules (see [Extending the backend](#extending-the-backend)).

**Live:** app at <https://peng-jerry.github.io/projects/noteable/> · write-up at
<https://peng-jerry.github.io/projects/project12/> · API health at
<https://noteable-e5ba.onrender.com/api/v1/health>

| Part | Tech | Hosted on | Status |
|---|---|---|---|
| [`backend/`](backend/) | Flask REST API, SQLAlchemy, JWT auth | Render (`noteable-e5ba.onrender.com`) | ✅ Deployed |
| Database | PostgreSQL | Neon (free tier) | ✅ Deployed |
| [`frontend/`](frontend/) | React 19 + Vite SPA, Markdown editor | GitHub Pages (`/projects/noteable/`) | ✅ Built into the portfolio's `projects/noteable/` folder |

### Features

| Feature | Backend | Frontend |
|---|---|---|
| Authentication (register, log in, log out, refresh, change password, delete account) | ✅ | ✅ |
| Public / private routing | ✅ protected endpoints | ✅ route guards |
| User-specific document storage | ✅ | — |
| Create / edit / delete notes, with autosave | ✅ | ✅ |
| Markdown editor with toolbar + live preview | ✅ stores Markdown | ✅ |
| Nested folders (create, rename, move, star, delete) | ✅ | ✅ |
| Coloured, managed tags with multi-tag (AND) filtering | ✅ | ✅ |
| Search: ranked full-text (Postgres), partial words, `tag:` filters, highlighted matches | ✅ | ✅ |
| Sorting: 8 orders, remembered per view, manual drag order in folders | ✅ | ✅ |
| Templates: 5 built-in + your own, with `{{date}}`-style placeholders | ✅ | ✅ |
| Import `.md` / `.txt` / `.zip` (keeps folders); export `.md`, `.txt`, PDF, `.zip` | ✅ | ✅ |
| Trash with restore; items deleted for good after 30 days | ✅ | ✅ |
| Offline-safe autosave: drafts kept in the browser, auto-retry, recovery | — | ✅ |
| Version history: auto + named snapshots, diff, restore | ✅ | ✅ |
| `[[Note links]]` with autocomplete, backlinks, rename-safe | ✅ | ✅ |
| Drag & drop: notes onto folders, folders into folders | ✅ | ✅ |
| Duplicate notes; starred folders | ✅ | ✅ |
| Outline, stats and backlinks panel | ✅ backlinks | ✅ |
| Doodles: draw with pen/highlighter/eraser, editable later | ✅ stores image + strokes | ✅ |
| Take a picture (in-app camera) or add an existing image | ✅ image storage | ✅ |
| Tables: size picker, Tab between cells, auto-aligned columns | — | ✅ |
| List buttons work on empty lines; Tab/Shift+Tab nest lists (• ◦ ▪ / 1. a. i.) | — | ✅ |
| Tick checklist items in the preview (or `Ctrl/⌘+Enter`) | — | ✅ |
| Resizable / collapsible panes (remembered per browser) | — | ✅ |
| Responsive UI (desktop / tablet / phone) + light/dark theme | — | ✅ |

---

### Project structure

```
Noteable/
├── README.md               ← you are here
├── prompt_log.md           ← history of prompts and decisions
├── render.yaml             ← Render Blueprint (deploys the backend)
├── backend/
│   ├── wsgi.py             ← entry point (gunicorn + flask CLI)
│   ├── requirements.txt    ← production deps (requirements-dev.txt adds pytest)
│   ├── .env.example        ← copy to .env for local dev
│   ├── migrations/         ← Alembic database migrations
│   ├── tests/              ← pytest suite
│   └── app/
│       ├── __init__.py     ← create_app() factory
│       ├── config.py       ← dev / testing / production settings from env vars
│       ├── extensions.py   ← db, migrate, jwt, cors, limiter
│       ├── errors.py       ← error classes + JSON error handlers
│       ├── common/         ← shared helpers: auth, request parsing, validation, pagination
│       ├── models/         ← User, Folder, Note, Tag, Template, NoteVersion, NoteLink, TokenBlocklist
│       └── api/            ← one package per feature, all under /api/v1
│           ├── __init__.py ← registers feature blueprints
│           ├── health.py
│           ├── auth/       ← routes.py + schemas.py
│           ├── folders/    ← routes.py + schemas.py + service.py
│           ├── notes/      ← routes.py + schemas.py + service.py (tags, links, versions, search)
│           ├── tags/       ← tag management
│           ├── templates/  ← routes.py + builtins.py (the 5 starter templates)
│           ├── trash/      ← routes.py + service.py (30-day retention, purge)
│           └── transfer/   ← import / export
└── frontend/
    ├── index.html          ← page shell, fonts, theme set before first paint
    ├── vite.config.js      ← build base /projects/noteable/, test config
    ├── .env.development    ← VITE_API_URL for local dev
    ├── .env.production     ← VITE_API_URL for the Render backend
    └── src/
        ├── main.jsx        ← providers (toasts, auth) + router
        ├── App.jsx         ← route table: public / public-only / private
        ├── api/            ← fetch client (tokens, refresh, errors) + endpoint wrappers
        ├── auth/           ← AuthContext + RequireAuth / RedirectIfAuthed guards
        ├── pages/          ← Landing, Login/Register, Workspace, Note editor, Trash, Templates, Settings…
        ├── workspace/      ← WorkspaceContext: folders, tags, titles, trash count, templates
        ├── components/     ← Sidebar, FolderTree, NoteList, MarkdownEditor, Tags, VersionHistory,
        │                     ImportDialog, InfoPanel, Resizer, Dialog, Menu, Toasts…
        ├── hooks/          ← useAutosave (drafts + retry), useNoteList, useLayoutPrefs, useTheme…
        ├── utils/          ← folder tree, Markdown edits, [[links]], templates, import, sorting (unit-tested)
        ├── styles/         ← plain CSS using the portfolio's design tokens
        └── test/           ← Vitest + Testing Library tests
```

### Running the backend locally

Requires Python 3.12+.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # then edit the secrets if you like
flask --app wsgi db upgrade     # creates the local SQLite database
flask --app wsgi run --debug    # http://127.0.0.1:5000
```

Check it's up: <http://127.0.0.1:5000/api/v1/health>.

Without a `DATABASE_URL`, the app uses a local SQLite file at
`backend/instance/noteable-dev.db`. To develop against Postgres, set
`DATABASE_URL` in `.env`.

#### Running tests

```bash
cd backend
pytest                          # in-memory SQLite, ~7 seconds
TEST_DATABASE_URL=postgresql://... pytest   # against a real (empty) Postgres DB
```

(Frontend tests: `cd frontend && npm test`. See [Running the frontend locally](#running-the-frontend-locally).)

The suite covers auth flows, token revocation, validation, folder nesting
rules, search and pagination, and checks that no user can read or change
another user's data. It passes on both SQLite and PostgreSQL.

#### Environment variables

| Variable | Required in prod | Default | Purpose |
|---|---|---|---|
| `APP_ENV` | ✅ (`production`) | `development` | Selects the config class |
| `SECRET_KEY` | ✅ | dev placeholder | Flask secret |
| `JWT_SECRET_KEY` | ✅ | dev placeholder | Signs JWTs |
| `DATABASE_URL` | ✅ | local SQLite | Postgres connection string (`postgres://` and `postgresql://` both work) |
| `CORS_ORIGINS` | ✅ | `http://localhost:5173` | Comma-separated frontend origins (no path) |
| `JWT_ACCESS_MINUTES` | | `15` | Access-token lifetime |
| `JWT_REFRESH_DAYS` | | `30` | Refresh-token lifetime |
| `RATELIMIT_AUTH` | | `10 per minute` | Per-IP limit on login/register/password endpoints |
| `RATELIMIT_DEFAULT` | | `300 per minute` | Per-IP limit on everything else |
| `MAX_CONTENT_LENGTH` | | `1048576` | Max request size in bytes |
| `PROXY_HOPS` | | `1` | Reverse proxies in front of the app (for real client IPs) |
| `LOG_LEVEL` | | `INFO` | Logging level |

In production the app **refuses to start** if any required variable is
missing, so it never runs with the development secrets.

### Running the frontend locally

Requires Node.js 22.22+ (React Router 8's minimum). A conda environment with
Node is already set up on this machine:

```bash
conda activate noteable          # or use any Node 22.22+ install
cd frontend
npm install
npm run dev                      # http://localhost:5173 (expects the backend on :5000)
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Run the Vitest suite once (`npm run test:watch` to keep watching) |
| `npm run build` | Production build into `frontend/dist/`, with asset paths under `/projects/noteable/` |
| `npm run preview` | Serve that build at <http://localhost:5173/projects/noteable/> to check it |

`VITE_API_URL` sets which backend the app talks to. `.env.development` points
at `http://localhost:5000/api/v1` and `.env.production` at
`https://noteable-e5ba.onrender.com/api/v1`. Change the second one if Render
gives your service a different URL. To override either one locally, put the
value in `frontend/.env.local`, which git ignores. `VITE_BASE` changes the
`/projects/noteable/` path prefix if you host the app somewhere else.

#### How the frontend works

- **Routing.** It uses hash URLs (`/projects/noteable/#/notes/<id>`). GitHub Pages only
  serves the portfolio's own `404.html`, so ordinary paths like
  `/projects/noteable/notes/<id>` would break when the page is reloaded.

  | Route | Access |
  |---|---|
  | `/` | Public landing page |
  | `/login`, `/register` | Public only. Logged-in users are sent to `/notes` |
  | `/notes`, `/notes/:id`, `/trash[/:id]`, `/templates[/:id]`, `/new?title=…`, `/settings` | Private. Logged-out users are sent to `/login`, then back to the page they asked for |

  The signed-in part of the app is a separate code bundle, so the public pages
  load quickly. Version history and import are split out further and only
  load when opened.

- **Sessions.** Tokens are kept in `localStorage`. The API client attaches the
  access token to each request. When it gets `token_expired`, it refreshes the
  token once (concurrent requests share that refresh) and retries. If the
  session can't be recovered, it shows the login page with a "session expired"
  message. Logging out in one tab logs out the others too.
- **Autosave.** Edits are saved about 0.9 s after you stop typing. Only the
  changed fields are sent. Saves happen one at a time and in order, and
  anything unsaved is saved when you switch notes. Until the server confirms a
  save, the unsent changes are also kept in `localStorage`. Failed saves retry
  with back-off (3 s → 60 s), and again as soon as the browser is back online;
  the status shows "Offline — saved on this device". If the tab closed first,
  reopening the note shows a banner offering to restore the draft. The browser
  warns before you close a tab with unsaved work, and `Ctrl/⌘+S` saves
  straight away.
- **Links between notes.** Type `[[` to get title suggestions. In the preview,
  `[[Title]]` becomes a link, and a link to a note that doesn't exist yet
  creates it when clicked. The details panel (⧉ button) shows the outline,
  stats and the notes that link here. Renaming a note updates the link text
  everywhere.
- **Organising.** Tags are added from the note header and filtered from the
  sidebar; several tags together means notes with all of them. Search accepts
  `tag:name`, `tag:"two words"` and `"exact phrases"`. The sort choice is
  remembered for each folder or view, and "Manual" (folders only) lets you
  drag notes into order; the grip handle also works with the keyboard. Notes
  can be dragged onto sidebar folders or Unfiled, and folders onto folders or
  the Folders heading (top level). On touch screens, long-press to drag.
- **Note menu (⋯).** Version history, duplicate, save as template, export as
  `.md` / `.txt`, print or save as PDF, and move to trash (with Undo).
- **Templates.** Templates (in the sidebar) lists the built-in ones (read-only,
  but they can be duplicated) and yours (editable, autosaved). Placeholders
  `{{date}}`, `{{time}}`, `{{datetime}}`, `{{weekday}}`, `{{title}}` and
  `{{folder}}` are filled in from your own clock and locale when used. Pick a
  template from the ▾ next to "New note".
- **Import / export.** List ⋯ menu → Import (or drop files onto the note list).
  `.zip` files are unpacked in the browser and sent in batches. Folder menu →
  Export as .zip; list menu → Export all notes. Exports include a small
  front-matter header (title, tags, pinned), so they re-import losslessly.
- **Editor.** Markdown with a toolbar in four groups: text (bold, italic,
  heading); lists (bulleted, numbered, checklist, quote, decrease/increase
  indent); links (code, link, `[[note link]]`); and inserts (table, doodle,
  picture). Shortcuts: `Ctrl/⌘+B`, `I`, `E`, `K`, `Ctrl/⌘+S` (save now) and
  `Ctrl/⌘+Enter` (tick the checklist item on the cursor's line). The preview
  supports GitHub-flavoured Markdown (tables, task lists). Raw HTML in a note
  is never rendered, so a note can't inject scripts.
- **Lists.** The list buttons work on an empty line: the marker appears and
  the cursor goes after it. Numbered lists continue from the item above.
  Enter continues a list and renumbers the items after it. Enter on an empty
  nested item moves it out a level; on an empty top-level item it ends the
  list and leaves a blank line, so the next paragraph isn't folded into it.
  **Tab / Shift+Tab** (or the indent buttons, which also work on phones) nest
  and un-nest items, at most one level below the item above (any deeper and
  Markdown would turn it into a code block). Each level renumbers itself, and
  the preview shows outline styles: • ◦ ▪ for bullets and 1. a. i. for
  numbers. Outside lists and tables, Tab moves focus out of the editor as
  usual, so keyboard users never get stuck.
- **Checklists.** Click a box in the preview to tick or untick it; this edits
  `[ ]` ↔ `[x]` in the note and autosaves. Ticked items are struck through.
- **Tables.** The table button opens a size picker (hover, or use the arrow
  keys, then Enter) for up to 8 × 8 cells plus a header row. Inside a table,
  Tab / Shift+Tab move between cells, selecting each cell's text; Tab in the
  last cell adds a row. Columns are re-aligned on each move so the Markdown
  stays readable.
- **Doodles.** A drawing pad with pen (pressure-sensitive with a stylus),
  highlighter and eraser, 7 colours, 3 sizes, undo/redo and clear. It saves a
  PNG on a white "paper" background (readable in dark mode too) plus the
  strokes, so "Edit doodle" (hover a doodle in the preview) reopens it for
  more drawing and updates it in place. Closing with unsaved strokes asks
  first.
- **Pictures.** "Take or add a picture" opens a live camera preview, using
  the browser's camera permission, with shutter, retake and front/back
  switching. It works on laptops with a webcam and on phones. "Choose image"
  adds an existing PNG, JPEG, GIF or WebP instead. Big images are shrunk in
  the browser (to at most 1600 px, JPEG) before upload. If the camera is
  blocked or missing, the dialog says so and offers the image picker.
- **How pictures are stored.** Each picture is an *attachment* in the
  database, referenced in the note as `![Photo](attachment:<id>)`. The
  preview fetches it with your login token and shows it from a `blob:` URL,
  so nobody else can load it. Pictures are inserted with blank lines around
  them, so they never merge into a table or list above.
- **Layout.** Three panes at 1100 px and wider. Drag the dividers to resize
  the sidebar, the note list, and the editor/preview split; double-click a
  divider (or press Enter on it) to reset it. The header's panel button hides
  the sidebar, and the editor's list button hides the note list. Sizes are
  remembered per browser. On tablets the folders move into a slide-out drawer. On phones you see either the list or the open note,
  with a back button. The look reuses the portfolio's design: the same colour
  tokens, IBM Plex fonts and grid background. The light/dark choice is stored
  under the same key as the portfolio's, so it carries over between them.
- **Error handling.** Field-level messages on every form, using the same rules
  as the backend. Toasts for failed actions. Retry buttons when a list or note
  fails to load. A "waking up the server" hint when Render is cold-starting. A
  crash screen if a page throws. Friendly pages for a missing note, a missing
  folder, and 404s.

#### Deploying the frontend

The live copy is in the portfolio repo's `projects/noteable/` folder. After changing the
frontend, rebuild straight into that folder, then commit and push the portfolio:

```bash
cd frontend
npm run build -- --outDir ../../peng-jerry.github.io/projects/noteable --emptyOutDir
```

**Order matters when the API changes:** push this repo first and wait until
Render shows the deploy as live (it runs the database migration on start).
Only then push the portfolio. Otherwise the new frontend calls endpoints the
old backend doesn't have yet.

1. `VITE_API_URL` in `frontend/.env.production` must match the Render URL
   (currently `https://noteable-e5ba.onrender.com/api/v1`).
2. If the frontend is hosted anywhere other than `https://peng-jerry.github.io`,
   add that origin to `CORS_ORIGINS` on Render.

---

### API reference

Base URL: `/api/v1`. Every request and response body is JSON.

**Authentication:** protected endpoints need an `Authorization: Bearer
<access_token>` header. Access tokens last 15 minutes. When one expires, the
API returns `401` with code `token_expired`. The client then calls `POST
/auth/refresh` with the **refresh** token in the `Authorization` header, gets a
new access token, and retries the request. Any other `401` code means the user
should log in again.

#### Auth: `/auth`

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | public | `email`, `password`, `display_name?` | `201` `{user, access_token, refresh_token}` |
| POST | `/auth/login` | public | `email`, `password` | `{user, access_token, refresh_token}` |
| POST | `/auth/refresh` | refresh token | — | `{access_token}` |
| POST | `/auth/logout` | access | `refresh_token?` | Revokes the access token (and the refresh token if sent) |
| GET | `/auth/me` | access | — | `{user}` |
| PATCH | `/auth/me` | access | `display_name` | `{user}` |
| POST | `/auth/me/password` | access | `current_password`, `new_password` | New tokens. Signs out every other session |
| DELETE | `/auth/me` | **fresh** access token (from login) | `password` | `204`. Deletes the account and all its data |

Passwords must be 8–128 characters and include at least one letter and one
number. Emails are case-insensitive.

#### Folders: `/folders` (all protected)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/folders` | — | `{folders: [...], unfiled_note_count}`: a flat list. Build the tree from `parent_id` |
| POST | `/folders` | `name`, `parent_id?` | `201` `{folder}` |
| GET | `/folders/:id` | — | `{folder, path: [{id,name}...], children: [...]}` (`path` is the breadcrumb trail) |
| PATCH | `/folders/:id` | `name?`, `parent_id?` (`null` = move to top level), `is_starred?` | `{folder}` |
| DELETE | `/folders/:id` | — | `{trashed: {folders, notes}}`. Moves it **and everything inside** to the trash |

Every folder includes a `note_count`. Folder rules:

- Sibling folders can't share a name (case-insensitive) → `409 folder_name_taken`
- A folder can't be moved into itself or one of its subfolders → `422 invalid_parent`
- Folders can nest at most 10 levels deep → `422 max_depth_exceeded`

#### Notes: `/notes` (all protected)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/notes` | see query parameters below | `{notes: [summary...], pagination}` |
| POST | `/notes` | `title?`, `content?`, `folder_id?`, `is_pinned?`, `tags?` (names) | `201` `{note}` |
| GET | `/notes/titles` | — | `{notes: [{id, title, folder_id}]}` for link autocomplete |
| POST | `/notes/reorder` | `folder_id` (`null` = unfiled), `note_ids` | Saves a manual order |
| GET | `/notes/:id` | — | `{note}` with the full `content` |
| PATCH | `/notes/:id` | any of `title`, `content`, `folder_id`, `is_pinned`, `tags` (replaces them; new names are created) | `{note, links_updated}` |
| DELETE | `/notes/:id` | — | `204`. Moves the note to the trash |
| POST | `/notes/:id/duplicate` | — | `201` `{note}` titled "… (copy)" |
| GET | `/notes/:id/backlinks` | — | `{backlinks: [{id, title, excerpt}]}` |
| GET | `/notes/:id/versions` | — | `{versions}` (newest first, no content) |
| POST | `/notes/:id/versions` | `label?` | `201` `{version}`, a named snapshot |
| GET | `/notes/:id/versions/:vid` | — | `{version}` with content |
| POST | `/notes/:id/versions/:vid/restore` | — | `{note}`. The current text is saved as a version first |

Notes include `tags: [{id, name, color}]` and `position` (manual order).
While you edit, a snapshot of the previous text is kept at most every 10
minutes, up to 50 versions per note. `[[Links]]` are recorded on save. When a
note is renamed, `[[Old title]]` is rewritten in every note that links to it,
and `links_updated` says how many notes changed.

`content` is Markdown, up to 200,000 characters. A blank title becomes
`"Untitled"`. List results are **summaries**: they have an `excerpt` instead of
the full `content`.

`GET /notes` query parameters:

| Param | Values | Default |
|---|---|---|
| `folder_id` | a folder ID, or `unfiled` | all notes |
| `q` | search text: every word must appear in the title or content (partial words match). Also `tag:name`, `tag:"two words"`, `"exact phrase"` | — |
| `tags` | comma-separated tag IDs; a note must have **all** of them | — |
| `pinned` | `true` / `false` | — |
| `sort` | `updated_at`, `created_at`, `title`, `relevance` (with `q`), `position` (manual) | `updated_at` |
| `order` | `asc`, `desc` | `desc` |
| `page`, `per_page` | integers (`per_page` ≤ 100) | `1`, `50` |

Pinned notes always come first, except in manual (`position`) order. With `q`,
each result's `excerpt` is a snippet around the first match, and the response
includes `search: {terms, tags}` for highlighting. On Postgres, `relevance`
combines title/content matches with full-text ranking (`ts_rank_cd`), so
stemmed forms like "running" and "run" count too.

#### Tags: `/tags` (all protected)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/tags` | — | `{tags: [{id, name, color, note_count}], colors}` |
| POST | `/tags` | `name`, `color?` | `201` `{tag}` (`409 tag_name_taken` if it exists) |
| PATCH | `/tags/:id` | `name?`, `color?` | `{tag}` |
| DELETE | `/tags/:id` | — | `204`. The tag is removed from notes; the notes stay |

Tag names are 1–40 characters, without commas, unique per user ignoring case,
with at most 20 per note. Colours are names (`sky`, `indigo`, `violet`, `rose`,
`orange`, `amber`, `emerald`, `teal`, `slate`) that the frontend maps to theme-safe shades.

#### Templates: `/templates` (all protected)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/templates` | — | `{templates}`: built-ins (`builtin: true`, id `builtin-…`) then yours |
| POST | `/templates` | `name`, `description?`, `title?`, `content?` | `201` `{template}` |
| PATCH | `/templates/:id` | any of the above | `{template}` (`403` for built-ins) |
| DELETE | `/templates/:id` | — | `204` |

#### Trash: `/trash` (all protected)

| Method | Path | Returns |
|---|---|---|
| GET | `/trash` | `{items: [{type: "note"\|"folder", …, deleted_at, expires_at, location}], retention_days}`. Purges expired items first |
| GET | `/trash/count` | `{count}` (sidebar badge) |
| GET | `/trash/notes/:id` | `{note}`, read-only preview |
| POST | `/trash/notes/:id/restore` | `{note}`. Goes to Unfiled if its folder is gone |
| POST | `/trash/folders/:id/restore` | `{folder}`. Brings back everything trashed with it; top level if the parent is gone; renamed "… (restored)" on a name clash |
| DELETE | `/trash/notes/:id`, `/trash/folders/:id` | `204`. Permanent |
| DELETE | `/trash` | `{deleted}`. Empties the trash |

Items are permanently deleted 30 days after being trashed. This happens the
next time the trash is opened, on login, or via `flask --app wsgi purge-trash`
(Render's free tier has no cron).

#### Import / export (protected)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/import` | `folder_id?`, `files: [{path, content}]` (≤ 100 per request) | `{created: {notes, folders}, notes, skipped}` |
| GET | `/export` | `?folder_id=` or `?note_id=` (omit both for everything) | A `.zip` of `.md` files that keeps the folder structure, plus an `_images/` folder |

Import creates folders from paths (`School/15-113/week1.md`), reusing ones with
the same name. Titles come from front matter `title:`, else the first
`# heading`, else the file name. Front matter `tags:` and `pinned:` are applied
and the header is removed. Export writes that same header, so exports
round-trip.

**Pictures in exports:** images go in `_images/<id>.<ext>` (doodles also get
`<id>.doodle.json` with their strokes), and each note's
`attachment:<id>` links become relative paths such as `../_images/<id>.png`.
The browser-side importer reverses this. It finds images that notes link to
by relative path (in a `.zip`, or picked alongside the notes), uploads them
first (doodles stay editable), then rewrites the links before sending the
notes.

#### Attachments (images): `/attachments` (protected)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/attachments` | multipart: `file`, `kind` (`photo`\|`doodle`\|`image`), `width?`, `height?`, `note_id?`, `doodle?` (JSON strokes) | `201` `{attachment}` including its `markdown` |
| GET | `/attachments/:id` | — | The image bytes, with `X-Attachment-Kind`. Revalidated with an ETag (`304` if unchanged) |
| GET | `/attachments/:id/doodle` | — | `{doodle}`: the editable strokes (`404 not_a_doodle` otherwise) |
| PUT | `/attachments/:id` | as POST | Replaces the image (and strokes) in place, so notes keep the same reference |
| DELETE | `/attachments/:id` | — | `204` |

- **Limits:** images up to 5 MB (this route alone allows bodies larger than
  the API's normal 1 MB). The type is checked from the file's bytes, not its
  name, and only PNG, JPEG, GIF and WebP are accepted. SVG is refused because
  it can carry scripts (`415 unsupported_image`).
- **Sharing:** attachments belong to the user, not one note, so duplicates,
  version history and templates can share them.
- **Cleanup:** an attachment older than a day that no note (including
  trashed ones), version or template mentions is deleted, alongside the
  30-day trash purge.

#### Other

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{status, database}`. Returns `503` if the database is unreachable (used by Render's health check) |

#### Errors

Every error has the same shape, whatever caused it:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Some fields are invalid.",
    "details": { "password": ["Password must be at least 8 characters."] }
  }
}
```

| Status | Example `code`s | When |
|---|---|---|
| 400 | `missing_body`, `invalid_json`, `invalid_content_type` | Malformed request |
| 401 | `token_missing`, `token_expired`, `token_invalid`, `token_revoked`, `invalid_credentials` | Not authenticated |
| 404 | `not_found`, `note_not_found`, `folder_not_found` | Missing **or belongs to another user** (the two look identical on purpose) |
| 405 | `method_not_allowed` | Wrong HTTP method |
| 409 | `email_taken`, `folder_name_taken`, `conflict` | Duplicate data |
| 413 | `payload_too_large` | Body over 1 MB |
| 422 | `validation_error`, `empty_update`, `invalid_parent`, `max_depth_exceeded` | Invalid fields (`details` lists the problem for each field). Unknown fields are rejected too |
| 429 | `rate_limited` | Too many requests |
| 500 / 503 | `internal_error`, `database_error`, `service_unavailable` | Server-side problem. Logged with a traceback, but internals never reach the client |

---

### Database

```
users ─┬─< folders (parent_id → folders, nested; deleted_at/trashed_with = trash)
       │      └─< notes
       ├─< notes (folder_id NULL = unfiled; position = manual order; deleted_at = trash)
       │      ├─< note_versions (snapshots)
       │      ├─< note_links (source → target, target_key = lower-cased title)
       │      └─>< tags (via note_tags)
       ├─< tags
       ├─< templates
       ├─< attachments (image bytes + doodle strokes; referenced as attachment:<id>)
       └─< token_blocklist (revoked JWTs)
```

- Primary keys are UUIDs, so IDs can't be guessed and are safe to use in future share links.
- Every query is filtered by the signed-in user's ID, and ownership is checked on every request.
- Foreign keys use `ON DELETE CASCADE`: deleting a user or folder removes everything under it.
- The schema is managed by **Flask-Migrate (Alembic)**. After changing a model, run:
  ```bash
  flask --app wsgi db migrate -m "describe the change"
  flask --app wsgi db upgrade
  ```
  and commit the new file in `migrations/versions/`. On Render, `db upgrade` runs automatically on every deploy.
- Maintenance: `flask --app wsgi purge-tokens` deletes revoked-token records that have expired anyway.

### Deployment (Render + Neon)

1. **Create the database.** Make a free project on [Neon](https://neon.tech)
   (or [Supabase](https://supabase.com)) and copy its Postgres connection
   string (it includes `?sslmode=require`).
2. **Push this repo to GitHub.**
3. **Create the service.** In Render, choose **New → Blueprint** and select the
   repo. Render reads [`render.yaml`](render.yaml), generates `SECRET_KEY` and
   `JWT_SECRET_KEY`, and asks you for `DATABASE_URL`. Paste the Neon string.
4. Deploy. Render installs the requirements, runs migrations, starts gunicorn,
   and checks `/api/v1/health`.
5. If the frontend is served from somewhere other than
   `https://peng-jerry.github.io`, update `CORS_ORIGINS` in Render.

**Troubleshooting:** if the deploy log ends with `Failed to find attribute
'app' in 'app'` after `Running 'gunicorn app:app'`, Render is using its default
start command. This happens when the service is created with **New → Web
Service** instead of the Blueprint. In **Settings → Build & Deploy**, set Root
Directory to `backend` and Start Command to
`flask --app wsgi db upgrade && gunicorn wsgi:app --workers 2 --timeout 60`.
Then add the environment variables from the table above (`APP_ENV=production`,
`SECRET_KEY`, `JWT_SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGINS`).

> Render's free web services go to sleep after ~15 minutes without traffic, so
> the first request after that can take ~30–60 seconds while the service wakes up.

### Extending the backend

The backend is laid out so that other sections of the wider site can be added
without changing existing ones:

- **One account system.** `users` and `/api/v1/auth` aren't specific to notes.
  Any new feature protects its routes with `@jwt_required()` and reads the user
  with `current_user()` from `app/common/auth.py`.
- **A package per feature.** To add one, e.g. `app/api/<feature>/`:
  1. Write `routes.py` (a `bp` Blueprint) and `schemas.py` (marshmallow validation).
  2. Add models in `app/models/` and import them in `app/models/__init__.py`.
     Keep feature data in its own tables that reference `users.id`.
  3. Register the blueprint in `FEATURE_BLUEPRINTS` in `app/api/__init__.py`.
  4. Run `flask db migrate` / `flask db upgrade`.
- **Shared building blocks.** `load_body` / `load_query` for validated input,
  the `APIError` classes for errors, and `paginate` for list endpoints.
- **Versioned API.** Everything lives under `/api/v1`. A future breaking change
  goes in a new `v2` blueprint, so existing clients keep working.

### Security notes

- Passwords are hashed with scrypt (Werkzeug) and never returned by the API.
- A failed login gives the same response whether or not the email exists, and takes about the same time.
- Short-lived access tokens, plus refresh tokens that are revoked on logout.
  Changing the password invalidates every older token.
- Deleting an account requires both the password and a *fresh* token.
- Login, register and password endpoints are rate-limited per IP.
- CORS only allows the configured frontend origins.
- Request bodies are size-limited, and unknown fields are rejected.

### Known limitations

- Rate-limit counters are kept in memory for each gunicorn worker, so the real
  limit is roughly ×2 and resets when the service restarts. For stricter limits,
  point `RATELIMIT_STORAGE_URI` at Redis.
- Search filters with `LIKE` (so partial words match) and uses Postgres
  full-text search only for ranking, without a dedicated index. That's fine
  for one person's notes; a much larger dataset would want a `pg_trgm` or
  GIN index.
- Tokens are stored in `localStorage`, which is the usual trade-off for a
  frontend on github.io talking to an API on onrender.com (cookies would be
  third-party and get blocked). The main risk is script injection (XSS), which
  is limited by never rendering raw HTML from notes.
- Pictures are stored in the Postgres database. Neon's free tier has 0.5 GB,
  roughly 1,500 browser-shrunk photos. A busier site would move images to
  object storage (S3, Cloudinary) and keep only the references.
- Images inside table cells aren't supported. Pictures are always inserted
  as their own paragraph.
- Offline support covers saving edits to notes that are already open. Notes
  can't be opened or created without a connection.
- Editing the same note in two tabs at once is last-write-wins. Version
  history makes this recoverable, but there's no live merge.
- Drag & drop needs a mouse or touch screen (manual order also works from the
  keyboard). Everything it does is also available from menus and the folder
  picker.
- Layout sizes are stored per browser, not per account (as chosen).
