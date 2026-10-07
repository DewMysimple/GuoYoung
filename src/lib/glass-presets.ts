import { DEFAULT_WALLPAPER } from "../data/defaults";
import type { WallpaperSettings } from "../types";

// One definition drives preset application, matching and the reset action.
export const GLASS_KEYS = [
  "glassTransparency", "glassControlTransparency", "glassPanelTransparency",
  "glassPopoverTransparency", "glassShadow", "glassBlur", "glassSaturation",
  "glassHighlight",
] as const;
export type GlassSettings = Pick<WallpaperSettings, typeof GLASS_KEYS[number]>;

export function pickGlass(value: WallpaperSettings): GlassSettings {
  return Object.fromEntries(GLASS_KEYS.map(key => [key, value[key]])) as GlassSettings;
}

const base = pickGlass(DEFAULT_WALLPAPER);
export const GLASS_PRESETS = [
  { id: "liquid", label: "液态清透", description: "清晰透景 · 轻量高光", values: { ...base, glassTransparency: 92, glassControlTransparency: 86, glassPanelTransparency: 68, glassPopoverTransparency: 58, glassBlur: 2, glassSaturation: 100, glassHighlight: 78, glassShadow: 28 } },
  { id: "crystal", label: "水晶棱镜", description: "厚实边缘 · 鲜明反光", values: { ...base, glassTransparency: 88, glassControlTransparency: 80, glassPanelTransparency: 62, glassPopoverTransparency: 52, glassBlur: 0, glassSaturation: 100, glassHighlight: 95, glassShadow: 40 } },
  { id: "soft", label: "柔光薄雾", description: "柔和磨砂 · 轻盈透光", values: { ...base, glassTransparency: 82, glassControlTransparency: 84, glassPanelTransparency: 60, glassPopoverTransparency: 50, glassBlur: 9, glassSaturation: 100, glassHighlight: 60, glassShadow: 20 } },
  { id: "frost", label: "细腻磨砂", description: "弱化细节 · 安静阅读", values: { ...base, glassTransparency: 65, glassControlTransparency: 72, glassPanelTransparency: 46, glassPopoverTransparency: 38, glassBlur: 22, glassSaturation: 120, glassHighlight: 50, glassShadow: 18 } },
  { id: "light", label: "轻透无影", description: "轻薄边界 · 无外投影", values: { ...base, glassTransparency: 96, glassControlTransparency: 92, glassPanelTransparency: 76, glassPopoverTransparency: 65, glassBlur: 4, glassSaturation: 100, glassHighlight: 38, glassShadow: 0 } },
  { id: "classic", label: "经典玻璃", description: "均衡透光 · 日常使用", values: base },
  { id: "snow", label: "雪景柔纱", description: "浅色壁纸 · 柔化高光", values: { ...base, glassTransparency: 35, glassControlTransparency: 28, glassPanelTransparency: 22, glassPopoverTransparency: 18, glassBlur: 18, glassSaturation: 105, glassHighlight: 25, glassShadow: 12 } },
  { id: "night", label: "夜色凝光", description: "暗色壁纸 · 稳定衬底", values: { ...base, glassTransparency: 48, glassControlTransparency: 32, glassPanelTransparency: 28, glassPopoverTransparency: 20, glassBlur: 16, glassSaturation: 125, glassHighlight: 65, glassShadow: 22 } },
  { id: "forest", label: "繁景静读", description: "复杂壁纸 · 强磨砂阅读", values: { ...base, glassTransparency: 22, glassControlTransparency: 18, glassPanelTransparency: 16, glassPopoverTransparency: 12, glassBlur: 30, glassSaturation: 100, glassHighlight: 32, glassShadow: 8 } },
] as const;

export function getGlassPreset(value: WallpaperSettings) {
  return GLASS_PRESETS.find(preset => GLASS_KEYS.every(key => preset.values[key] === value[key]));
}
