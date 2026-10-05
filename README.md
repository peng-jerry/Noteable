# Noteable

A note-taking web app built for CMU 15-113 and hosted as part of my portfolio
([peng-jerry.github.io](https://peng-jerry.github.io)). Users sign up, then
create, edit and organise Markdown notes in nested folders. Everyone's notes are
private to their own account.

Noteable is designed as **the first part of a larger website**. The backend is
a general-purpose API with shared user accounts, and new features plug into it
as separate modules (see [Extending the backend](#extending-the-backend)).

| Part | Tech | Hosted on | Status |
|---|---|---|---|
| [`backend/`](backend/) | Flask REST API, SQLAlchemy, JWT auth | Render (web service) | ✅ Built |
| Database | PostgreSQL | Neon or Supabase (free tier) | ✅ Schema + migrations |
| [`frontend/`](frontend/) | React 19 + Vite SPA, Markdown editor | GitHub Pages (`/noteable`) | ✅ Built (not yet copied into the portfolio) |

## Features

| Feature | Backend | Frontend |
|---|---|---|
| Authentication (register, log in, log out, refresh, change password, delete account) | ✅ | ✅ |
| Public / private routing | ✅ protected endpoints | ✅ route guards |
| User-specific document storage | ✅ | — |
| Create / edit / delete notes, with autosave | ✅ | ✅ |
| Markdown editor with toolbar + live preview | ✅ stores Markdown | ✅ |
| Nested folders (create, rename, move, delete) | ✅ | ✅ |
| Search, pinning, sorting, pagination | ✅ | ✅ |
| Responsive UI (desktop / tablet / phone) + light/dark theme | — | ✅ |

---

## Project structure

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
│       ├── models/         ← User, Folder, Note, TokenBlocklist
│       └── api/            ← one package per feature, all under /api/v1
│           ├── __init__.py ← registers feature blueprints
│           ├── health.py
│           ├── auth/       ← routes.py + schemas.py
│           ├── folders/    ← routes.py + schemas.py + service.py
│           └── notes/      ← routes.py + schemas.py
└── frontend/
    ├── index.html          ← page shell, fonts, theme set before first paint
    ├── vite.config.js      ← build base /noteable/, test config
    ├── .env.development    ← VITE_API_URL for local dev
    ├── .env.production     ← VITE_API_URL for the Render backend
    └── src/
        ├── main.jsx        ← providers (toasts, auth) + router
        ├── App.jsx         ← route table: public / public-only / private
        ├── api/            ← fetch client (tokens, refresh, errors) + endpoint wrappers
        ├── auth/           ← AuthContext + RequireAuth / RedirectIfAuthed guards
        ├── pages/          ← Landing, Login/Register, Workspace, Note editor, Settings, errors
        ├── components/     ← Sidebar, FolderTree, NoteList, MarkdownEditor, Dialog, Menu, Toasts…
        ├── hooks/          ← useAutosave, useNoteList, useTheme, useMediaQuery…
        ├── utils/          ← folder tree, Markdown edits, dates, validation (pure, unit-tested)
        ├── styles/         ← plain CSS using the portfolio's design tokens
        └── test/           ← Vitest + Testing Library tests
```

## Running the backend locally

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

### Running tests

```bash
cd backend
pytest                          # in-memory SQLite, ~7 seconds
TEST_DATABASE_URL=postgresql://... pytest   # against a real (empty) Postgres DB
```

(Frontend tests: `cd frontend && npm test`. See [Running the frontend locally](#running-the-frontend-locally).)

The suite covers auth flows, token revocation, validation, folder nesting
rules, search and pagination, and checks that no user can read or change
another user's data. It passes on both SQLite and PostgreSQL.

### Environment variables

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

## Running the frontend locally

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
| `npm run build` | Production build into `frontend/dist/`, with asset paths under `/noteable/` |
| `npm run preview` | Serve that build at <http://localhost:5173/noteable/> to check it |

`VITE_API_URL` sets which backend the app talks to. `.env.development` points
at `http://localhost:5000/api/v1` and `.env.production` at
`https://noteable-api.onrender.com/api/v1`. Change the second one if Render
gives your service a different URL. To override either one locally, put the
value in `frontend/.env.local`, which git ignores. `VITE_BASE` changes the
`/noteable/` path prefix if you host the app somewhere else.

### How the frontend works

- **Routing.** It uses hash URLs (`/noteable/#/notes/<id>`). GitHub Pages only
  serves the portfolio's own `404.html`, so ordinary paths like
  `/noteable/notes/<id>` would break when the page is reloaded.

  | Route | Access |
  |---|---|
  | `/` | Public landing page |
  | `/login`, `/register` | Public only. Logged-in users are sent to `/notes` |
  | `/notes`, `/notes/:id`, `/settings` | Private. Logged-out users are sent to `/login`, then back to the page they asked for |

- **Sessions.** Tokens are kept in `localStorage`. The API client attaches the
  access token to each request. When it gets `token_expired`, it refreshes the
  token once (concurrent requests share that refresh) and retries. If the
  session can't be recovered, it shows the login page with a "session expired"
  message. Logging out in one tab logs out the others too.
- **Autosave.** Edits are saved about 0.9 s after you stop typing. Only the
  changed fields are sent. Saves happen one at a time and in order, failed
  saves are kept for a retry, and anything unsaved is saved when you switch
  notes. The browser warns before you close a tab with unsaved work, and
  `Ctrl/⌘+S` saves straight away.
- **Editor.** Markdown with a toolbar (bold, italic, heading, bulleted,
  numbered and check lists, quote, code, link) and the shortcuts `Ctrl/⌘+B`,
  `I`, `E` and `K`. Pressing Enter continues a list. The preview supports
  GitHub-flavoured Markdown (tables, task lists). Raw HTML in a note is never
  rendered, so a note can't inject scripts.
- **Layout.** Three panes at 1100 px and wider. On tablets the folders move
  into a slide-out drawer. On phones you see either the list or the open note,
  with a back button. The look reuses the portfolio's design: the same colour
  tokens, IBM Plex fonts and grid background. The light/dark choice is stored
  under the same key as the portfolio's, so it carries over between them.
- **Error handling.** Field-level messages on every form, using the same rules
  as the backend. Toasts for failed actions. Retry buttons when a list or note
  fails to load. A "waking up the server" hint when Render is cold-starting. A
  crash screen if a page throws. Friendly pages for a missing note, a missing
  folder, and 404s.

### Deploying the frontend (later step)

1. Make sure `VITE_API_URL` in `frontend/.env.production` matches the Render URL.
2. Run `npm run build`.
3. Copy everything in `frontend/dist/` into `peng-jerry.github.io/noteable/` and push the portfolio repo.
4. If the frontend is hosted anywhere other than `https://peng-jerry.github.io`,
   add that origin to `CORS_ORIGINS` on Render.

---

## API reference

Base URL: `/api/v1`. Every request and response body is JSON.

**Authentication:** protected endpoints need an `Authorization: Bearer
<access_token>` header. Access tokens last 15 minutes. When one expires, the
API returns `401` with code `token_expired`. The client then calls `POST
/auth/refresh` with the **refresh** token in the `Authorization` header, gets a
new access token, and retries the request. Any other `401` code means the user
should log in again.

### Auth: `/auth`

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

### Folders: `/folders` (all protected)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/folders` | — | `{folders: [...], unfiled_note_count}`: a flat list. Build the tree from `parent_id` |
| POST | `/folders` | `name`, `parent_id?` | `201` `{folder}` |
| GET | `/folders/:id` | — | `{folder, path: [{id,name}...], children: [...]}` (`path` is the breadcrumb trail) |
| PATCH | `/folders/:id` | `name?`, `parent_id?` (`null` = move to top level) | `{folder}` |
| DELETE | `/folders/:id` | — | `{deleted: {folders, notes}}`. **Also deletes all subfolders and notes inside** |

Every folder includes a `note_count`. Folder rules:

- Sibling folders can't share a name (case-insensitive) → `409 folder_name_taken`
- A folder can't be moved into itself or one of its subfolders → `422 invalid_parent`
- Folders can nest at most 10 levels deep → `422 max_depth_exceeded`

### Notes: `/notes` (all protected)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/notes` | see query parameters below | `{notes: [summary...], pagination}` |
| POST | `/notes` | `title?`, `content?`, `folder_id?`, `is_pinned?` | `201` `{note}` |
| GET | `/notes/:id` | — | `{note}` with the full `content` |
| PATCH | `/notes/:id` | any of `title`, `content`, `folder_id` (`null` = unfiled), `is_pinned` | `{note}` |
| DELETE | `/notes/:id` | — | `204` |

`content` is Markdown, up to 200,000 characters. A blank title becomes
`"Untitled"`. List results are **summaries**: they have an `excerpt` instead of
the full `content`.

`GET /notes` query parameters:

| Param | Values | Default |
|---|---|---|
| `folder_id` | a folder ID, or `unfiled` | all notes |
| `q` | text to search for in the title or content (case-insensitive) | — |
| `pinned` | `true` / `false` | — |
| `sort` | `updated_at`, `created_at`, `title` | `updated_at` |
| `order` | `asc`, `desc` | `desc` |
| `page`, `per_page` | integers (`per_page` ≤ 100) | `1`, `50` |

Pinned notes always come first.

### Other

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{status, database}`. Returns `503` if the database is unreachable (used by Render's health check) |

### Errors

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

## Database

```
users ─┬─< folders (parent_id → folders, nested)
       │      └─< notes
       ├─< notes (folder_id NULL = unfiled)
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

## Deployment (Render + Neon)

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

> Render's free web services go to sleep after ~15 minutes without traffic, so
> the first request after that can take ~30–60 seconds while the service wakes up.

## Extending the backend

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

## Security notes

- Passwords are hashed with scrypt (Werkzeug) and never returned by the API.
- A failed login gives the same response whether or not the email exists, and takes about the same time.
- Short-lived access tokens, plus refresh tokens that are revoked on logout.
  Changing the password invalidates every older token.
- Deleting an account requires both the password and a *fresh* token.
- Login, register and password endpoints are rate-limited per IP.
- CORS only allows the configured frontend origins.
- Request bodies are size-limited, and unknown fields are rejected.

## Known limitations

- Rate-limit counters are kept in memory for each gunicorn worker, so the real
  limit is roughly ×2 and resets when the service restarts. For stricter limits,
  point `RATELIMIT_STORAGE_URI` at Redis.
- Search uses a simple `LIKE` match, which is fine at this scale. Postgres
  full-text search would be the upgrade path.
- Tokens are stored in `localStorage`, which is the usual trade-off for a
  frontend on github.io talking to an API on onrender.com (cookies would be
  third-party and get blocked). The main risk is script injection (XSS), which
  is limited by never rendering raw HTML from notes.
- Notes aren't available offline. If a save fails, the editor keeps the
  changes and offers Retry, but they aren't kept once the tab is closed.
- Editing the same note in two tabs at once is last-write-wins.
