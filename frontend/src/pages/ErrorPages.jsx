import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";

export function NotFoundPage() {
  return (
    <div className="page">
      <AppHeader />
      <main className="full-page-status" id="main">
        <div className="status-card">
          <p className="eyebrow">404</p>
          <h1>Page not found</h1>
          <p className="muted">That page doesn't exist. It may have moved, or the link is wrong.</p>
          <Link to="/" className="btn btn-primary">
            Go home
          </Link>
        </div>
      </main>
    </div>
  );
}

/**
 * Shown by the router if a page crashes while rendering, so a bug shows a
 * recovery screen instead of a blank page.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (notFound) return <NotFoundPage />;

  console.error(error);
  return (
    <div className="full-page-status">
      <div className="status-card">
        <Icon name="alert" size={32} />
        <h1>Something went wrong</h1>
        <p className="muted">
          An unexpected error stopped this page from loading. Your saved notes are safe.
        </p>
        <div className="row-gap">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn btn-ghost" href={import.meta.env.BASE_URL}>
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
