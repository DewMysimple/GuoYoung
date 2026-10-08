import { useLayoutEffect, useRef } from "react";
import type { AppearanceSettings } from "../types";
import { typographyVariables } from "../lib/typography";
import { useLatestEvent } from "./use-latest-event";

function applyColors(value: AppearanceSettings) {
  const { "--reading-font": _font, ...colors } = typographyVariables(value);
  const style = document.documentElement.style;
  for (const [property, color] of Object.entries({ ...colors, "--accent-base": value.accentColor })) {
    if (style.getPropertyValue(property) !== color) style.setProperty(property, color);
  }
}

/** Transient CSS feedback shares the saved tokens; only gesture completion
 * changes the settings draft. No App render or persistence runs per frame. */
export function useAppearanceColorPreview(value: AppearanceSettings, enabled = true) {
  const base = useRef(value);
  const active = useRef(enabled);
  useLayoutEffect(() => { base.current = value; }, [value]);
  useLayoutEffect(() => {
    active.current = enabled;
    return () => {
      // Child picker passive cleanup runs after App has restored saved tokens.
      active.current = false;
      document.documentElement.style.removeProperty("--color-preview-duration");
    };
  }, [enabled]);
  const preview = useLatestEvent((patch: Partial<AppearanceSettings> | null) => {
    // A new color every frame must not keep restarting a 150–220ms transition.
    const style = document.documentElement.style;
    if (patch && active.current) style.setProperty("--color-preview-duration", "0ms");
    if (active.current) applyColors(patch ? { ...base.current, ...patch } : base.current);
    if (!patch) style.removeProperty("--color-preview-duration");
  });
  const commit = useLatestEvent((next: AppearanceSettings) => {
    // Pointerup can commit and clear in the same event, before React renders.
    base.current = next;
    applyColors(next);
  });
  return { preview, commit };
}
