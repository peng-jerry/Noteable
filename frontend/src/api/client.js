/**
 * Low-level HTTP client for the Noteable API.
 *
 * - Attaches the access token to every authenticated request.
 * - When the API says the access token expired (401 `token_expired`), it
 *   refreshes it once (shared between concurrent requests) and retries.
 * - If the session can't be recovered, it clears tokens and notifies the app
 *   (AuthProvider) so the user is sent to the login page.
 * - Every failure, including network errors and timeouts, is thrown as an
 *   `ApiError` with a stable `code` and a human-readable `message`.
 */

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1").replace(
  /\/+$/,
  "",
);

// Render's free tier can take ~30–60s to wake up, so allow for a cold start.
const TIMEOUT_MS = 75_000;
const TOKEN_KEY = "noteable.tokens";

// 401 codes that mean "this session is over; log in again".
const SESSION_ENDED_CODES = new Set([
  "token_revoked",
  "token_invalid",
  "token_missing",
  "user_not_found",
]);

export class ApiError extends Error {
  constructor({ status = 0, code = "unknown_error", message, details = null } = {}) {
    super(message || "Something went wrong.");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Per-field messages from a 422, as { field: "first message" }. */
  get fieldErrors() {
    if (!this.details || typeof this.details !== "object") return {};
    return Object.fromEntries(
      Object.entries(this.details).map(([field, msgs]) => [
        field,
        Array.isArray(msgs) ? msgs[0] : String(msgs),
      ]),
    );
  }
}

/* ---------------- Token storage ---------------- */

export const tokenStore = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(TOKEN_KEY)) || null;
    } catch {
      return null;
    }
  },
  set({ access_token, refresh_token }) {
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ access_token, refresh_token }));
    } catch {
      /* storage full/blocked: the session just won't survive a reload */
    }
  },
  setAccess(access_token) {
    const current = this.get();
    if (current) this.set({ ...current, access_token });
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
  key: TOKEN_KEY,
};

let sessionEndedHandler = () => {};

/** Register a callback for when the session can't be recovered. */
export function onSessionEnded(handler) {
  sessionEndedHandler = handler;
  return () => {
    if (sessionEndedHandler === handler) sessionEndedHandler = () => {};
  };
}

function endSession() {
  tokenStore.clear();
  sessionEndedHandler();
}

/* ---------------- Requests ---------------- */

function buildUrl(path, query) {
  const url = new URL(API_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function rawRequest(path, { method = "GET", body, query, token, signal, responseType = "json" } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const signals = signal ? [signal, timeout.signal] : [timeout.signal];
  const combined = AbortSignal.any ? AbortSignal.any(signals) : timeout.signal;

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw err; // cancelled by the caller: not an error to show
    if (timeout.signal.aborted) {
      throw new ApiError({
        code: "timeout",
        message: "The server took too long to respond. Please try again.",
      });
    }
    throw new ApiError({
      code: "network_error",
      message: "Can't reach the Noteable server. Check your connection and try again.",
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return null;
  if (response.ok && responseType === "blob") return response.blob();

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON body (e.g. a proxy error page) */
  }

  if (!response.ok) {
    const error = data?.error;
    throw new ApiError({
      status: response.status,
      code: error?.code || `http_${response.status}`,
      message:
        error?.message ||
        (response.status >= 500
          ? "The server ran into a problem. Please try again shortly."
          : `Request failed (${response.status}).`),
      details: error?.details ?? null,
    });
  }
  return data;
}

let refreshInFlight = null;

/** Swap the refresh token for a new access token (one request at a time). */
function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refresh = tokenStore.get()?.refresh_token;
      if (!refresh) {
        throw new ApiError({ status: 401, code: "token_missing", message: "Please log in." });
      }
      const data = await rawRequest("/auth/refresh", { method: "POST", token: refresh });
      tokenStore.setAccess(data.access_token);
      return data.access_token;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

const SESSION_EXPIRED = () =>
  new ApiError({
    status: 401,
    code: "session_expired",
    message: "Your session has expired. Please log in again.",
  });

/**
 * Make an API request.
 * @param {string} path e.g. "/notes"
 * @param {{method?: string, body?: any, query?: object, signal?: AbortSignal, auth?: boolean, responseType?: "json"|"blob"}} options
 *   `auth: false` sends no token and skips session handling (login/register).
 *   `responseType: "blob"` returns the body as a Blob (file downloads).
 */
export async function request(path, { auth = true, ...options } = {}) {
  if (!auth) return rawRequest(path, options);

  try {
    return await rawRequest(path, { ...options, token: tokenStore.get()?.access_token });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;

    if (err.code === "token_expired") {
      let newToken;
      try {
        newToken = await refreshAccessToken();
      } catch (refreshErr) {
        if (refreshErr instanceof ApiError && refreshErr.status === 401) {
          endSession();
          throw SESSION_EXPIRED();
        }
        throw refreshErr; // network problem etc.: keep the session, surface the error
      }
      return rawRequest(path, { ...options, token: newToken });
    }

    if (SESSION_ENDED_CODES.has(err.code)) {
      endSession();
      throw SESSION_EXPIRED();
    }
    throw err;
  }
}

/** True for errors from a request the caller deliberately cancelled. */
export function isAbortError(err) {
  return err?.name === "AbortError";
}
