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

---

## Prompt 4: Neon and Render setup

> what do I now need to setup through neon & render

Answered in chat, with no code changes:
- **Neon:** create a project in AWS US West 2 (Oregon), close to Render's
  default region, and copy the direct (not pooled) connection string.
- **GitHub:** push the repo.
- **Render:** New → Blueprint, paste the string as `DATABASE_URL`, and check
  `/api/v1/health`.
- Also given: the manual Web Service settings as a fallback, and a reminder to
  update `frontend/.env.production` if the Render URL differs.

---

## Prompt 5: Render deploy error

> (pasted Render log) `gunicorn.errors.AppImportError: Failed to find attribute 'app' in 'app'.` … `Running 'gunicorn app:app'`

**Cause:** the service was created as a plain Web Service, so Render ran its
default start command, `gunicorn app:app`, instead of the one in `render.yaml`.
That also skipped the database migrations.

**Fix (Render settings, no code change):** Root Directory `backend`, Start
Command `flask --app wsgi db upgrade && gunicorn wsgi:app --workers 2 --timeout 60`,
Health Check Path `/api/v1/health`, plus the required environment variables.
Added a troubleshooting note about this error to the README's deployment section.

---

## Prompt 6: Add Noteable to the portfolio

> render & neon have been setup, create the intial copy of the project inside my portfolio

### Clarifying questions and answers

1. **Render URL.** `noteable-api.onrender.com` answered the health check, but
   with someone else's API (wrong response shape), so Render must have given
   this service a different name. → **`https://noteable-e5ba.onrender.com`**.
   Its health check showed `"service": "Noteable API"`, `"database": "ok"`, and
   CORS allowed `https://peng-jerry.github.io`.
2. **Scope.** → **Same as the PDF Combiner:** the app folder, a write-up page,
   and a projects card.

### What was done

- `frontend/.env.production` now points at the real Render URL.
- **Portfolio changes (not committed or pushed):**
  - `noteable/`: the production build.
  - `project12/index.html`: the write-up page. Header and footer copied from
    `project11`. It covers the three deployed pieces, auth and private routes,
    nested folders, autosave, the extensible backend, and the bugs testing and
    deployment caught.
  - `assets/project_cards/Noteable.png`: the card screenshot, taken from a
    local copy filled with demo notes so no demo data went into the live database.
  - `projects.html`: a new card after the PDF Combiner's.
- **Checked end to end against the live backend** by serving the portfolio
  locally from an allowed origin. Went card → write-up → app, registered a
  throwaway account, created and autosaved a note, reloaded, then deleted the
  account and confirmed it was gone.
- **README:** added the live links, marked the backend, database and frontend
  as deployed, and wrote the rebuild-into-the-portfolio command.

---

## Prompt 7: Reorganise the portfolio into `projects/`

> put all project folders into a folder labeled "projects", move assets into there as well

### Clarifying questions and answers

1. **Which folders?** → **All 17:** `project1`–`project12`, `portfolio/`,
   `crossyroad/`, `pdf-combiner/`, `trivia-game/` and `noteable/`.
2. **Which assets?** → **Project images only** (per-project image folders and
   card thumbnails) go to `projects/assets/`. The profile photo and resume stay
   in `/assets`.
3. **Old URLs?** → **Redirect them** with a root `404.html`.

### What was done (in the portfolio repo)

- Moved the folders with `git mv`, so their history is kept.
- Rewrote 48 links and image paths across 13 pages to the new
  `/projects/…` locations. That includes the CrossyRoad and PDF Combiner
  back-links and the trivia-game GitHub link.
- **Noteable:** default build base changed to `/projects/noteable/` in
  `frontend/vite.config.js`, rebuilt into `projects/noteable/`, and the README
  paths updated.
- **New root `404.html`.** GitHub Pages serves it for any missing path. Its
  script forwards old addresses (e.g. `/project11/`, `/noteable/#/login`) to
  their new location, keeping the query string and `#` part. Anything else gets
  a "page not found" page styled like the rest of the site.
- Refreshed the portfolio README's layout section.

### Checks

Ran a local server that mimics GitHub Pages:
- All 54 internal links and images on 19 pages resolve.
- 9 old URLs redirect correctly, and unknown URLs show the 404 page.
- Every project card image loads.
- Noteable works at `/projects/noteable/` and reaches the live Render API
  (tested with a failed login, so no data was created).
- The apps' back-links go to the moved write-ups.
- The 32 frontend tests still pass.

---

## Prompt 8: The big feature round

