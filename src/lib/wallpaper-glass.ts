import type { WallpaperGlassSettings, WallpaperSettings, PanelGlassStyle } from "../types";

/** Neutral filters must be absent: even blur(0) creates a backdrop surface. */
export function glassBackdropFilter(value: Pick<WallpaperSettings, "glassBlur" | "glassSaturation">) {
  return [value.glassBlur > 0 ? `blur(${value.glassBlur}px)` : "",
    value.glassSaturation !== 100 ? `saturate(${value.glassSaturation}%)` : ""].filter(Boolean).join(" ") || "none";
}

function panelMaterial(style: PanelGlassStyle, transparency: number, blur: number, saturation: number) {
  if (style === "shared") return {
    background: "var(--glass-fill-panel)", image: "var(--glass-surface-image)",
    filter: "var(--shell-glass-filter)", edge: "var(--glass-edge-soft)",
  };
  return {
    background: `color-mix(in srgb, var(--surface) ${100 - transparency}%, transparent)`,
    image: transparency === 100 ? "none" : "var(--glass-surface-image)",
    filter: blur > 0 ? glassBackdropFilter({ glassBlur: blur, glassSaturation: saturation }) : "none",
    edge: `color-mix(in srgb, var(--glass-edge-soft) ${100 - transparency}%, transparent)`,
  };
}

/** One resolved model for the page, settings samples, presets and popup.
 * Card changes never feed the overlay policy. Shared edge/shadow decoration
 * remains common; shell following is intentionally compatible with old data. */
export function resolveGlassSettings(value: WallpaperGlassSettings) {
  const opacity = (100 - value.overlayTransparency) / 100;
  const softness = Math.min(1, value.overlayBlur / 24);
  const minimumFill = .82 - .22 * softness;
  const minimumPopoverFill = .94 - .10 * softness;
  const fill = value.overlayReadabilityProtection ? Math.max(opacity, minimumFill) : opacity;
  const popoverFill = value.overlayReadabilityProtection ? Math.max(opacity, minimumPopoverFill) : opacity;
  return {
    card: {
      transparency: value.glassTransparency,
      blur: value.glassBlur,
      filter: glassBackdropFilter(value),
      image: value.glassTransparency === 100 ? "none" : "var(--glass-surface-image)",
    },
    overlay: {
      transparency: value.overlayTransparency,
      blur: value.overlayBlur,
      backdropDim: value.overlayBackdropDim,
      readabilityProtection: value.overlayReadabilityProtection,
      fill, popoverFill,
      effectiveTransparency: Math.round((1 - fill) * 100),
      effectivePopoverTransparency: Math.round((1 - popoverFill) * 100),
      controlFill: .10 + .08 * fill,
      nestedFill: .05 + .05 * fill,
      filter: value.overlayBlur > 0 ? `blur(${value.overlayBlur}px)` : "none",
    },
  };
}

const percent = (value: number) => `${Number((value * 100).toFixed(3))}%`;

/** Wallpaper material tokens, shared by the app shell and body portals. */
export function wallpaperGlassStyle(value: WallpaperSettings) {
  const { card, overlay } = resolveGlassSettings(value);
  const topbar = panelMaterial(value.topbarStyle, value.topbarTransparency, value.topbarBlur, value.glassSaturation);
  const sidebar = panelMaterial(value.sidebarStyle, value.sidebarTransparency, value.sidebarBlur, value.glassSaturation);
  return {
    "--glass-opacity": `${100 - value.glassTransparency}%`,
    "--glass-control-opacity": `${100 - value.glassControlTransparency}%`,
    "--glass-panel-opacity": `${100 - value.glassPanelTransparency}%`,
    "--glass-popover-opacity": `${100 - value.glassPopoverTransparency}%`,
    "--glass-shadow-strength": String(value.glassShadow / 100),
    "--glass-highlight": String(value.glassHighlight / 100),
    "--card-glass-opacity": `${100 - card.transparency}%`,
    "--card-glass-filter": card.filter,
    "--card-glass-image": card.image,
    // Retained shell-following behavior is separate from all floating UI.
    "--shell-glass-filter": card.filter,
    "--overlay-glass-opacity": percent(overlay.fill),
    "--overlay-popover-opacity": percent(overlay.popoverFill),
    "--overlay-control-opacity": percent(overlay.controlFill),
    "--overlay-nested-opacity": percent(overlay.nestedFill),
    "--overlay-backdrop-opacity": String(overlay.backdropDim / 100),
    "--overlay-glass-filter": overlay.filter,
    "--topbar-glass-background": topbar.background,
    "--topbar-glass-image": topbar.image,
    "--topbar-glass-edge": topbar.edge,
    "--topbar-glass-filter": topbar.filter,
    "--sidebar-background": sidebar.background,
    "--sidebar-image": sidebar.image,
    "--sidebar-filter": sidebar.filter,
  };
}
