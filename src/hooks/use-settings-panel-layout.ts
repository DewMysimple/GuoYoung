import { useLayoutEffect, useState } from "react";
import { getMinimumCardWidth, scaledGeometry } from "../lib/layout";
import type { AppearanceSettings } from "../types";

/** Keep an enlarged panel usable without squeezing page controls out of their cards. */
export function useSettingsPanelLayout(open: boolean, appearance: AppearanceSettings): boolean {
  const [canPush, setCanPush] = useState(true);
  useLayoutEffect(() => {
    if (!open || appearance.settingsPresentation !== "push") return;
    const panel = document.querySelector<HTMLElement>(".settings-panel");
    if (!panel) return;
    const update = () => {
      const viewportWidth = document.documentElement.getBoundingClientRect().width;
      const minimumPageWidth = getMinimumCardWidth(appearance) + scaledGeometry(appearance).pagePadding * 2;
      setCanPush(viewportWidth - panel.getBoundingClientRect().width >= minimumPageWidth);
    };
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    window.addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [open, appearance]);
  return canPush;
}
