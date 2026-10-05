import { Suspense, lazy } from "react";
import { Navigate, createHashRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { RedirectIfAuthed, RequireAuth } from "./auth/RouteGuards";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { NotFoundPage, RouteErrorPage } from "./pages/ErrorPages";
import LandingPage from "./pages/LandingPage";
import FullPageStatus from "./components/FullPageStatus";
import Spinner from "./components/Spinner";

// The signed-in app is split from the public pages, so the landing page and
// login load quickly; its code downloads once you're signed in.
const WorkspaceLayout = lazy(() => import("./pages/WorkspaceLayout"));
const EmptyEditor = lazy(() => import("./pages/EmptyEditor"));
const NotePage = lazy(() => import("./pages/NotePage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const pick = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const templatePages = () => import("./pages/TemplatePages");
const trashPages = () => import("./pages/TrashPages");
const TemplatePage = pick(templatePages, "TemplatePage");
const TemplateEmptyPane = pick(templatePages, "TemplateEmptyPane");
const NewFromLinkPage = pick(templatePages, "NewFromLinkPage");
const TrashNotePage = pick(trashPages, "TrashNotePage");
const TrashEmptyPane = pick(trashPages, "TrashEmptyPane");

const page = (element) => <Suspense fallback={<FullPageStatus loading />}>{element}</Suspense>;
const pane = (element) => (
  <Suspense
    fallback={
      <div className="editor-message">
        <Spinner size={24} />
      </div>
    }
  >
    {element}
  </Suspense>
);

/*
 * Hash routing (/projects/noteable/#/notes/123) because the app is served from a
 * subfolder of a GitHub Pages site: Pages only knows the portfolio's own
 * 404.html, so real paths like /projects/noteable/notes/123 would 404 on reload.
 *
 *  Public:        /                  landing page
 *  Public-only:   /login, /register  (logged-in users are redirected to /notes)
 *  Private:       /notes[/:id]       workspace (sidebar, note list, editor)
 *                 /trash[/:id]       trash (list + read-only preview)
 *                 /templates[/:id]   template manager
 *                 /new?title=…       create a note from a [[link]]
 *                 /settings
 */
export const routes = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/", element: <LandingPage /> },
      {
        element: <RedirectIfAuthed />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/register", element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: page(<WorkspaceLayout />),
            children: [
              { path: "/notes", element: pane(<EmptyEditor />) },
              { path: "/notes/:noteId", element: pane(<NotePage />) },
              { path: "/trash", element: pane(<TrashEmptyPane />) },
              { path: "/trash/:noteId", element: pane(<TrashNotePage />) },
              { path: "/templates", element: pane(<TemplateEmptyPane />) },
              { path: "/templates/:templateId", element: pane(<TemplatePage />) },
            ],
          },
          { path: "/new", element: page(<NewFromLinkPage />) },
          { path: "/settings", element: page(<SettingsPage />) },
          { path: "/app", element: <Navigate to="/notes" replace /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

const router = createHashRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
