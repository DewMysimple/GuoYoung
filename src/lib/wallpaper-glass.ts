import type { WallpaperSettings, PanelGlassStyle } from "../types";

/** Neutral filters must be absent: even blur(0) creates a backdrop surface. */
export function glassBackdropFilter(value: Pick<WallpaperSettings, "glassBlur" | "glassSaturation">) {
  return [value.glassBlur > 0 ? `blur(${value.glassBlur}px)` : "",
    value.glassSaturation !== 100 ? `saturate(${value.glassSaturation}%)` : ""].filter(Boolean).join(" ") || "none";
}

function panelMaterial(style: PanelGlassStyle, transparency: number, blur: number, saturation: number) {
  if (style === "shared") return {
    background: "var(--glass-fill-panel)", image: "var(--glass-surface-image)",
    filter: "var(--glass-filter)", edge: "var(--glass-edge-soft)",
  };
  return {
    background: `color-mix(in srgb, var(--surface) ${100 - transparency}%, transparent)`,
    image: transparency === 100 ? "none" : "var(--glass-surface-image)",
    filter: blur > 0 ? glassBackdropFilter({ glassBlur: blur, glassSaturation: saturation }) : "none",
    edge: `color-mix(in srgb, var(--glass-edge-soft) ${100 - transparency}%, transparent)`,
  };
}

/** Wallpaper material tokens, shared by the app shell and body portals. */
export function wallpaperGlassStyle(value: WallpaperSettings) {
  const topbar = panelMaterial(value.topbarStyle, value.topbarTransparency, value.topbarBlur, value.glassSaturation);
  const sidebar = panelMaterial(value.sidebarStyle, value.sidebarTransparency, value.sidebarBlur, value.glassSaturation);
  return {
    "--glass-opacity": `${100 - value.glassTransparency}%`,
    "--glass-control-opacity": `${100 - value.glassControlTransparency}%`,
    "--glass-panel-opacity": `${100 - value.glassPanelTransparency}%`,
    "--glass-popover-opacity": `${100 - value.glassPopoverTransparency}%`,
    "--glass-shadow-strength": String(value.glassShadow / 100),
    "--glass-highlight": String(value.glassHighlight / 100),
    "--glass-filter": glassBackdropFilter(value),
    "--topbar-glass-background": topbar.background,
    "--topbar-glass-image": topbar.image,
    "--topbar-glass-edge": topbar.edge,
    "--topbar-glass-filter": topbar.filter,
    "--sidebar-background": sidebar.background,
    "--sidebar-image": sidebar.image,
    "--sidebar-filter": sidebar.filter,
  };
}
