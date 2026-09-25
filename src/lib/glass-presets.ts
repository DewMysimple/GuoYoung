import { DEFAULT_WALLPAPER } from "../data/defaults";
import type { WallpaperSettings } from "../types";

// One definition drives preset application, matching and the reset action.
export const GLASS_KEYS = [
  "glassTransparency", "glassControlTransparency", "glassPanelTransparency",
  "glassPopoverTransparency", "glassShadow", "glassBlur", "glassSaturation",
  "glassHighlight", "glassRefraction", "glassRefractionStrength",
] as const;
export type GlassSettings = Pick<WallpaperSettings, typeof GLASS_KEYS[number]>;

export function pickGlass(value: WallpaperSettings): GlassSettings {
  return Object.fromEntries(GLASS_KEYS.map(key => [key, value[key]])) as GlassSettings;
}

const base = pickGlass(DEFAULT_WALLPAPER);
export const GLASS_PRESETS = [
  { id: "liquid", label: "液态清透", description: "清晰透景 · 弧面折射", values: { ...base, glassTransparency: 92, glassControlTransparency: 86, glassPanelTransparency: 68, glassPopoverTransparency: 58, glassBlur: 2, glassSaturation: 145, glassHighlight: 78, glassShadow: 28, glassRefraction: true, glassRefractionStrength: 32 } },
  { id: "crystal", label: "水晶棱镜", description: "厚实边缘 · 鲜明反光", values: { ...base, glassTransparency: 88, glassControlTransparency: 80, glassPanelTransparency: 62, glassPopoverTransparency: 52, glassBlur: 0, glassSaturation: 170, glassHighlight: 95, glassShadow: 40, glassRefraction: true, glassRefractionStrength: 40 } },
  { id: "soft", label: "柔光薄雾", description: "柔和磨砂 · 轻盈透光", values: { ...base, glassTransparency: 82, glassControlTransparency: 84, glassPanelTransparency: 60, glassPopoverTransparency: 50, glassBlur: 9, glassSaturation: 135, glassHighlight: 60, glassShadow: 20, glassRefraction: true, glassRefractionStrength: 18 } },
  { id: "frost", label: "细腻磨砂", description: "弱化细节 · 安静阅读", values: { ...base, glassTransparency: 65, glassControlTransparency: 72, glassPanelTransparency: 46, glassPopoverTransparency: 38, glassBlur: 22, glassSaturation: 120, glassHighlight: 50, glassShadow: 18, glassRefraction: false, glassRefractionStrength: 24 } },
  { id: "light", label: "轻透无影", description: "轻薄边界 · 无外投影", values: { ...base, glassTransparency: 96, glassControlTransparency: 92, glassPanelTransparency: 76, glassPopoverTransparency: 65, glassBlur: 4, glassSaturation: 110, glassHighlight: 38, glassShadow: 0, glassRefraction: true, glassRefractionStrength: 12 } },
  { id: "classic", label: "经典玻璃", description: "均衡透光 · 日常使用", values: base },
] as const;

export function getGlassPreset(value: WallpaperSettings) {
  return GLASS_PRESETS.find(preset => GLASS_KEYS.every(key => preset.values[key] === value[key]));
}