> Now I want to incorporate the following features: Tags, Search, Sorting,
> Templates/Template Creation, Import Markdown/text, Export, Trash/restore,
> Autosave, Adjustable Window widths. Are there any additional things do you
> think I can add? Ask all questions before you begin

Search, sorting and autosave already existed, so they were treated as
upgrades. I suggested extra features and asked three rounds of questions.

### Answers

- **Extra features chosen:** version history, note links & backlinks, drag &
  drop, duplicate & starred folders, note stats & outline. (Declined: quick
  switcher, code highlighting, public share links.)
- **Upgrades chosen:** better search (ranked full-text, highlighted matches,
  `tag:` filter), more sort options (per-view memory, Z–A / oldest, manual
  drag order), offline-safe autosave.
- **Tags:** coloured and managed, with multi-tag AND filtering.
- **Templates:** built-in plus your own, with placeholders, stored on the account.
- **Import:** files plus `.zip` with folders.
- **Export:** single note `.md` / `.txt`, PDF/print, and folder or
  everything as `.zip`.
- **Trash:** 30 days, folders included.
- **Widths:** drag plus collapse, saved per browser.
- **Versions:** automatic every 10 minutes plus manual.
- **Links:** update automatically on rename.
- **Portfolio:** rebuild and update the write-up.

### What was built

**Backend.** One migration adds the `tags`, `note_tags`, `templates`,
`note_versions` and `note_links` tables. Notes gain `position`, `deleted_at` and
`trashed_with`; folders gain `is_starred`, `deleted_at` and `trashed_with`.

- **New modules:** `tags/`, `templates/` (5 built-ins in code), `trash/` (with
  30-day purge on trash view, on login and via `flask purge-trash`), and
  `transfer/` (import with front matter, zip export).
- **Notes:** `notes/service.py` holds the tag, link, version and search logic.
  New endpoints for titles, reorder, duplicate, backlinks and versions; delete
  now moves to the trash. Search requires every term (partial words), supports
  `tag:` and phrases, and ranks with `ts_rank_cd` on Postgres. Renaming a note
  rewrites `[[links]]` to it.

**Frontend:**
- **Shared state:** a `WorkspaceContext` for folders, tags, titles, trash count
  and templates.
- **Panes:** a three-pane shell with draggable dividers (pointer and keyboard),
  collapsible sidebar and list, sizes saved per browser.
- **Drag & drop:** with `@dnd-kit` (mouse, touch long-press, keyboard for
  manual order), plus readable screen-reader announcements.
- **New pages and UI:** Trash and Templates panes; a tag input with
  autocomplete; a New-note split button with templates; an import dialog (zip
  via `fflate`, batched uploads); a version history dialog with a line diff
  (`diff`); a details panel (outline, stats, backlinks); `[[` autocomplete at
  the caret; a print/PDF view; `.md` / `.txt` export.
- **Autosave:** keeps drafts in `localStorage` until the server confirms them,
  retries with back-off and when back online, and offers recovery when the
  note is reopened.
- **Bundle splitting:** the signed-in app, version history and import are
  separate bundles. The main bundle went from 489 kB to 338 kB.

### Testing and bugs found

- **Backend:** 67 pytest tests (up from 39), passing on SQLite and PostgreSQL.
- **Migration:** checked on Postgres **with existing rows**. That caught a
  production-breaking bug: Alembic had written the new boolean column's default
  as SQLite's `0`, which Postgres rejects. It now uses `sa.false()`.
- **Frontend:** 51 Vitest tests (up from 32): link and outline helpers,
  templates, text export, zip import and batching, sort memory, and autosave
  drafts and retries.
- **Browser runs:** a 25-step headless-Chromium run covering every new feature
  (passing twice in a row), plus the previous 19-step run (passing four times
  in a row).
- **Bugs fixed along the way:**
  - The folder dialog could wipe text typed the instant it opened.
  - Trashing the folder you were viewing triggered a stale list request (404).
  - Drag & drop announced internal IDs to screen readers.
  - Tag colours were all grey because of a CSS specificity tie.
  - `[[links]]` showed raw in list excerpts.
  - A version restore at the 50-version limit could prune the version being
    restored.
  - A crash mid-save could lose the in-flight edit from the draft.

### Portfolio

- `projects/noteable/` rebuilt.
- The `projects/project12/` write-up now covers the new features (and its
  stale `/noteable/` paths were fixed).
- Nothing committed or pushed. The backend must be deployed before the
  portfolio (see README → Deploying the frontend).
