/**
 * Turn picked/dropped files into { path, content } items for POST /import.
 * Zip archives are unpacked in the browser (fflate) so their folder
 * structure is kept; items are then sent in batches under the API's
 * request-size limit.
 */
import { unzipSync } from "fflate";

export const IMPORT_EXTENSIONS = [".md", ".markdown", ".txt"];
export const ACCEPT = [...IMPORT_EXTENSIONS, ".zip"].join(",");
const MAX_FILES = 2000;
const MAX_NOTE_CHARS = 200_000;

const isImportable = (name) => IMPORT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
const isJunk = (path) =>
  path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX") || path.endsWith("/");

const decoder = new TextDecoder("utf-8");

/** Unpack a zip (as a Uint8Array) into import items. */
export function filesFromZip(bytes, zipName = "archive.zip") {
  const files = [];
  const skipped = [];
  let entries;
  try {
    entries = unzipSync(bytes);
  } catch {
    return { files, skipped: [{ path: zipName, reason: "Couldn't read this zip file." }] };
  }
  for (const [path, data] of Object.entries(entries)) {
    if (isJunk(path)) continue;
    if (!isImportable(path)) {
      skipped.push({ path, reason: "Not a .md, .markdown or .txt file." });
      continue;
    }
    files.push({ path, content: decoder.decode(data) });
  }
  return { files, skipped };
}

/** Collect import items from a FileList / array of File objects. */
export async function collectImportFiles(fileList) {
  const files = [];
  const skipped = [];
  for (const file of Array.from(fileList)) {
    const name = file.webkitRelativePath || file.name;
    if (file.name.toLowerCase().endsWith(".zip")) {
      const result = filesFromZip(new Uint8Array(await file.arrayBuffer()), file.name);
      files.push(...result.files);
      skipped.push(...result.skipped);
    } else if (isImportable(file.name)) {
      files.push({ path: name, content: await file.text() });
    } else {
      skipped.push({ path: name, reason: "Not a .md, .markdown, .txt or .zip file." });
    }
  }
  const tooLong = files.filter((f) => f.content.length > MAX_NOTE_CHARS);
  for (const f of tooLong) skipped.push({ path: f.path, reason: "Longer than 200,000 characters." });
  const ok = files.filter((f) => f.content.length <= MAX_NOTE_CHARS);
  if (ok.length > MAX_FILES) {
    for (const f of ok.slice(MAX_FILES)) skipped.push({ path: f.path, reason: `Only ${MAX_FILES} files per import.` });
  }
  return { files: ok.slice(0, MAX_FILES), skipped };
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
