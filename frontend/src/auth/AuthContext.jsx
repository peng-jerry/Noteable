import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, authApi, onSessionEnded, tokenStore } from "../api";

const AuthContext = createContext(null);

/**
 * status:
 *  - "loading"        checking a saved session on startup
 *  - "authenticated"  `user` is set
 *  - "anonymous"      not logged in
 *  - "unreachable"    had a saved session but the server couldn't be reached
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (tokenStore.get() ? "loading" : "anonymous"));
  // Shown once on the login page, e.g. after a session expires.
  const [notice, setNotice] = useState(null);

  const loadSession = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus("anonymous");
      return;
    }
    setStatus("loading");
    try {
      setUser(await authApi.me());
      setStatus("authenticated");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        tokenStore.clear();
        setUser(null);
        setStatus("anonymous");
      } else {
        setStatus("unreachable");
      }
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // The API client calls this when a session can't be refreshed.
  useEffect(
    () =>
      onSessionEnded(() => {
        setUser(null);
        setStatus("anonymous");
        setNotice("Your session has expired. Please log in again.");
      }),
    [],
  );

  // Keep tabs in sync: logging out (or in) in one tab applies to all of them.
  useEffect(() => {
    function onStorage(event) {
      if (event.key !== tokenStore.key) return;
      if (!event.newValue) {
        setUser(null);
        setStatus("anonymous");
      } else if (!event.oldValue) {
        loadSession();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadSession]);

  const login = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    setUser(data.user);
    setStatus("authenticated");
    setNotice(null);
    return data.user;
  }, []);

  const register = useCallback(async (details) => {
    const data = await authApi.register(details);
    setUser(data.user);
    setStatus("authenticated");
    setNotice(null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Revoking server-side is best-effort; the local session ends regardless.
    }
    tokenStore.clear();
    setUser(null);
    setStatus("anonymous");
  }, []);

  /** Forget the session locally (e.g. after the account was deleted). */
  const clearSession = useCallback((message = null) => {
    tokenStore.clear();
    setUser(null);
    setStatus("anonymous");
    setNotice(message);
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      notice,
      clearNotice: () => setNotice(null),
      login,
      register,
      logout,
      clearSession,
      setUser,
      retry: loadSession,
    }),
    [user, status, notice, login, register, logout, clearSession, loadSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
