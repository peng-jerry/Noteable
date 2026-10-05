import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Debounced, ordered autosave of partial updates.
 *
 *   const { queue, flush, status, error } = useAutosave(save, { delay: 900 });
 *   queue({ content })            // saves `delay` ms after the last change
 *   queue({ is_pinned }, true)    // saves right away
 *   discard()                     // drop unsaved changes (e.g. before deleting)
 *
 * - Changes queued while a save is in flight are merged and sent next, so
 *   saves never overlap or arrive out of order.
 * - A failed save keeps its changes; the next queue()/flush() retries them.
 * - Unsaved changes are flushed when the component unmounts (switching notes)
 *   and the browser warns before closing the tab with work unsaved.
 *
 * status: "saved" | "pending" | "saving" | "error"
 */
export default function useAutosave(save, { delay = 900, onSaved, onUnmountError } = {}) {
  const [status, setStatus] = useState("saved");
  const [error, setError] = useState(null);

  const pending = useRef(null);
  const inFlight = useRef(null);
  const timer = useRef(null);
  const callbacks = useRef({ save, onSaved, onUnmountError });
  callbacks.current = { save, onSaved, onUnmountError };
  const mounted = useRef(true);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
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
    if (mounted.current) setStatus("saving");

    const run = (async () => {
      try {
        const result = await callbacks.current.save(patch);
        if (mounted.current) {
          setError(null);
          setStatus(pending.current ? "pending" : "saved");
        }
        callbacks.current.onSaved?.(result);
        return result;
      } catch (err) {
        // Put the failed changes back underneath anything typed since.
        pending.current = { ...patch, ...pending.current };
        if (mounted.current) {
          setError(err);
          setStatus("error");
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
  }, []);

  const queue = useCallback(
    (patch, immediate = false) => {
      pending.current = { ...pending.current, ...patch };
      setStatus("pending");
      clearTimeout(timer.current);
      if (immediate) {
        flush().catch(() => {});
      } else {
        timer.current = setTimeout(() => flush().catch(() => {}), delay);
      }
    },
    [delay, flush],
  );

  const discard = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    setStatus("saved");
  }, []);

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
