/**
 * Image helpers: shrinking photos in the browser before upload, and a small
 * cache that turns attachment ids into displayable blob: URLs (images are
 * fetched with the login token, so a plain <img src> to the API won't work).
 */
import { attachmentsApi } from "../api";

export const MAX_DIMENSION = 1600; // px, longest side
const KEEP_ORIGINAL_BYTES = 1024 * 1024;
const KEEP_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image."))), type, quality),
  );

/** Fit (width, height) inside max × max, keeping the aspect ratio. */
export function fitWithin(width, height, max = MAX_DIMENSION) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" applies the phone's EXIF rotation.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Prepare an image file or canvas for upload: small images are kept as-is;
 * big ones are scaled to MAX_DIMENSION and re-encoded as JPEG (on white, so
 * transparency doesn't turn black). Returns { blob, width, height }.
 */
export async function prepareImage(source) {
  let image = source;
  if (source instanceof Blob) {
    if (!source.type.startsWith("image/")) throw new Error("That file isn't an image.");
    image = await decode(source);
  }
  const width = image.width;
  const height = image.height;
  const fits = Math.max(width, height) <= MAX_DIMENSION;
  if (source instanceof Blob && fits && source.size <= KEEP_ORIGINAL_BYTES && KEEP_TYPES.includes(source.type)) {
    return { blob: source, width, height };
  }
  const size = fitWithin(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(image, 0, 0, size.width, size.height);
  return { blob: await canvasToBlob(canvas, "image/jpeg", 0.82), ...size };
}

/* ---------------- attachment URL cache ---------------- */

const cache = new Map(); // id → Promise<{ url, kind }>
const listeners = new Set();

/** A blob: URL (and kind) for an attachment, fetched once and shared. */
export function loadAttachment(id) {
  if (!cache.has(id)) {
    const pending = attachmentsApi.fetch(id).then(({ blob, kind }) => ({ url: URL.createObjectURL(blob), kind }));
    pending.catch(() => cache.delete(id)); // let a later render retry
    cache.set(id, pending);
  }
  return cache.get(id);
}

/** Drop a cached image (e.g. after a doodle is edited) so it reloads everywhere. */
export function refreshAttachment(id) {
  const old = cache.get(id);
  cache.delete(id);
  old?.then(({ url }) => setTimeout(() => URL.revokeObjectURL(url), 5000)).catch(() => {});
  for (const fn of listeners) fn(id);
}

export function onAttachmentRefresh(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const ATTACHMENT_URL = /^attachment:([0-9a-f-]{36})$/;
