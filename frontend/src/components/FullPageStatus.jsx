import { useEffect, useState } from "react";
import Spinner from "./Spinner";

/**
 * Centered status screen for startup loading and fatal errors. While
 * loading, it explains a cold start if the server is slow to respond.
 */
export default function FullPageStatus({ loading = false, title, message, action, children }) {
  const slow = useDelayedFlag(loading, 4000);

  return (
    <div className="full-page-status">
      <div className="status-card">
        {loading && <Spinner size={28} />}
        {title && <h1>{title}</h1>}
        {message && <p className="muted">{message}</p>}
        {slow && (
          <p className="muted small">
            Waking up the server… Free hosting sleeps when idle, so the first visit can take up to a
            minute.
          </p>
        )}
        {action && (
          <button type="button" className="btn btn-primary" onClick={action.onClick}>
            {action.label}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/** True once `active` has stayed true for `delay` ms. */
export function useDelayedFlag(active, delay) {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!active) {
      setFlag(false);
      return undefined;
    }
    const timer = setTimeout(() => setFlag(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);
  return flag;
}
