import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import useTheme from "../hooks/useTheme";
import Icon from "./Icon";
import Menu from "./Menu";

export const PORTFOLIO_URL = "https://peng-jerry.github.io/";

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      title={theme === "light" ? "Dark theme" : "Light theme"}
    >
      <Icon name={theme === "light" ? "sun" : "moon"} />
    </button>
  );
}

/** Top bar shared by every page. `onMenuClick` shows the sidebar toggle. */
export default function AppHeader({ onMenuClick, menuOpen = false }) {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const authed = status === "authenticated";

  return (
    <header className="app-header">
      <div className="app-header-inner">
        {onMenuClick && (
          <button
            type="button"
            className="icon-btn sidebar-toggle"
            onClick={onMenuClick}
            aria-label={menuOpen ? "Close folders" : "Open folders"}
            aria-expanded={menuOpen}
            aria-controls="sidebar"
          >
            <Icon name={menuOpen ? "x" : "menu"} />
          </button>
        )}
        <Link to={authed ? "/notes" : "/"} className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="22" height="22" />
          Noteable
        </Link>

        <nav className="header-actions" aria-label="Account">
          <a className="header-link hide-sm" href={PORTFOLIO_URL}>
            Portfolio
          </a>
          <ThemeToggle />
          {authed ? (
            <Menu
              label={`Account menu for ${user?.display_name ?? "you"}`}
              trigger={<span className="avatar">{initials(user?.display_name)}</span>}
              items={[
                {
                  label: "Settings",
                  icon: <Icon name="settings" />,
                  onSelect: () => navigate("/settings"),
                },
                {
                  label: "Log out",
                  icon: <Icon name="logout" />,
                  onSelect: async () => {
                    await logout();
                    navigate("/login", { replace: true });
                  },
                },
              ]}
            />
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm" to="/login">
                Log in
              </Link>
              <Link className="btn btn-primary btn-sm" to="/register">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
