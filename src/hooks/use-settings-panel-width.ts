import { useEffect, useState } from "react";

const WIDTH_KEY = "site-hub:settings-panel-width";
export const DEFAULT_PANEL_WIDTH = 440;
export const MIN_PANEL_WIDTH = 360;
const maximumWidth = () => Math.min(760, Math.max(MIN_PANEL_WIDTH, window.innerWidth - 440));

export function useSettingsPanelWidth(open: boolean) {
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [maxWidth, setMaxWidth] = useState(maximumWidth);
  function changeWidth(next: number) {
    const clamped = Math.min(maximumWidth(), Math.max(MIN_PANEL_WIDTH, next));
    setWidth(clamped);
    document.documentElement.style.setProperty("--settings-panel-width", `${clamped}px`);
  }
  function rememberWidth(next: number) {
    changeWidth(next);
    try { window.localStorage.setItem(WIDTH_KEY, String(next)); } catch { /* Geometry remains usable without local storage. */ }
  }
  useEffect(() => {
    if (!open) return;
    let saved = DEFAULT_PANEL_WIDTH;
    try {
      const candidate = Number.parseFloat(window.localStorage.getItem(WIDTH_KEY) ?? "");
      if (Number.isFinite(candidate)) saved = candidate;
    } catch { /* Use the default when storage is unavailable. */ }
    setMaxWidth(maximumWidth());
    changeWidth(saved);
    const resize = () => {
      setMaxWidth(maximumWidth());
      setWidth((current) => {
        const next = Math.min(maximumWidth(), current);
        document.documentElement.style.setProperty("--settings-panel-width", `${next}px`);
        return next;
      });
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [open]);
  return { width, maxWidth, changeWidth, rememberWidth };
}
