import type { AppearanceSettings, TypographySettings } from "../types";
import { getLocalFontFamily } from "./local-fonts";

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontFamily: "default", customFontFamily: "", textColorMode: "theme",
  textColorHierarchy: "unified", iconColorMode: "text", iconColor: "#000000",
  textColor: "#000000", textSecondaryColor: "#000000",
  textEffect: "auto", textEffectColor: "#000000", textEffectStrength: 40,
};

export const FONT_OPTIONS = [
  { value: "default", label: "默认字体", family: '"Manrope Variable", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { value: "system", label: "系统字体", family: 'system-ui, "Microsoft YaHei", sans-serif' },
  { value: "serif", label: "宋体 / 衬线", family: '"Noto Serif SC", "Songti SC", SimSun, serif' },
  { value: "wenkai", label: "霞鹜文楷", family: '"LXGW WenKai", "KaiTi", serif' },
  { value: "mono", label: "等宽字体", family: 'Consolas, "SFMono-Regular", "Microsoft YaHei", monospace' },
  { value: "custom", label: "本地字体", family: 'system-ui, sans-serif' },
] as const;

export const TEXT_EFFECTS = [
  { value: "auto", label: "跟随主题" }, { value: "none", label: "无效果" },
  { value: "glow", label: "柔光" },
] as const;

/** A single local family name, never a CSS declaration or a remote URL. */
export function normalizeFontName(value: unknown) {
  return typeof value === "string" ? value.replace(/[^\p{L}\p{N}\p{M} ._()\-]/gu, "").slice(0, 80).trim() : "";
}

export function normalizeTypography(value: Partial<TypographySettings>): TypographySettings {
  const hex = (color: unknown, fallback: string) => typeof color === "string" && /^#[\da-f]{6}$/i.test(color) ? color : fallback;
  return {
    fontFamily: FONT_OPTIONS.some(option => option.value === value.fontFamily) ? value.fontFamily! : DEFAULT_TYPOGRAPHY.fontFamily,
    customFontFamily: normalizeFontName(value.customFontFamily),
    ...(typeof value.customFontAssetId === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value.customFontAssetId)
      ? { customFontAssetId: value.customFontAssetId } : {}),
    textColorMode: value.textColorMode === "custom" ? "custom" : "theme",
    // Existing custom palettes keep their primary/secondary distinction.
    textColorHierarchy: value.textColorHierarchy === "unified" || value.textColorHierarchy === "split"
      ? value.textColorHierarchy : value.textColorMode === "custom" ? "split" : "unified",
    iconColorMode: value.iconColorMode === "custom" ? "custom" : "text",
    iconColor: hex(value.iconColor, DEFAULT_TYPOGRAPHY.iconColor),
    textColor: hex(value.textColor, DEFAULT_TYPOGRAPHY.textColor),
    textSecondaryColor: hex(value.textSecondaryColor, DEFAULT_TYPOGRAPHY.textSecondaryColor),
    textEffect: TEXT_EFFECTS.some(option => option.value === value.textEffect) ? value.textEffect!
      : ["shadow", "outline"].includes(String(value.textEffect)) ? "none" : "auto",
    textEffectColor: hex(value.textEffectColor, DEFAULT_TYPOGRAPHY.textEffectColor),
    textEffectStrength: typeof value.textEffectStrength === "number" && Number.isFinite(value.textEffectStrength)
      ? Math.min(100, Math.max(0, value.textEffectStrength)) : DEFAULT_TYPOGRAPHY.textEffectStrength,
  };
}

export function getFontFamily(value: TypographySettings) {
  if (value.fontFamily === "custom" && value.customFontAssetId) return `"${getLocalFontFamily(value.customFontAssetId)}", ${FONT_OPTIONS[0].family}`;
  const custom = normalizeFontName(value.customFontFamily);
  if (value.fontFamily === "custom") return custom ? `"${custom}", ${FONT_OPTIONS[0].family}` : FONT_OPTIONS[0].family;
  return FONT_OPTIONS.find(option => option.value === value.fontFamily)?.family ?? FONT_OPTIONS[0].family;
}

export function getTextShadow(value: TypographySettings) {
  if (value.textEffect === "auto" || value.textEffect === "none" || value.textEffectStrength === 0) return "none";
  const strength = Math.min(1, Math.max(0, value.textEffectStrength / 100));
  const color = (opacity: number) => `color-mix(in srgb, ${value.textEffectColor} ${+(strength * opacity).toFixed(2)}%, transparent)`;
  return `0 0 ${(0.08 + strength * 0.12).toFixed(3)}em ${color(50)}`;
}

export function typographyVariables(value: TypographySettings) {
  const primary = value.textColorMode === "custom" ? value.textColor : "var(--theme-text)";
  const secondary = value.textColorMode === "theme" ? "var(--theme-text-secondary)"
    : value.textColorHierarchy === "unified" ? primary : value.textSecondaryColor;
  return {
    "--reading-font": getFontFamily(value),
    "--custom-text": value.textColorMode === "custom" ? value.textColor : "initial",
    "--reading-text": primary,
    "--reading-text-secondary": secondary,
    "--reading-text-faint": value.textColorMode === "theme" ? "var(--theme-text-faint)" : secondary,
    "--reading-icon": value.iconColorMode === "custom" ? value.iconColor : "inherit",
    "--reading-shadow": getTextShadow(value),
  };
}

export function resetTypography(value: AppearanceSettings): AppearanceSettings {
  const { customFontAssetId: _asset, ...appearance } = value;
  return { ...appearance, ...DEFAULT_TYPOGRAPHY, fontScale: 100, brandFontScale: 100, cardFontScale: 100, groupFontScale: 100 };
}
