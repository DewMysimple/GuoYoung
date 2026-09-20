import { LAYOUT_PRESETS, type LayoutPresetSettings } from "../data/defaults";
import type { AppearanceSettings, LayoutPreset } from "../types";

export const LAYOUT_OPTIONS = [
  { value: "compact", label: "紧凑", description: "一屏更多收藏" },
  { value: "standard", label: "标准", description: "日常刚刚好" },
  { value: "spacious", label: "宽松", description: "留白更舒展" },
] as const;

export const TEXT_SIZE_OPTIONS = [
  { value: 95, label: "较小" },
  { value: 100, label: "标准" },
  { value: 110, label: "较大" },
] as const;

export const LAYOUT_DETAILS = [
  { key: "contentWidth", label: "页面宽度", min: 960, max: 1920, step: 10 },
  { key: "cardWidth", label: "卡片宽度", min: 132, max: 260, step: 1 },
  { key: "cardHeight", label: "卡片高度", min: 112, max: 240, step: 1 },
  { key: "gap", label: "卡片间距", min: 4, max: 32, step: 1 },
  { key: "radius", label: "卡片圆角", min: 4, max: 28, step: 1 },
] as const;

const layoutKeys = Object.keys(LAYOUT_PRESETS.standard) as (keyof LayoutPresetSettings)[];

/** Restore geometry alone; keep the user's current colors, text and brand. */
export function restoreLayout(appearance: AppearanceSettings, previous: AppearanceSettings): AppearanceSettings {
  const patch = Object.fromEntries(layoutKeys.map((key) => [key, previous[key]]));
  return patchAppearance(appearance, patch);
}

/** Infer the selection from actual geometry, including settings saved by older versions. */
export function getLayoutPreset(appearance: AppearanceSettings): LayoutPreset {
  return LAYOUT_OPTIONS.find(({ value }) =>
    layoutKeys.every((key) => appearance[key] === LAYOUT_PRESETS[value][key]),
  )?.value ?? "custom";
}

export function patchAppearance(
  appearance: AppearanceSettings,
  patch: Partial<AppearanceSettings>,
): AppearanceSettings {
  const next = { ...appearance, ...patch };
  return { ...next, layoutPreset: getLayoutPreset(next) };
}

export function applyLayoutPreset(
  appearance: AppearanceSettings,
  preset: Exclude<LayoutPreset, "custom">,
): AppearanceSettings {
  return patchAppearance(appearance, LAYOUT_PRESETS[preset]);
}

export function getTextSize(appearance: AppearanceSettings) {
  if ([appearance.brandFontScale, appearance.cardFontScale, appearance.groupFontScale]
    .some((scale) => scale !== 100)) return undefined;
  return TEXT_SIZE_OPTIONS.find(({ value }) => value === appearance.fontScale)?.value;
}

/** One explicit reading-size choice replaces the old stacked text multipliers. */
export function applyTextSize(appearance: AppearanceSettings, fontScale: number) {
  return patchAppearance(appearance, {
    fontScale,
    brandFontScale: 100,
    cardFontScale: 100,
    groupFontScale: 100,
  });
}
