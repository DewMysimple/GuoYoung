import type { CustomWallpaperPresets, WallpaperGlassSettings, WallpaperSettings } from "../types";

export const GLASS_KEYS = [
  "glassTransparency", "glassControlTransparency", "glassPanelTransparency",
  "glassPopoverTransparency", "glassShadow", "glassBlur", "glassSaturation", "glassHighlight",
] as const;
export const PANEL_GLASS_KEYS = [
  "topbarStyle", "topbarTransparency", "topbarBlur", "sidebarStyle", "sidebarTransparency", "sidebarBlur",
] as const;
export const WALLPAPER_GLASS_KEYS = [...GLASS_KEYS, ...PANEL_GLASS_KEYS] as const;
type GlassSettings = Pick<WallpaperGlassSettings, typeof GLASS_KEYS[number]>;

export function pickGlass(value: WallpaperGlassSettings): GlassSettings {
  return Object.fromEntries(GLASS_KEYS.map(key => [key, value[key]])) as GlassSettings;
}

export function pickWallpaperGlass(value: WallpaperGlassSettings): WallpaperGlassSettings {
  return Object.fromEntries(WALLPAPER_GLASS_KEYS.map(key => [key, value[key]])) as unknown as WallpaperGlassSettings;
}

export const WALLPAPER_PRESETS = [
  { id: "clear", label: "清透磨砂", description: "通透底色 · 柔化背景", values: {
    glassTransparency: 100, glassControlTransparency: 100, glassPanelTransparency: 100, glassPopoverTransparency: 100,
    glassShadow: 72, glassBlur: 21, glassSaturation: 100, glassHighlight: 18,
    topbarStyle: "glass", topbarTransparency: 100, topbarBlur: 21,
    sidebarStyle: "glass", sidebarTransparency: 100, sidebarBlur: 21,
  } },
  { id: "light", label: "轻盈透景", description: "清晰壁纸 · 无影薄边", values: {
    glassTransparency: 96, glassControlTransparency: 94, glassPanelTransparency: 90, glassPopoverTransparency: 78,
    glassShadow: 0, glassBlur: 0, glassSaturation: 100, glassHighlight: 24,
    topbarStyle: "glass", topbarTransparency: 100, topbarBlur: 0,
    sidebarStyle: "glass", sidebarTransparency: 90, sidebarBlur: 0,
  } },
  { id: "soft", label: "柔光薄雾", description: "轻柔磨砂 · 日常均衡", values: {
    glassTransparency: 80, glassControlTransparency: 86, glassPanelTransparency: 70, glassPopoverTransparency: 58,
    glassShadow: 22, glassBlur: 12, glassSaturation: 110, glassHighlight: 36,
    topbarStyle: "glass", topbarTransparency: 82, topbarBlur: 12,
    sidebarStyle: "glass", sidebarTransparency: 70, sidebarBlur: 16,
  } },
  { id: "frost", label: "凝霜静读", description: "厚实衬底 · 繁景易读", values: {
    glassTransparency: 42, glassControlTransparency: 56, glassPanelTransparency: 32, glassPopoverTransparency: 22,
    glassShadow: 16, glassBlur: 26, glassSaturation: 100, glassHighlight: 28,
    topbarStyle: "glass", topbarTransparency: 44, topbarBlur: 26,
    sidebarStyle: "glass", sidebarTransparency: 32, sidebarBlur: 28,
  } },
] as const satisfies ReadonlyArray<{ id: string; label: string; description: string; values: WallpaperGlassSettings }>;

/** The switch governs this one-time write. Panel following remains a rendering setting. */
export function applyWallpaperPreset(value: WallpaperSettings, preset: WallpaperGlassSettings) {
  return value.presetIncludesPanels ? pickWallpaperGlass(preset) : pickGlass(preset);
}

export function saveCustomWallpaperPreset(value: WallpaperSettings, slot: 0 | 1): CustomWallpaperPresets {
  const presets: CustomWallpaperPresets = [...value.customPresets];
  presets[slot] = pickWallpaperGlass(value);
  return presets;
}

export function getWallpaperPreset(value: WallpaperSettings) {
  const matches = (preset: WallpaperGlassSettings) => GLASS_KEYS.every(key => preset[key] === value[key]) &&
    (!value.presetIncludesPanels || PANEL_GLASS_KEYS.every(key => preset[key] === value[key]));
  const slot = value.customPresets.findIndex(preset => preset && matches(preset));
  if (slot !== -1) return { id: `custom-${slot + 1}`, label: `自定义 ${slot + 1}` };
  return WALLPAPER_PRESETS.find(preset => matches(preset.values));
}
