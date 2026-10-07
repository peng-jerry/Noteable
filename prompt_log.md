# Prompt log: Noteable

## Tools used

- **Claude Code** (Anthropic), model **Claude Opus 5.5**, running in the VS Code
  extension. Used for all of it: clarifying questions and feature
  brainstorming, writing the backend, frontend, tests and docs, running and
  debugging them, and the portfolio integration.
- **Claude on the web** (claude.ai): used to check requirements, come up with
  names and explain the database and backend setup (see "Which tool for
  which job" below).
- **Development and testing tools Claude ran:** pytest (backend tests, on
  SQLite and a throwaway PostgreSQL server), Vitest + Testing Library
  (frontend tests), Playwright (scripted runs in a real Chromium browser,
  outside the repo), and a local server that mimics GitHub Pages.
- **Services I set up myself:** GitHub (repos), Neon (PostgreSQL database),
  Render (backend hosting).

### Which tool for which job

Everything was run with Claude Code. Both the IDE & the web version were used. The web version was used to verify requirements, generate idea names and explain database & backend setup. The IDE was used to create the backend & frontend, and debug code. 

## Development process

All work happened between **4 and 7 October 2026**, in this order:

1. **Planning and backend** (Prompt 1): 8 design questions answered first, then
   the Flask API (auth, folders, notes), migrations, a 39-test suite, and Render
   config.
2. **Accounts** (Prompt 2), then the **frontend** (Prompt 3): 4 more design
   questions, then the React app, 32 tests, and a browser test run that found
   and fixed real bugs.
3. **Deployment** (Prompts 4–6): Neon and Render set up; the Render start-command
   failure debugged from the pasted log; the real Render URL found; the app,
   write-up page and project card added to the portfolio and tested against
   the live backend.
4. **Portfolio restructure** (Prompt 7): all projects moved under `projects/`,
   with redirects for old links.
5. **Feature round** (Prompt 8): 12 more design questions, then tags, search,
   sorting, templates, import/export, trash, version history, `[[links]]`, drag
   & drop, offline-safe autosave and resizable panes. Tests went to 67 backend
   and 51 frontend, plus 25-step and 19-step browser runs.
6. **Documentation for submission** (Prompt 9).
7. **My own code change** (Prompts 10–11): I added a built-in template
   (`builtin-jerry`) to `backend/app/api/templates/builtins.py`, asked Claude
   to check the syntax, fixed the Markdown issues it pointed out, and had it
   recheck.
8. **Drawing, pictures and editing round** (Prompt 12): 7 more design
   questions, then doodles, the camera, image storage, tables, list
   buttons on empty lines, Tab nesting, and clickable checklists. Tests went
   to 75 backend and 73 frontend, plus a 15-step browser run that includes a
   fake camera.
9. **Requirements check** (Prompt 13): reviewed the README, prompt log,
   repos and live site against the course requirements.
10. **Portfolio update** (Prompt 14): I pushed the pictures/doodles round and
    Render deployed it. Then the portfolio copy was rebuilt and the write-up
    updated.
11. **Writing my sections** (Prompts 15–17): I wrote the README and prompt-log
    sections myself; a recheck caught that saving from an older editor copy
    had overwritten later AI-written additions, which were restored around my
    text.

### Parts I wrote or substantially changed myself

I went through the codebase and added an additional built-in template directly through the codebase titled "Day in the life of Jerry" which every account created will have. It has a built-in tag to show that it was originally created as a part of the codebase. I learned a lot through creating this template as I got to explore the file structure. I found the Project Structure Diagram that Claude made very useful for this part. 

## One place AI got it wrong

 **Confidently wrong URL.** Claude assumed the backend would live at
   `noteable-api.onrender.com` (from the service name in `render.yaml`) and put
   that address in the frontend config and docs. Render had given that name to
   someone else's service, so the build would have sent the users' logins to
   a stranger's API. It was caught only when the health check returned a
   response in the wrong format, and fixed with the real URL (`noteable-e5ba.onrender.com`). I had to do some debugging and corrected it to the actual URL that render had assigned. 

---

## Prompts

### Prompt 1: Project setup and backend

```
Alright, now build a new repo folder titled "Noteable", in this folder

I want to build a note taking app which will  work through my portfolio for a school project with the following features:

Authentication
Public/private routing
User-specific document storage
Create/edit/delete notes
Markdown or rich-text editor
Folders
Responsive UI

Eventually, this will become one part of a larger website so design the backend to be suitable for future additional work
The plan is to host it through render

Should include a Readme & a prompt log, which must be two separate files, update these are things are added
Create the frontend and backend in separate folders
Good error handling

I will add more features in the following prompts

Start with creating any sections needed for the backend

Ask all questions before you begin
```

**Selected** (8 questions):
- **Backend:** Flask + SQLAlchemy
- **Database:** Neon/Supabase Postgres
- **Auth:** Email + password, JWT
- **Frontend:** React + Vite → github.io
- **Editor:** Markdown + live preview
- **Folders:** Nested folders
- **Git:** Yes, git init + .gitignore
- **Docs:** One of each at the root

**Result:**
- **Backend:** a Flask app factory with a blueprint per feature under a
  versioned `/api/v1`; JWT auth with refresh, logout revocation and
  password-change invalidation; nested folders with cycle and depth checks;
  notes with search, sort and pagination.
- **Error handling:** one JSON error format for every failure; rate limiting.
- **Database and deploy:** Alembic migrations and a `render.yaml` Blueprint.
- **Tests:** 39 pytest tests, passing on SQLite and PostgreSQL.

### Prompt 2: Accounts

```
what services do I need an account for
```

**Result:** Answered in chat: GitHub (already had it), Render (backend),
Neon (database). Node.js needs installing locally but no account.

### Prompt 3: Frontend

```
cool, start creating the frontend next, don't change anything in the portfolio yet, just in noteable
```

**Selected** (4 questions):
- **Node.js:** Conda env 'noteable'
- **Look:** Match my portfolio
- **Saving:** Autosave
- **Editor:** Split + tabs on mobile

**Result:**
- **App:** React 19 + Vite + React Router 8 with hash routing (GitHub Pages
  only serves the portfolio's own 404 page), public / public-only / private
  route guards, and an API client that refreshes expired tokens once and
  retries.
- **Editing:** an ordered autosave queue; a Markdown editor with toolbar and
  live preview.
- **Layout:** three panes on desktop, a drawer on tablets, one pane at a time
  on phones.
- **Tests:** 32 Vitest tests, plus a headless-Chromium run of the whole app.
- **Bugs found and fixed:**
  - Deleting the folder you were viewing left the app stuck on it.
  - The search box trimmed spaces while typing.
  - The production preview used the wrong base path.
  - Button contrast, touch-screen hover, raw Markdown in excerpts, and a
    missing screen-reader label.

### Prompt 4: Neon and Render setup

```
what do I now need to setup through neon & render
```

**Result:** Step-by-step instructions: a Neon project in AWS US West 2, using the
direct connection string; push to GitHub; Render → New → Blueprint, then paste
`DATABASE_URL`; check `/api/v1/health`. The manual Web Service settings were
given as a fallback.

### Prompt 5: Render deploy error

```
Traceback (most recent call last):
  File "/opt/render/project/src/.venv/lib/python3.12/site-packages/gunicorn/util.py", line 463, in import_app
    app = getattr(mod, name)
          ^^^^^^^^^^^^^^^^^^
AttributeError: module 'app' has no attribute 'app'
During handling of the above exception, another exception occurred:
Traceback (most recent call last):
  File "/opt/render/project/src/.venv/bin/gunicorn", line 8, in <module>
    sys.exit(run())
             ^^^^^
  File "/opt/render/project/src/.venv/lib/python3.12/site-packages/gunicorn/app/wsgiapp.py", line 66, in run
    WSGIApplication("%(prog)s [OPTIONS] [APP_MODULE]", prog=prog).run()
  File "/opt/render/project/src/.venv/lib/python3.12/site-packages/gunicorn/app/base.py", line 235, in run
    super().run()
  File "/opt/render/project/src/.venv/lib/python3.12/site-packages/gunicorn/app/base.py", line 71, in run
    Arbiter(self).run()
    ^^^^^^^^^^^^^
  File "/opt/render/project/src/.venv/lib/python3.12/site-packages/gunicorn/arbiter.py", line 63, in __init__
    self.setup(app)
  File "/opt/render/project/src/.venv/lib/python3.12/site-packages/gunicorn/arbiter.py", line 164, in setup
    self.app.wsgi()
  File "/opt/render/project/src/.venv/lib/python3.12/site-packages/gunicorn/app/base.py", line 66, in wsgi
    self.callable = self.load()
                    ^^^^^^^^^^^
  File "/opt/render/project/src/.venv/lib/python3.12/site-packages/gunicorn/app/wsgiapp.py", line 57, in load
    return self.load_wsgiapp()
           ^^^^^^^^^^^^^^^^^^^
  File "/opt/render/project/src/.venv/lib/python3.12/site-packages/gunicorn/app/wsgiapp.py", line 47, in load_wsgiapp
    return util.import_app(self.app_uri)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/render/project/src/.venv/lib/python3.12/site-packages/gunicorn/util.py", line 467, in import_app
    raise AppImportError("Failed to find attribute %r in %r." % (name, module))
gunicorn.errors.AppImportError: Failed to find attribute 'app' in 'app'.
==> Exited with status 1
==> Common ways to troubleshoot your deploy: https://render.com/docs/troubleshooting-deploys
==> Running 'gunicorn app:app'
```

**Result:** The service had been created as a plain Web Service, so Render ran
its default start command and skipped the migrations. The fix was in Render's
settings: Root Directory `backend`, Start Command
`flask --app wsgi db upgrade && gunicorn wsgi:app --workers 2 --timeout 60`,
plus the required environment variables. A troubleshooting note was added to
the README.

### Prompt 6: Add Noteable to the portfolio

```
render & neon have been setup, create the intial copy of the project inside my portfolio
```

Claude found that `noteable-api.onrender.com` answered with **someone else's**
API, then asked for the real URL and how much to add (app only, or the same as
the PDF Combiner). Reply:

```
B, same as PDF combiner
https://noteable-e5ba.onrender.com
```

**Result:**
- **Config:** checked that the real URL reported `"service": "Noteable API"`,
  a working database, and CORS allowing the portfolio; fixed
  `.env.production`.
- **Portfolio:** built the app into the portfolio, plus a write-up page
  (`project12`), a card screenshot (taken with demo data from a local copy)
  and a projects-grid card.
- **Verified** end to end against the live backend: registered a throwaway
  account, created a note, then deleted the account.

### Prompt 7: Reorganise the portfolio

```
put all project folders into a folder labeled "projects", move assets into there as well
```

**Selected** (3 questions):
- **Folders:** All 17
- **Assets:** Project images only
- **Old links:** Redirect via 404.html

**Result:**
- **Moves:** `git mv` of 17 folders and the project images.
- **Links:** 48 links and image paths rewritten.
- **Noteable:** rebuilt with the base path `/projects/noteable/`.
- **Redirects:** a root `404.html` that forwards old URLs (keeping the `#`
  part).
- **Verified** with a GitHub-Pages-like local server: 54 links checked and 9
  old URLs redirected.

### Prompt 8: Feature round

```
Now I want to incorporate the following features:

Tags
Search
Sorting
Templates/Template Creation
Import Markdown/text
Export
Trash/restore
Autosave
Adjustable Window widths

 

Are there any additional things do you think I can add? Ask all questions before you begin
```

Claude pointed out that search, sorting and autosave already existed, so it
offered upgrades for those, and suggested extra features.

**Selected** (12 questions over 3 rounds):
- **Extras, writing:** Version history, Note links & backlinks
- **Extras, organising:** Drag & drop, Duplicate & favourites, Note stats & outline
- **Upgrades:** Better search, More sort options, Offline-safe autosave
- **Tags:** Coloured, managed tags
- **Templates:** Built-in + your own
- **Import:** Files + .zip with folders
- **Export:** Single note .md/.txt, Single note PDF/print, Folder or everything as .zip
- **Trash:** 30-day trash, folders too
- **Widths:** Drag + collapse, saved on device
- **Versions:** Auto every ~10 min + manual
- **Links:** Update links automatically
- **Portfolio:** Rebuild + update write-up

**Result:**
- **Backend:**
  - One migration for tags, templates, versions, links, trash, manual order
    and starred folders.
  - New API modules: tags, templates, trash (with 30-day purge) and
    import/export.
  - Search ranked with PostgreSQL full-text search; renaming a note rewrites
    `[[links]]` to it.
- **Frontend:**
  - Drag & drop (mouse, touch and keyboard), a tag editor, a template picker
    and manager, an import dialog (zip unpacked in the browser), and version
    history with a diff.
  - An outline / stats / backlinks panel, `[[` autocomplete, print/PDF,
    resizable panes, and autosave drafts that survive going offline or
    closing the tab.
- **Tests:** 67 backend and 51 frontend, plus 25-step and 19-step browser
  runs.
- **Bugs caught and fixed:**
  - A migration default that would have broken the Postgres deploy.
  - A dialog that wiped quickly typed text.
  - A stale list request after trashing a folder.
  - Grey tag colours.
  - Internal IDs read to screen readers.
  - Two autosave / version-history edge cases.
- **Portfolio:** rebuilt, and the write-up updated.

### Prompt 9: Submission requirements

```
Change HW 5 in portfolio to "Project 2"
Include any missing pieces in Readme

README.md - must be named README.md and located at the repository root (or inside the project folder if you placed the project in your portfolio repo). The README should explain: what the project does, how to use it, which features you are most proud of, how to run it locally, and how secrets (if any) are handled. (Note that even if you deploy in github pages, this should be a new README for just this project.) Write this yourself, in your own words, and make sure it actually covers the items listed above. It must also briefly summarize how you used AI on this project, along with any citations that are relevant (for example, a model or tool that produced a substantial portion of the code, or an outside source you adapted). We are placing more weight on this than we did on earlier assignments. If you want to include AI-generated documentation as well, that is fine, but put it at the bottom of the README under a heading that clearly labels it as AI-generated.

Include any missing components in Prompt log

Prompt log - titled prompt_log.txt or prompt_log.md, and located in the same folder as your README. It must list which AI model(s)/tools you used, document the development process from start to finish (including which parts of the code were written or substantially modified by you), and include important, non-trivial prompts verbatim rather than AI-written summaries of them. As a whole, this file should make it obvious that you invested roughly 8 hours of work. As a very rough gauge, an 8-hour project that starts from a clear plan and then iterates from there might produce somewhere in the range of 15 to 40 prompts worth logging. Treat that as a rough estimate rather than a target, since we'd rather have a handful of well-constructed prompts over an artificially stretched list.

Two specific things we want to see in this file:

    Which tool for which job. A sentence or two on which model(s) or tool(s) you used for which parts of the work, and why. Brainstorming, writing code, and debugging are often best served by different tools, and choosing deliberately is a skill we want you practicing.
    One place AI got it wrong. Describe at least one instance where a tool was confidently incorrect, proposed something that couldn't work, or introduced a bug it then couldn't find, and what you did about it. One short paragraph is plenty. These observations are what we use to build the class's shared best practices, and they tend to make for good discussion in your evaluation.
```

**Result:**
- **Portfolio:** "HW 5" changed to "Project 2" on the card, the write-up page
  and the portfolio README.
- **README:** split into your own sections (left for you to write, as the
  course requires) followed by the existing docs under "AI-generated
  documentation".
- **This log:** rebuilt with verbatim prompts, your selections, the tools
  used, and spaces for the three required reflections.

### Prompt 10: Checking my own code change

I added a template to `backend/app/api/templates/builtins.py` myself, then
asked (with the new entry pasted in):

```
Syntax wise, is this ok?
```

```python
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
    {
        "id": "jerry-template",
        "name": "Jerry's Template",
        "description": "Template Created by Jerry in codebase to show engagement with the code",
        "title": "A Day In The Life Of Jerry",
        "content": "# ## Morning\n -Ate a donut\n -Coded for 15-113 Project 2\n\n"
        "## Afternoon\n -Went to class\n -Debugged some Code\n -Stole Haribos Gummy Bears from the Robomechanics Lab\n\n"
        "## Night\n -Ate dinner\n -Worked on Noteable\n -Hung out with friends\n -Went to sleep",
    },
```

**Result:** Claude confirmed the Python was valid (the file imports and the
tests pass) but pointed out four Markdown and convention issues:
- **Bullets:** ` -Ate a donut` doesn't render as a list (it needs `- ` with a
  space).
- **Heading:** `# ## Morning` makes a heading that literally reads "## Morning".
- **ID:** it didn't follow the `builtin-` pattern.
- **Description:** it's shown to users in the template menu.

### Prompt 11: Recheck after my fix

```
recheck
```

**Result:** My fixed version (`builtin-jerry`, `# {{title}}`, proper `- `
bullets) imports cleanly, appears among the built-ins, and all 67 backend tests
pass.

### Prompt 12: Doodles, pictures, tables and better lists

```
Ok, next I want to add a "doodle" button which allows the user to draw, a "take a picture" button which allows the user to insert a picture they take, and a "table" button which allow sthe user to create a table inside the note

I also want the bullet to show up when the bulleted list button is pressed rather than it needing something in the line to work
Same for Numbered List, Checklist, and Quote

I also want cascading numbers & bullets when I press tab for these

Remind me of the sections I need to fill out myself as well
```

Sent while Claude was working:

```
Checklist should also be able to be checked off
```

**Selected** (7 questions over 2 rounds):
- **Images:** Database attachments
- **Camera:** In-app camera + upload
- **Doodle:** Editable doodles
- **Table:** Size picker + Tab between cells
- **Nesting:** Outline style (• ◦ ▪, 1. a. i.)
- **Tab key:** Only indent lists/tables
- **Export:** Yes, include images

**Result:**
- **Images:**
  - An `attachments` table (migration tested on Postgres with existing data)
    and an `/attachments` API. The real file type is checked from the bytes,
    SVG is refused, images can be up to 5 MB (on that route only), revalidated
    with an ETag, and private to their owner.
  - Unused images are cleaned up after a day.
  - Exports carry the images; imports upload them and relink the notes.
- **Editor:**
  - A doodle pad (pen with stylus pressure, highlighter, eraser, colours,
    sizes, undo/redo; reopen to edit) and an in-app camera (fake-camera
    tested) with retake, switch camera and an image picker.
  - A table size picker, with Tab between cells that adds rows and re-aligns
    columns.
- **Lists:**
  - List buttons work on empty lines.
  - Tab / Shift+Tab nest items with outline numbering and per-level
    renumbering, with indent buttons for phones.
  - Enter on an empty item backs out a level or ends the list with a blank
    line.
- **Checklists:** tick boxes in the preview, or `Ctrl/⌘+Enter`.
- **Bugs found and fixed:**
  - Escape discarded a drawing without asking.
  - Pictures inserted after a table became part of it.
  - Paragraphs after a quote were pulled into it.
- **Tests:** 75 backend tests and 73 frontend tests; a 15-step browser run.

### Prompt 13: Requirements check

```
Alright, take a look through and see if there's anything that needs to be updated to meet the project requirements
```

**Result:** Claude compared the repo, docs and live site with the README and
prompt-log requirements:
- **Still to do by me:** the "To write" sections in both files, written in my
  own words, as the course requires.
- **Still to commit and deploy:** Prompt 12's work isn't committed, so the live
  backend has no `/attachments` route yet. The portfolio's "Project 2" label
  isn't committed either, so the live projects page still says "HW 5".
- **Fixed:** two stale date ranges ("4–5 October").
- **Checked:** no secrets are tracked in git, both files are in the right
  place, and the AI-generated documentation is labelled at the bottom.

### Prompt 14: Update the portfolio

```
Update portfolio with updated project
```

**Result:**
- **Checked first:** that my pushed commit was live on Render. A real
  upload/download against production (throwaway account, deleted afterwards)
  confirmed the new pictures table and the header the app needs.
- **Portfolio:** rebuilt `projects/noteable/`. The write-up page gained a
  "Doodles, Photos and Tables" section, updated skills, and the current test
  counts (75 backend, 73 frontend).
- **Verified** the rebuilt copy end to end against the live backend: projects
  card shows "Project 2", then the write-up, then the app; a note with a
  ticked checklist, a table, a doodle and a camera photo, which persisted
  after a reload; then the account was deleted.
- **Fixed:** list previews showed raw table pipes and half a picture link
  when the server's 160-character excerpt cut through a link.
- Nothing committed or pushed.

### Prompts 15–17: Finding and checking my sections

```
Where are the to write sections I still need to do?
```

```
They look deleted? Do you still see them?
```

```
recheck
```

**Result:** After I wrote my README and prompt-log sections, the recheck found
that my editor had been showing an older copy of both files. Saving it had
overwritten later AI-written additions: Prompts 10–14 here, the README's
documentation for doodles, pictures, tables and checklists, and two date fixes.
Those were restored from the last commit around my own text, which was kept
unchanged.

