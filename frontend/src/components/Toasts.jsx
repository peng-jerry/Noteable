import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import Icon from "./Icon";

const ToastContext = createContext(null);
const DURATION_MS = 5000;

/** App-wide notifications. `toast.error(err)` accepts an Error or a string. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type, message, action) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, type, message, action }]);
      const duration = action ? DURATION_MS * 2 : type === "error" ? DURATION_MS * 1.6 : DURATION_MS;
      setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const toast = useMemo(
    () => ({
      /** `action` is an optional { label, onClick } button, e.g. Undo. */
      success: (message, action) => push("success", message, action),
      info: (message, action) => push("info", message, action),
      error: (errOrMessage) =>
        push(
          "error",
          typeof errOrMessage === "string"
            ? errOrMessage
            : errOrMessage?.message || "Something went wrong.",
        ),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Icon name={t.type === "error" ? "alert" : t.type === "success" ? "check" : "info"} />
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  dismiss(t.id);
                  t.action.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
