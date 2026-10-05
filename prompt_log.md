# Prompt Log

A record of the prompts that shaped Noteable and the key decisions made in
response. New entries are added at the bottom as the project grows.

---

## Prompt 1: Project setup and backend

> Build a new repo folder titled "Noteable". I want to build a note-taking app
> which will work through my portfolio for a school project with the following
> features: Authentication, Public/private routing, User-specific document
> storage, Create/edit/delete notes, Markdown or rich-text editor, Folders,
> Responsive UI.
>
> Eventually, this will become one part of a larger website, so design the
> backend to be suitable for future additional work. The plan is to host it
> through Render.
>
> Should include a README & a prompt log, which must be two separate files;
> update these as things are added. Create the frontend and backend in separate
> folders. Good error handling.
>
> I will add more features in the following prompts. Start with creating any
> sections needed for the backend. Ask all questions before you begin.

### Clarifying questions and answers

Before writing any code, I asked eight questions:

1. **Backend stack:** Flask / Node + Express / FastAPI.
   → **Flask + SQLAlchemy**, the same Python/Flask setup as my PDF Combiner,
   using an app-factory and blueprint layout so new features can be added as modules.
2. **Database:** Neon/Supabase Postgres / Render Postgres / MongoDB / SQLite.
   → **Neon/Supabase Postgres** (free and doesn't expire; Render's free
   Postgres expires after ~30 days). SQLite is used for local development.
3. **Authentication:** email + password with JWT / session cookies / Google OAuth.
   → **Email + password with JWT** in the `Authorization` header. This avoids
   cross-site cookie problems between `github.io` and `onrender.com`, and the
   same accounts can be reused by future parts of the site.
4. **Frontend build and hosting:** React + Vite → github.io / plain HTML/JS / React → Render.
   → **React + Vite**, built into `peng-jerry.github.io/noteable`.
5. **Editor:** Markdown + live preview / rich text / both.
   → **Markdown with live preview**, stored as plain text.
6. **Folders:** nested / single level.
   → **Nested folders** (a `parent_id` tree).
7. **Git:** own repo / no git.
   → **Its own git repo** with a `.gitignore`. No commits unless asked.
8. **Docs layout:** one README + prompt log at the root / plus per-folder READMEs.
   → **One `README.md` and one `prompt_log.md` at the root.**

### What was built

- **Folder layout:** `backend/` and `frontend/` (an empty placeholder for now),
  `render.yaml` at the root.
- **App factory** (`app/__init__.py`) with config classes for development,
  testing and production, chosen by `APP_ENV`. Production refuses to start
  without its secrets.
- **Versioned, modular API:** every feature is a blueprint nested under
  `/api/v1`, with a documented 4-step recipe for adding new features later.
- **Models:** `User`, `Folder` (self-referencing for nesting), `Note`, and
  `TokenBlocklist`. All use UUID primary keys, UTC timestamps and
  `ON DELETE CASCADE` foreign keys.
- **Auth:** register, login, refresh, logout (revokes tokens), profile
  get/update, change password (invalidates all older tokens), and delete
  account (requires the password and a fresh token).
- **Folders:** CRUD, breadcrumb path, note counts, unique sibling names, cycle
  prevention, a 10-level depth limit, and cascading delete.
- **Notes:** CRUD, filter by folder or unfiled, search, pinned filter, sorting,
  and pagination. List responses return summaries with an excerpt.
- **Error handling:** one JSON error format (`{error: {code, message,
  details}}`) for everything: validation (per-field), malformed JSON, auth/JWT
  failures (separate codes so the frontend knows when to refresh), 404/405/413/429,
  database errors (rolled back, with 503 when the DB is down), and unexpected
  exceptions (logged, never leaked).
- **Security:** scrypt password hashing, login responses that don't reveal
  which emails exist, per-IP rate limiting on auth routes, CORS restricted to
  configured origins, a request size limit, and unknown fields rejected.
  Another user's data returns 404, never 403.
- **Migrations:** Flask-Migrate/Alembic with the initial schema. Render runs
  `db upgrade` on each deploy.
- **Tests:** a 39-test pytest suite. It passes on both SQLite and PostgreSQL,
  and the migration was checked upgrading, downgrading and upgrading again on
  Postgres.
- **Deployment:** `render.yaml` Blueprint (gunicorn, health check, generated
  secrets, `DATABASE_URL` entered by hand).

---

## Prompt 2: Which services need an account?

> what services do I need an account for

Answered in chat, with no code changes. You need three accounts, all on free
plans: **GitHub** (already have it; hosts the code and the portfolio frontend),
**Render** (runs the backend API) and **Neon** (Postgres database; Supabase
works instead). Node.js needs to be installed locally but doesn't need an account.

---

## Prompt 3: Build the frontend

> cool, start creating the frontend next, don't change anything in the
> portfolio yet, just in noteable

### Clarifying questions and answers

1. **Node.js** wasn't installed. → **A dedicated conda env `noteable`** with
   Node (`conda activate noteable`), so nothing system-wide changes.
2. **Look:** match the portfolio or a distinct identity? → **Match the
   portfolio**: same dark navy / sky / indigo tokens, IBM Plex fonts, grid
   background, plus a light/dark toggle.
3. **Saving:** autosave or a manual save button? → **Autosave**, with a
   saving / saved status and a warning about unsaved changes.
4. **Editor layout:** → **Split editor + preview on desktop, Write/Preview tabs
   on phones**, with a formatting toolbar.

### Key decisions

- **React 19 + Vite 8 + React Router 8**, plain CSS (no UI framework) built on
  the portfolio's design tokens. `react-markdown` + `remark-gfm` for previews,
  lazy-loaded so the login page doesn't download them.
- **Hash routing**, because GitHub Pages only serves the portfolio's root
  `404.html`, so normal deep links would break on reload under `/noteable/`.
- **The build uses the `/noteable/` base path**, ready to copy into the
  portfolio later. The portfolio itself was **not** touched, as requested.
- **Public / public-only / private route guards.** After logging in, users go
  back to the page they originally asked for.
- **The API client** refreshes expired tokens once, shared across concurrent
  requests, and turns network errors, timeouts (generous enough for Render cold
  starts) and non-JSON errors into one `ApiError` type.
- **Autosave hook:** debounced, sends only changed fields, one save at a time,
  merges edits made during a save, keeps failed saves for retry, saves on note
  switch, warns before closing the tab.
- **Responsive layout:** three panes on desktop, a folder drawer on tablets,
  one pane at a time on phones.

### Testing and fixes

- **32 Vitest tests:** folder-tree and Markdown helpers, validation, the API
  client's refresh and error handling, the autosave hook, and auth routing.
- **An end-to-end run in headless Chromium against the real Flask backend:**
  register, folders, notes, autosave, a reload to check persistence, search,
  pin, move, delete, settings, logout. Screenshots at desktop, tablet and phone
  sizes. The production build was also checked when served from `/noteable/`.
- **Bugs found this way and fixed:**
  - Deleting the folder you were viewing left the app on the deleted folder's URL.
  - A misleading "couldn't save" toast appeared when a note's folder was
    deleted mid-autosave.
  - Search sync trimmed spaces while typing.
  - `vite preview` used the wrong base path.
  - Polish: weak contrast on the primary and danger buttons, sticky hover on
    touch screens, raw Markdown in list excerpts, and a missing label on the
    phone's "New note" button.
