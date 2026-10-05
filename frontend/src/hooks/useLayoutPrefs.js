import { useCallback, useState } from "react";

const KEY = "noteable.layout";

export const LAYOUT_DEFAULTS = {
  sidebar: 250, // px
  list: 330, // px
  split: 0.5, // editor share of the editor+preview area
  sidebarCollapsed: false,
  listCollapsed: false,
};

export const LAYOUT_LIMITS = {
  sidebar: [180, 440],
  list: [240, 600],
  split: [0.2, 0.8],
};

export const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    const prefs = { ...LAYOUT_DEFAULTS, ...saved };
    for (const [key, limits] of Object.entries(LAYOUT_LIMITS)) {
      prefs[key] = Number.isFinite(prefs[key]) ? clamp(prefs[key], limits) : LAYOUT_DEFAULTS[key];
    }
    return prefs;
  } catch {
    return { ...LAYOUT_DEFAULTS };
  }
}

/** Pane sizes and collapsed state, remembered per browser (not per account). */
export default function useLayoutPrefs() {
  const [prefs, setPrefs] = useState(load);

  const update = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      for (const [key, limits] of Object.entries(LAYOUT_LIMITS)) next[key] = clamp(next[key], limits);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const reset = useCallback((key) => update({ [key]: LAYOUT_DEFAULTS[key] }), [update]);

  return [prefs, update, reset];
}
