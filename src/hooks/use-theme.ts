import { useInsertionEffect } from "react";
import type { ThemePreference } from "../types";

/** Only resolves the effective palette; the settings draft/store owns the preference. */
export function useTheme(preference: ThemePreference, accentColor: string) {
  useInsertionEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = preference === "system" ? (media.matches ? "dark" : "light") : preference;
      const root = document.documentElement;
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
      root.style.removeProperty("background-color"); // Hand the early boot color back to theme.css.
      root.style.setProperty("--accent-base", accentColor);
      document.querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "dark" ? "#171a21" : "#f4f6f9");
    };
    apply();
    if (preference !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference, accentColor]);
}
