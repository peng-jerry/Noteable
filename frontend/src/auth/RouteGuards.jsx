import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./AuthContext";
import FullPageStatus from "../components/FullPageStatus";

/** Private routes: only for logged-in users; everyone else goes to /login. */
export function RequireAuth() {
  const { status, retry } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullPageStatus loading message="Loading your notes…" />;
  if (status === "unreachable") {
    return (
      <FullPageStatus
        title="Can't reach the server"
        message="Noteable's server may be waking up (this can take up to a minute) or your connection may be down."
        action={{ label: "Try again", onClick: retry }}
      />
    );
  }
  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Login/register: logged-in users are sent on to their notes. */
export function RedirectIfAuthed() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullPageStatus loading />;
  if (status === "authenticated") {
    const from = location.state?.from;
    const target = from ? `${from.pathname}${from.search || ""}` : "/notes";
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
