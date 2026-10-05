/** Wrappers for every backend endpoint (see the README API reference). */

import { request, tokenStore } from "./client";

export { ApiError, API_URL, isAbortError, onSessionEnded, tokenStore } from "./client";

function saveTokens(data) {
  tokenStore.set(data);
  return data;
}

const id = encodeURIComponent;

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
  get: (folderId, opts) => request(`/folders/${id(folderId)}`, opts),
  update: (folderId, body) =>
    request(`/folders/${id(folderId)}`, { method: "PATCH", body }).then((d) => d.folder),
  /** Moves the folder and its contents to the trash. */
  remove: (folderId) => request(`/folders/${id(folderId)}`, { method: "DELETE" }),
};

export const notesApi = {
  /** query: { folder_id, q, tags, pinned, sort, order, page, per_page } */
  list: (query, opts) => request("/notes", { query, ...opts }),
  titles: (opts) => request("/notes/titles", opts).then((d) => d.notes),
  create: (body = {}) => request("/notes", { method: "POST", body }).then((d) => d.note),
  get: (noteId, opts) => request(`/notes/${id(noteId)}`, opts).then((d) => d.note),
  update: (noteId, body) => request(`/notes/${id(noteId)}`, { method: "PATCH", body }),
  /** Moves the note to the trash. */
  remove: (noteId) => request(`/notes/${id(noteId)}`, { method: "DELETE" }),
  duplicate: (noteId) =>
    request(`/notes/${id(noteId)}/duplicate`, { method: "POST" }).then((d) => d.note),
  reorder: (folderId, noteIds) =>
    request("/notes/reorder", { method: "POST", body: { folder_id: folderId, note_ids: noteIds } }),
  backlinks: (noteId, opts) =>
    request(`/notes/${id(noteId)}/backlinks`, opts).then((d) => d.backlinks),
  versions: (noteId, opts) => request(`/notes/${id(noteId)}/versions`, opts),
  version: (noteId, versionId, opts) =>
    request(`/notes/${id(noteId)}/versions/${id(versionId)}`, opts).then((d) => d.version),
  saveVersion: (noteId, label) =>
    request(`/notes/${id(noteId)}/versions`, { method: "POST", body: { label } }).then((d) => d.version),
  restoreVersion: (noteId, versionId) =>
    request(`/notes/${id(noteId)}/versions/${id(versionId)}/restore`, { method: "POST" }).then((d) => d.note),
};

export const tagsApi = {
  list: (opts) => request("/tags", opts),
  create: (body) => request("/tags", { method: "POST", body }).then((d) => d.tag),
  update: (tagId, body) => request(`/tags/${id(tagId)}`, { method: "PATCH", body }).then((d) => d.tag),
  remove: (tagId) => request(`/tags/${id(tagId)}`, { method: "DELETE" }),
};

export const templatesApi = {
  list: (opts) => request("/templates", opts).then((d) => d.templates),
  create: (body) => request("/templates", { method: "POST", body }).then((d) => d.template),
  update: (templateId, body) =>
    request(`/templates/${id(templateId)}`, { method: "PATCH", body }).then((d) => d.template),
  remove: (templateId) => request(`/templates/${id(templateId)}`, { method: "DELETE" }),
};

export const trashApi = {
  list: (opts) => request("/trash", opts),
  count: (opts) => request("/trash/count", opts).then((d) => d.count),
  note: (noteId, opts) => request(`/trash/notes/${id(noteId)}`, opts).then((d) => d.note),
  restoreNote: (noteId) =>
    request(`/trash/notes/${id(noteId)}/restore`, { method: "POST" }).then((d) => d.note),
  restoreFolder: (folderId) =>
    request(`/trash/folders/${id(folderId)}/restore`, { method: "POST" }).then((d) => d.folder),
  deleteNote: (noteId) => request(`/trash/notes/${id(noteId)}`, { method: "DELETE" }),
  deleteFolder: (folderId) => request(`/trash/folders/${id(folderId)}`, { method: "DELETE" }),
  empty: () => request("/trash", { method: "DELETE" }),
};

export const transferApi = {
  /** Import one batch: files = [{ path, content }]. */
  importBatch: (folderId, files) =>
    request("/import", { method: "POST", body: { folder_id: folderId, files } }),
  /** Download a .zip of a folder (or everything). Returns a Blob. */
  exportZip: (folderId) =>
    request("/export", { query: { folder_id: folderId }, responseType: "blob" }),
};
