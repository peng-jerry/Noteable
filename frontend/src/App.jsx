import { Navigate, createHashRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { RedirectIfAuthed, RequireAuth } from "./auth/RouteGuards";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import EmptyEditor from "./pages/EmptyEditor";
import { NotFoundPage, RouteErrorPage } from "./pages/ErrorPages";
import LandingPage from "./pages/LandingPage";
import NotePage from "./pages/NotePage";
import SettingsPage from "./pages/SettingsPage";
import WorkspaceLayout from "./pages/WorkspaceLayout";

/*
 * Hash routing (/noteable/#/notes/123) because the app is served from a
 * subfolder of a GitHub Pages site: Pages only knows the portfolio's own
 * 404.html, so real paths like /noteable/notes/123 would 404 on reload.
 *
 *  Public:        /            landing page
 *  Public-only:   /login       (logged-in users are redirected to /notes)
 *                 /register
 *  Private:       /notes       workspace (folders, list, editor)
 *                 /notes/:id
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
            path: "/notes",
            element: <WorkspaceLayout />,
            children: [
              { index: true, element: <EmptyEditor /> },
              { path: ":noteId", element: <NotePage /> },
            ],
          },
          { path: "/settings", element: <SettingsPage /> },
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
