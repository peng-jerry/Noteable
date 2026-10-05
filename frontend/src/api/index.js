/** Typed-ish wrappers for every backend endpoint (see the README API reference). */

import { request, tokenStore } from "./client";

export { ApiError, API_URL, isAbortError, onSessionEnded, tokenStore } from "./client";

function saveTokens(data) {
  tokenStore.set(data);
  return data;
}

export const authApi = {
  register: (body) =>
    request("/auth/register", { method: "POST", body, auth: false }).then(saveTokens),
  login: (body) => request("/auth/login", { method: "POST", body, auth: false }).then(saveTokens),
  logout: () => {
    const refresh_token = tokenStore.get()?.refresh_token;
    return request("/auth/logout", { method: "POST", body: { refresh_token } });
  },
  me: (opts) => request("/auth/me", opts).then((d) => d.user),
  updateMe: (body) => request("/auth/me", { method: "PATCH", body }).then((d) => d.user),
  changePassword: (body) =>
    request("/auth/me/password", { method: "POST", body }).then(saveTokens),
  deleteAccount: (password) =>
    request("/auth/me", { method: "DELETE", body: { password } }),
};

export const foldersApi = {
  list: (opts) => request("/folders", opts),
  create: (body) => request("/folders", { method: "POST", body }).then((d) => d.folder),
  get: (id, opts) => request(`/folders/${encodeURIComponent(id)}`, opts),
  update: (id, body) =>
    request(`/folders/${encodeURIComponent(id)}`, { method: "PATCH", body }).then((d) => d.folder),
  remove: (id) => request(`/folders/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const notesApi = {
  /** query: { folder_id, q, pinned, sort, order, page, per_page } */
  list: (query, opts) => request("/notes", { query, ...opts }),
  create: (body = {}) => request("/notes", { method: "POST", body }).then((d) => d.note),
  get: (id, opts) => request(`/notes/${encodeURIComponent(id)}`, opts).then((d) => d.note),
  update: (id, body) =>
    request(`/notes/${encodeURIComponent(id)}`, { method: "PATCH", body }).then((d) => d.note),
  remove: (id) => request(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
