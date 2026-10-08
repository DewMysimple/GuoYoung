import { useEffect, useState } from "react";

const WIDTH_KEY = "site-hub:settings-panel-width";
export const DEFAULT_PANEL_WIDTH = 440;
export const MIN_PANEL_WIDTH = 360;
const maximumWidth = (scale: number) => Math.floor(Math.min(760, Math.max(MIN_PANEL_WIDTH, (window.innerWidth - 320) / scale)));

export function useSettingsPanelWidth(open: boolean, scale = 1) {
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [maxWidth, setMaxWidth] = useState(() => maximumWidth(scale));
  function changeWidth(next: number) {
    const clamped = Math.min(maximumWidth(scale), Math.max(MIN_PANEL_WIDTH, next));
    setWidth(clamped);
    document.documentElement.style.setProperty("--settings-panel-width", `${clamped * scale}px`);
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
    setMaxWidth(maximumWidth(scale));
    changeWidth(saved);
    const resize = () => {
      setMaxWidth(maximumWidth(scale));
      setWidth((current) => {
        const next = Math.min(maximumWidth(scale), current);
        document.documentElement.style.setProperty("--settings-panel-width", `${next * scale}px`);
        return next;
      });
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [open, scale]);
  return { width, physicalWidth: width * scale, maxWidth, changeWidth, rememberWidth };
}
