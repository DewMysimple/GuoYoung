import { expect, it } from "vitest";
import { createDefaultState, DEFAULT_APPEARANCE } from "../data/defaults";
import { normalizeAppearance, parseStoredState } from "./storage";
import { parseImportFile, serializeExport } from "./data-transfer";
import { DEFAULT_TYPOGRAPHY, getFontFamily, getTextShadow, resetTypography } from "./typography";

it("adds v19 reading defaults to v18 without replacing collections or legacy text scales", () => {
  const state = createDefaultState();
  const appearance: Record<string, unknown> = { ...state.appearance, fontScale: 107, cardFontScale: 123, groupFontScale: 92, brandFontScale: 113 };
  for (const field of [...Object.keys(DEFAULT_TYPOGRAPHY), "allowTextSelection"]) delete appearance[field];
  const raw = JSON.stringify({ ...state, version: 18, appearance });
  const loaded = parseStoredState(raw);
  expect(loaded.recovered).toBe(false);
  expect(loaded.state.version).toBe(19);
  expect(loaded.state.appearance).toEqual({ ...appearance, ...DEFAULT_TYPOGRAPHY, allowTextSelection: true });
  expect(loaded.state.sites).toEqual(state.sites);
  expect(loaded.state.groups).toEqual(state.groups);
  expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
});

it("preserves font/color/effect and selection preferences through old versions, reload and backup", () => {
  const state = createDefaultState();
  state.appearance = { ...state.appearance, fontFamily: "custom", customFontFamily: "微软雅黑", textColorMode: "custom",
    textColor: "#ffffff", textSecondaryColor: "#ddeeff", textEffect: "glow", textEffectColor: "#cceeff", textEffectStrength: 0, allowTextSelection: false };
  for (const version of [15, 16, 17, 18, 19]) {
    const loaded = parseStoredState(JSON.stringify({ ...state, version }));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state.appearance).toEqual(state.appearance);
  }
  expect(parseImportFile(serializeExport(state)).appearance).toEqual(state.appearance);
});

it("normalizes missing and invalid typography at the current-version storage boundary", () => {
  const state = createDefaultState();
  const loaded = parseStoredState(JSON.stringify({ ...state, appearance: { ...state.appearance,
    fontFamily: "unsafe", customFontFamily: { bad: true }, textColorMode: null, textColor: "red;display:none", textSecondaryColor: "#fff",
    textEffect: "flash", textEffectColor: "invalid", textEffectStrength: "50", allowTextSelection: "false" } }));
  expect(loaded.recovered).toBe(false);
  expect(loaded.state.appearance).toEqual(DEFAULT_APPEARANCE);
  expect(normalizeAppearance({ textEffectStrength: 900 }).textEffectStrength).toBe(100);
  expect(normalizeAppearance({ textEffectStrength: -1 }).textEffectStrength).toBe(0);
});

it("contains a custom font to one local family and provides a fallback", () => {
  const value = normalizeAppearance({ fontFamily: "custom", customFontFamily: 'Font"; color:red;/*' });
  const family = getFontFamily(value);
  expect(family).not.toMatch(/[;/*]/);
  expect(family).toContain('"Manrope Variable"');
  expect(getFontFamily(normalizeAppearance({ fontFamily: "custom", customFontFamily: "" }))).toBe(getFontFamily(DEFAULT_TYPOGRAPHY));
});

it("disables all explicit text effects at zero strength and resets only typography", () => {
  for (const textEffect of ["shadow", "outline", "glow"] as const) {
    expect(getTextShadow({ ...DEFAULT_TYPOGRAPHY, textEffect, textEffectStrength: 0 })).toBe("none");
    expect(getTextShadow({ ...DEFAULT_TYPOGRAPHY, textEffect })).not.toBe("none");
  }
  const value = { ...DEFAULT_APPEARANCE, textColor: "#ffffff", fontScale: 117, cardFontScale: 140,
    cardWidth: 211, accentColor: "#abcdef", allowTextSelection: false };
  expect(resetTypography(value)).toEqual({ ...value, ...DEFAULT_TYPOGRAPHY, fontScale: 100, cardFontScale: 100 });
});
