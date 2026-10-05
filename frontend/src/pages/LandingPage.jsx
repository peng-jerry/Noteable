import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import AppHeader, { PORTFOLIO_URL } from "../components/AppHeader";
import Icon from "../components/Icon";
import MarkdownPreview from "../components/LazyMarkdownPreview";

const SAMPLE = `## Week 6 — Backend + Frontend

- [x] Flask API with JWT auth
- [x] Nested folders
- [ ] Deploy to **Render**

> Notes save automatically as you type.

\`\`\`py
def hello():
    return "Noteable"
\`\`\``;

const FEATURES = [
  { icon: "pen", title: "Markdown editor", text: "Write with headings, lists, checklists, code and links. Live preview sits side by side." },
  { icon: "folder", title: "Nested folders", text: "Organise notes into folders inside folders, and move things around whenever you like." },
  { icon: "search", title: "Search & pin", text: "Find any note by title or content, and pin the important ones to the top." },
  { icon: "check", title: "Autosave", text: "Every change saves on its own a moment after you stop typing. No save button needed." },
  { icon: "user", title: "Private by default", text: "Your notes are tied to your account. Nobody else can see them." },
  { icon: "columns", title: "Works everywhere", text: "A three-pane layout on desktop that adapts to tablets and phones." },
];

/** Public home page (anyone can view it). */
export default function LandingPage() {
  const { status } = useAuth();
  const authed = status === "authenticated";

  return (
    <div className="page">
      <AppHeader />
      <main className="landing" id="main">
        <section className="hero container">
          <div className="hero-copy">
            <p className="eyebrow">A project by Jerry Peng · CMU 15-113</p>
            <h1>
              Markdown notes, <span className="accent-text">neatly organised.</span>
            </h1>
            <p className="lede">
              Noteable is a simple, fast place to write. Draft in Markdown, file notes into nested
              folders, and pick up where you left off on any device.
            </p>
            <div className="row-gap">
              {authed ? (
                <Link to="/notes" className="btn btn-primary btn-lg">
                  Open my notes
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn btn-primary btn-lg">
                    Create a free account
                  </Link>
                  <Link to="/login" className="btn btn-lg">
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="hero-demo" aria-label="Example of a rendered note">
            <div className="demo-window">
              <div className="demo-bar">
                <span />
                <span />
                <span />
              </div>
              <div className="demo-body">
                <MarkdownPreview content={SAMPLE} />
              </div>
            </div>
          </div>
        </section>

        <section className="features container" aria-labelledby="features-heading">
          <h2 id="features-heading" className="section-title">
            What's inside
          </h2>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div className="feature-card" key={f.title}>
                <Icon name={f.icon} />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container">
          Built with React, Flask & PostgreSQL · <a href={PORTFOLIO_URL}>Back to the portfolio</a>
        </div>
      </footer>
    </div>
  );
}
