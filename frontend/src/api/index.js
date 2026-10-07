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
  /** Download a .zip of a folder, one note ({ noteId }), or everything. Returns a Blob. */
  exportZip: (folderId, { noteId } = {}) =>
    request("/export", { query: { folder_id: folderId, note_id: noteId }, responseType: "blob" }),
};

/** Build the multipart body for an image upload. */
function imageForm({ blob, kind, width, height, noteId, doodle }) {
  const form = new FormData();
  const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
  form.append("file", blob, `${kind}.${ext}`);
  form.append("kind", kind);
  if (width) form.append("width", String(Math.round(width)));
  if (height) form.append("height", String(Math.round(height)));
  if (noteId) form.append("note_id", noteId);
  if (doodle) form.append("doodle", JSON.stringify(doodle));
  return form;
}

export const attachmentsApi = {
  /** upload({ blob, kind: "photo"|"doodle"|"image", width, height, noteId, doodle }) */
  upload: (fields) =>
    request("/attachments", { method: "POST", body: imageForm(fields) }).then((d) => d.attachment),
  replace: (attachmentId, fields) =>
    request(`/attachments/${id(attachmentId)}`, { method: "PUT", body: imageForm(fields) }).then((d) => d.attachment),
  /** The image bytes and kind, as { blob, kind }. */
  fetch: async (attachmentId, opts) => {
    const res = await request(`/attachments/${id(attachmentId)}`, { ...opts, responseType: "response" });
    return { blob: await res.blob(), kind: res.headers.get("X-Attachment-Kind") || "image" };
  },
  doodle: (attachmentId, opts) =>
    request(`/attachments/${id(attachmentId)}/doodle`, opts).then((d) => d.doodle),
  remove: (attachmentId) => request(`/attachments/${id(attachmentId)}`, { method: "DELETE" }),
};
