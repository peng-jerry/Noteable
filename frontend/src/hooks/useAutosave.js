import { useCallback, useEffect, useRef, useState } from "react";

const RETRY_DELAYS = [3_000, 8_000, 20_000, 45_000, 60_000];

/** Unsaved edits kept in localStorage until the server confirms them. */
export const drafts = {
  key: (id) => `noteable.draft.${id}`,
  read(id) {
    try {
      return JSON.parse(localStorage.getItem(this.key(id)));
    } catch {
      return null;
    }
  },
  write(id, patch) {
    try {
      localStorage.setItem(this.key(id), JSON.stringify({ patch, savedAt: new Date().toISOString() }));
    } catch {
      /* storage full or blocked: the in-memory copy still retries */
    }
  },
  clear(id) {
    try {
      localStorage.removeItem(this.key(id));
    } catch {
      /* ignore */
    }
  },
};

/**
 * Debounced, ordered autosave of partial updates.
 *
 *   const { queue, flush, discard, status, error } = useAutosave(save, { delay: 900, draftId });
 *   queue({ content })            // saves `delay` ms after the last change
 *   queue({ is_pinned }, true)    // saves right away
 *   discard()                     // drop unsaved changes (e.g. before deleting)
 *
 * - Changes queued while a save is in flight are merged and sent next, so
 *   saves never overlap or arrive out of order.
 * - With `draftId`, unsaved changes are also written to localStorage until
 *   the server confirms them, so a crash, closed tab or lost connection
 *   doesn't lose them (the editor offers to recover the draft next time).
 * - A failed save keeps its changes and retries with back-off, and again as
 *   soon as the browser comes back online.
 * - Unsaved changes are flushed on unmount (switching notes), and the
 *   browser warns before closing the tab with work unsaved.
 *
 * status: "saved" | "pending" | "saving" | "error" | "offline"
 */
export default function useAutosave(save, { delay = 900, draftId, onSaved, onUnmountError } = {}) {
  const [status, setStatus] = useState("saved");
  const [error, setError] = useState(null);

  const pending = useRef(null);
  const inFlight = useRef(null);
  const inFlightPatch = useRef(null); // what the running save is sending
  const timer = useRef(null);
  const retryTimer = useRef(null);
  const attempts = useRef(0);
  const callbacks = useRef({ save, onSaved, onUnmountError });
  callbacks.current = { save, onSaved, onUnmountError };
  const mounted = useRef(true);

  const persistDraft = useCallback(() => {
    if (!draftId) return;
    const unsaved = inFlightPatch.current || pending.current ? { ...inFlightPatch.current, ...pending.current } : null;
    if (unsaved) drafts.write(draftId, unsaved);
    else drafts.clear(draftId);
  }, [draftId]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    clearTimeout(retryTimer.current);
    timer.current = null;
    // Wait for any save already running (and any queued behind it).
    while (inFlight.current) {
      try {
        await inFlight.current;
      } catch {
        /* handled by the request that failed */
      }
    }
    const patch = pending.current;
    if (!patch) return null;
    pending.current = null;
    inFlightPatch.current = patch;
    if (mounted.current) setStatus("saving");

    const run = (async () => {
      try {
        const result = await callbacks.current.save(patch);
        attempts.current = 0;
        inFlightPatch.current = null;
        persistDraft();
        if (mounted.current) {
          setError(null);
          setStatus(pending.current ? "pending" : "saved");
        }
        callbacks.current.onSaved?.(result, patch);
        return result;
      } catch (err) {
        // Put the failed changes back underneath anything typed since.
        pending.current = { ...patch, ...pending.current };
        inFlightPatch.current = null;
        persistDraft();
        const offline = err?.code === "network_error" || (typeof navigator !== "undefined" && !navigator.onLine);
        if (mounted.current) {
          setError(err);
          setStatus(offline ? "offline" : "error");
          // Retry automatically, except for errors retrying can't fix.
          if (!(err?.status >= 400 && err?.status < 500)) {
            const wait = RETRY_DELAYS[Math.min(attempts.current, RETRY_DELAYS.length - 1)];
            attempts.current += 1;
            retryTimer.current = setTimeout(() => flush().catch(() => {}), wait);
          }
        }
        throw err;
      }
    })();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      if (inFlight.current === run) inFlight.current = null;
    }
  }, [draftId, persistDraft]);

  const queue = useCallback(
    (patch, immediate = false) => {
      pending.current = { ...pending.current, ...patch };
      persistDraft();
      setStatus((s) => (s === "offline" ? s : "pending"));
      clearTimeout(timer.current);
      if (immediate) {
        flush().catch(() => {});
      } else {
        timer.current = setTimeout(() => flush().catch(() => {}), delay);
      }
    },
    [delay, flush, persistDraft],
  );

  const discard = useCallback(() => {
    clearTimeout(timer.current);
    clearTimeout(retryTimer.current);
    timer.current = null;
    pending.current = null;
    inFlightPatch.current = null;
    if (draftId) drafts.clear(draftId);
    setStatus("saved");
  }, [draftId]);

  // Retry as soon as the connection returns.
  useEffect(() => {
    const onOnline = () => {
      if (pending.current) flush().catch(() => {});
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  // Warn before closing/reloading the tab with unsaved work.
  useEffect(() => {
    if (status === "saved") return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  // Save whatever is left when the editor goes away.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(retryTimer.current);
      if (pending.current || timer.current) {
        flush().catch((err) => callbacks.current.onUnmountError?.(err));
      }
    };
  }, [flush]);

  return {
    queue,
    flush,
    discard,
    status,
    error,
    hasUnsaved: () => Boolean(pending.current || inFlight.current),
  };
}
