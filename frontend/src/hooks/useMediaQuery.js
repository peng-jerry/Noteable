import { useSyncExternalStore } from "react";

/** Live result of a CSS media query, e.g. useMediaQuery("(max-width: 700px)"). */
export default function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      if (!window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => (window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
