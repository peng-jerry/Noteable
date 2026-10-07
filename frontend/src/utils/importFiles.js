/**
 * Turn picked/dropped files into { path, content } items for POST /import.
 * Zip archives are unpacked in the browser (fflate) so their folder
 * structure is kept; items are then sent in batches under the API's
 * request-size limit. Images referenced by the notes (e.g. Noteable's own
 * `_images/` folder) are collected too, uploaded first, and the notes'
 * links rewritten to point at them.
 */
import { unzipSync } from "fflate";

export const IMPORT_EXTENSIONS = [".md", ".markdown", ".txt"];
export const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
export const ACCEPT = [...IMPORT_EXTENSIONS, ...Object.keys(IMAGE_TYPES), ".zip"].join(",");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 2000;
const MAX_NOTE_CHARS = 200_000;

const isImportable = (name) => IMPORT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
const imageType = (name) => IMAGE_TYPES[name.slice(name.lastIndexOf(".")).toLowerCase()] ?? null;
const isDoodleData = (name) => name.toLowerCase().endsWith(".doodle.json");
const isJunk = (path) =>
  path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX") || path.endsWith("/");

const decoder = new TextDecoder("utf-8");

/** Unpack a zip (as a Uint8Array) into notes, images and doodle data. */
export function filesFromZip(bytes, zipName = "archive.zip") {
  const files = [];
  const images = new Map(); // path → { bytes, type }
  const doodles = new Map(); // path → JSON text
  const skipped = [];
  let entries;
  try {
    entries = unzipSync(bytes);
  } catch {
    return { files, images, doodles, skipped: [{ path: zipName, reason: "Couldn't read this zip file." }] };
  }
  for (const [path, data] of Object.entries(entries)) {
    if (isJunk(path)) continue;
    if (isImportable(path)) files.push({ path, content: decoder.decode(data) });
    else if (isDoodleData(path)) doodles.set(path, decoder.decode(data));
    else if (imageType(path)) images.set(path, { bytes: data, type: imageType(path) });
    else skipped.push({ path, reason: "Not a note (.md, .markdown, .txt) or image file." });
  }
  return { files, images, doodles, skipped };
}

const IMAGE_LINK = /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;

/** Resolve a relative link against a note's folder ("a/b/n.md" + "../x.png" → "a/x.png"). */
export function resolvePath(notePath, href) {
  const parts = notePath.split("/").slice(0, -1);
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    /* a stray "%": use the link as written */
  }
  for (const part of decoded.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

const isRelative = (href) => !/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href);

/** The image paths the notes actually reference (and that we have). */
export function referencedImages(files, images) {
  const needed = new Set();
  for (const file of files) {
    for (const [, , href] of file.content.matchAll(IMAGE_LINK)) {
      if (!isRelative(href)) continue;
      const path = resolvePath(file.path, href);
      if (images.has(path)) needed.add(path);
    }
  }
  return [...needed];
}

/** Point the notes' image links at uploaded attachments ({ path → id }). */
export function relinkImages(files, idByPath) {
  return files.map((file) => ({
    ...file,
    content: file.content.replace(IMAGE_LINK, (match, open, href, close) => {
      if (!isRelative(href)) return match;
      const id = idByPath.get(resolvePath(file.path, href));
      return id ? `${open}attachment:${id}${close}` : match;
    }),
  }));
}

/** Upload the referenced images; returns { idByPath, skipped }. */
export async function uploadImages(paths, images, doodles, upload, onProgress = () => {}) {
  const idByPath = new Map();
  const skipped = [];
  for (const [i, path] of paths.entries()) {
    const { bytes, type } = images.get(path);
    if (bytes.length > MAX_IMAGE_BYTES) {
      skipped.push({ path, reason: "Images can be at most 5 MB." });
    } else {
      const doodleText = doodles.get(path.replace(/\.[^./]+$/, ".doodle.json"));
      let doodle = null;
      try {
        doodle = doodleText ? JSON.parse(doodleText) : null;
      } catch {
        doodle = null;
      }
      try {
        const attachment = await upload({ blob: new Blob([bytes], { type }), kind: doodle ? "doodle" : "image", doodle });
        idByPath.set(path, attachment.id);
      } catch (err) {
        skipped.push({ path, reason: err.message || "Couldn't upload this image." });
      }
    }
    onProgress(i + 1, paths.length);
  }
  return { idByPath, skipped };
}

/** Collect notes and images from a FileList / array of File objects. */
export async function collectImportFiles(fileList) {
  const files = [];
  const images = new Map();
  const doodles = new Map();
  const skipped = [];
  for (const file of Array.from(fileList)) {
    const name = file.webkitRelativePath || file.name;
    if (file.name.toLowerCase().endsWith(".zip")) {
      const result = filesFromZip(new Uint8Array(await file.arrayBuffer()), file.name);
      files.push(...result.files);
      skipped.push(...result.skipped);
      result.images.forEach((v, k) => images.set(k, v));
      result.doodles.forEach((v, k) => doodles.set(k, v));
    } else if (isImportable(file.name)) {
      files.push({ path: name, content: await file.text() });
    } else if (isDoodleData(file.name)) {
      doodles.set(name, await file.text());
    } else if (imageType(file.name)) {
      images.set(name, { bytes: new Uint8Array(await file.arrayBuffer()), type: imageType(file.name) });
    } else {
      skipped.push({ path: name, reason: "Not a note, image or .zip file." });
    }
  }
  const tooLong = files.filter((f) => f.content.length > MAX_NOTE_CHARS);
  for (const f of tooLong) skipped.push({ path: f.path, reason: "Longer than 200,000 characters." });
  const ok = files.filter((f) => f.content.length <= MAX_NOTE_CHARS);
  if (ok.length > MAX_FILES) {
    for (const f of ok.slice(MAX_FILES)) skipped.push({ path: f.path, reason: `Only ${MAX_FILES} files per import.` });
  }
  return { files: ok.slice(0, MAX_FILES), images, doodles, skipped };
}

/** Split items into batches by count and approximate JSON size. */
export function batchFiles(files, { maxCount = 100, maxBytes = 700_000 } = {}) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const file of files) {
    const bytes = file.content.length * 1.1 + file.path.length + 40;
    if (current.length && (current.length >= maxCount || size + bytes > maxBytes)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += bytes;
  }
  if (current.length) batches.push(current);
  return batches;
}
