import { useCallback, useState } from "react";

// Same key and values as the portfolio site: "light", or absent for dark.
const KEY = "theme";

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export default function useTheme() {
  const [theme, setTheme] = useState(currentTheme);

  const toggle = useCallback(() => {
    const next = currentTheme() === "light" ? "dark" : "light";
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }, []);

  return [theme, toggle];
}
