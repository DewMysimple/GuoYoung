import { useEffect, useState } from "react";
import type { ThemePreference } from "../types";

export function useTheme(preference: ThemePreference) {
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  const resolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", resolvedTheme === "dark" ? "#11151c" : "#f4f6f9");
  }, [resolvedTheme]);

  return resolvedTheme;
}
