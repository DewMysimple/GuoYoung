import type { AppearanceSettings, TypographySettings } from "../types";

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontFamily: "default", customFontFamily: "", textColorMode: "theme",
  textColor: "#171c26", textSecondaryColor: "#596273",
  textEffect: "auto", textEffectColor: "#000000", textEffectStrength: 40,
};

export const FONT_OPTIONS = [
  { value: "default", label: "默认字体", family: '"Manrope Variable", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { value: "system", label: "系统字体", family: 'system-ui, "Microsoft YaHei", sans-serif' },
  { value: "serif", label: "宋体 / 衬线", family: '"Noto Serif SC", "Songti SC", SimSun, serif' },
  { value: "wenkai", label: "霞鹜文楷", family: '"LXGW WenKai", "KaiTi", serif' },
  { value: "mono", label: "等宽字体", family: 'Consolas, "SFMono-Regular", "Microsoft YaHei", monospace' },
  { value: "custom", label: "本机字体", family: 'system-ui, sans-serif' },
] as const;

export const TEXT_EFFECTS = [
  { value: "auto", label: "跟随主题" }, { value: "none", label: "无效果" },
  { value: "shadow", label: "阴影" }, { value: "outline", label: "描边" },
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
    textColorMode: value.textColorMode === "custom" ? "custom" : "theme",
    textColor: hex(value.textColor, DEFAULT_TYPOGRAPHY.textColor),
    textSecondaryColor: hex(value.textSecondaryColor, DEFAULT_TYPOGRAPHY.textSecondaryColor),
    textEffect: TEXT_EFFECTS.some(option => option.value === value.textEffect) ? value.textEffect! : "auto",
    textEffectColor: hex(value.textEffectColor, DEFAULT_TYPOGRAPHY.textEffectColor),
    textEffectStrength: typeof value.textEffectStrength === "number" && Number.isFinite(value.textEffectStrength)
      ? Math.min(100, Math.max(0, value.textEffectStrength)) : DEFAULT_TYPOGRAPHY.textEffectStrength,
  };
}

export function getFontFamily(value: TypographySettings) {
  const custom = normalizeFontName(value.customFontFamily);
  if (value.fontFamily === "custom") return custom ? `"${custom}", ${FONT_OPTIONS[0].family}` : FONT_OPTIONS[0].family;
  return FONT_OPTIONS.find(option => option.value === value.fontFamily)?.family ?? FONT_OPTIONS[0].family;
}

export function getTextShadow(value: TypographySettings) {
  if (value.textEffect === "auto" || value.textEffect === "none" || value.textEffectStrength === 0) return "none";
  const strength = Math.min(1, Math.max(0, value.textEffectStrength / 100));
  const color = (opacity: number) => `color-mix(in srgb, ${value.textEffectColor} ${+(strength * opacity).toFixed(2)}%, transparent)`;
  // Relative, subpixel offsets keep small type open. Eight full-pixel opaque
  // copies used to close counters and make a dark outline look like extra bold.
  if (value.textEffect === "outline") {
    const radius = +(0.012 + strength * 0.018).toFixed(4);
    return [[-1, 0], [1, 0], [0, -1], [0, 1]]
      .map(([x, y]) => `${+(x * radius).toFixed(4)}em ${+(y * radius).toFixed(4)}em 0 ${color(46)}`).join(", ");
  }
  if (value.textEffect === "glow") return `0 0 ${(0.08 + strength * 0.12).toFixed(3)}em ${color(50)}`;
  return `0 0.035em ${(0.05 + strength * 0.07).toFixed(3)}em ${color(42)}`;
}

export function typographyVariables(value: TypographySettings) {
  return {
    "--reading-font": getFontFamily(value),
    "--reading-text": value.textColorMode === "custom" ? value.textColor : "var(--theme-text)",
    "--reading-text-secondary": value.textColorMode === "custom" ? value.textSecondaryColor : "var(--theme-text-soft)",
    "--reading-text-faint": value.textColorMode === "custom" ? value.textSecondaryColor : "var(--theme-text-faint)",
    "--reading-shadow": getTextShadow(value),
  };
}

export function resetTypography(value: AppearanceSettings): AppearanceSettings {
  return { ...value, ...DEFAULT_TYPOGRAPHY, fontScale: 100, brandFontScale: 100, cardFontScale: 100, groupFontScale: 100 };
}
