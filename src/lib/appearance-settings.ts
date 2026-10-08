import { LAYOUT_PRESETS, type LayoutPresetSettings } from "../data/defaults";
import type { AppearanceSettings, LayoutPreset } from "../types";
import { LAYOUT_LIMITS } from "./layout";

export const LAYOUT_OPTIONS = [
  { value: "compact", label: "紧凑", description: "一屏更多收藏" },
  { value: "standard", label: "标准", description: "日常刚刚好" },
  { value: "spacious", label: "宽松", description: "留白更舒展" },
] as const;

export const LAYOUT_DETAILS = [
  { key: "contentWidth", label: "页面宽度", ...LAYOUT_LIMITS.contentWidth, step: 10 },
  { key: "cardWidth", label: "卡片宽度", ...LAYOUT_LIMITS.cardWidth, step: 1 },
  { key: "cardHeight", label: "卡片高度", ...LAYOUT_LIMITS.cardHeight, step: 1 },
  { key: "gap", label: "卡片间距", ...LAYOUT_LIMITS.gap, step: 1 },
  { key: "radius", label: "卡片圆角", ...LAYOUT_LIMITS.radius, step: 1 },
] as const;

const layoutKeys = Object.keys(LAYOUT_PRESETS.standard) as (keyof LayoutPresetSettings)[];
const layoutModeKeys = ["contentWidthMode", "cardShape", "cardLayout", "cardColumns"] as const;

/** Restore geometry alone; keep the user's current colors, text and brand. */
export function restoreLayout(appearance: AppearanceSettings, previous: AppearanceSettings): AppearanceSettings {
  const patch = Object.fromEntries([...layoutKeys, ...layoutModeKeys].map((key) => [key, previous[key]]));
  return patchAppearance(appearance, patch);
}

/** Infer the selection from actual geometry, including settings saved by older versions. */
export function getLayoutPreset(appearance: AppearanceSettings): LayoutPreset {
  if (appearance.contentWidthMode !== "fixed" || appearance.cardShape !== "free" ||
    appearance.cardLayout !== "adaptive") return "custom";
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
