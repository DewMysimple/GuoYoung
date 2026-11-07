import { describe, expect, it } from "vitest";
import { createDefaultState, DEFAULT_WALLPAPER, STATE_VERSION } from "../data/defaults";
import { parseImportFile, serializeExport } from "./data-transfer";
import { normalizeWallpaper, parseStoredState, STORAGE_KEY } from "./storage";
import { OVERLAY_GLASS_KEYS, pickWallpaperGlass, saveCustomWallpaperPreset, applyWallpaperPreset, getWallpaperPreset, WALLPAPER_PRESETS } from "./wallpaper-presets";
import { resolveGlassSettings, wallpaperGlassStyle } from "./wallpaper-glass";

const tokens = (value: typeof DEFAULT_WALLPAPER, prefix: string) => Object.fromEntries(
  Object.entries(wallpaperGlassStyle(value)).filter(([key]) => key.startsWith(prefix)),
);

describe("independent card and overlay materials", () => {
  it("allows clear zero-blur cards with a readable frosted dialog", () => {
    const value = { ...DEFAULT_WALLPAPER, glassTransparency: 100, glassBlur: 0, glassSaturation: 100 };
    expect(resolveGlassSettings(value).card).toEqual({ transparency: 100, blur: 0, filter: "none", image: "none" });
    expect(resolveGlassSettings(value).overlay).toMatchObject({ transparency: 25, blur: 24, fill: .75, filter: "blur(24px)" });
    expect(wallpaperGlassStyle(value)).toMatchObject({ "--card-glass-opacity": "0%", "--overlay-glass-opacity": "75%" });
  });

  it("keeps blur at 100% transparency and does not lend card blur to overlays", () => {
    const material = resolveGlassSettings({ ...DEFAULT_WALLPAPER, glassTransparency: 100, glassBlur: 30,
      glassSaturation: 100, overlayBlur: 0 });
    expect(material.card.filter).toBe("blur(30px)");
    expect(material.overlay.filter).toBe("none");
  });

  it.each([0, 9, 30])("card edits at blur %s leave every resolved overlay value and token identical", glassBlur => {
    const changed = { ...DEFAULT_WALLPAPER, glassBlur, glassTransparency: 100, glassSaturation: 100 };
    expect(resolveGlassSettings(changed).overlay).toEqual(resolveGlassSettings(DEFAULT_WALLPAPER).overlay);
    expect(tokens(changed, "--overlay-")).toEqual(tokens(DEFAULT_WALLPAPER, "--overlay-"));
  });

  it.each([0, 11, 30])("overlay edits at blur %s leave every resolved card and shell token identical", overlayBlur => {
    const changed = { ...DEFAULT_WALLPAPER, overlayBlur, overlayTransparency: 100,
      overlayBackdropDim: 0, overlayReadabilityProtection: false };
    expect(resolveGlassSettings(changed).card).toEqual(resolveGlassSettings(DEFAULT_WALLPAPER).card);
    for (const prefix of ["--card-", "--topbar-", "--sidebar-", "--shell-"]) {
      expect(tokens(changed, prefix)).toEqual(tokens(DEFAULT_WALLPAPER, prefix));
    }
  });

  it("protects zero-blur text more strongly and makes the effective transparency explicit", () => {
    const sharp = resolveGlassSettings({ ...DEFAULT_WALLPAPER, overlayTransparency: 100, overlayBlur: 0 }).overlay;
    const soft = resolveGlassSettings({ ...DEFAULT_WALLPAPER, overlayTransparency: 100, overlayBlur: 30 }).overlay;
    expect(sharp.fill).toBeCloseTo(.82);
    expect(sharp.popoverFill).toBeCloseTo(.94);
    expect(sharp.effectiveTransparency).toBe(18);
    expect(soft.fill).toBeCloseTo(.60);
    expect(soft.popoverFill).toBeCloseTo(.84);
    expect(soft.effectiveTransparency).toBe(40);
    const custom = resolveGlassSettings({ ...DEFAULT_WALLPAPER, overlayTransparency: 100,
      overlayBlur: 30, overlayReadabilityProtection: false }).overlay;
    expect(custom).toMatchObject({ fill: 0, popoverFill: 0, filter: "blur(30px)", effectiveTransparency: 100 });
  });

  it.each([undefined, NaN, Infinity, "0", "100", null, {}])("normalizes malformed overlay input %j to safe defaults", invalid => {
    expect(normalizeWallpaper({ overlayTransparency: invalid, overlayBlur: invalid, overlayBackdropDim: invalid,
      overlayReadabilityProtection: invalid })).toMatchObject({ overlayTransparency: 25, overlayBlur: 24,
      overlayBackdropDim: 30, overlayReadabilityProtection: true });
  });

  it.each([0, 100])("preserves transparency/dimming boundary %s and explicit false through reload", boundary => {
    const value = normalizeWallpaper({ ...DEFAULT_WALLPAPER, overlayTransparency: boundary,
      overlayBlur: boundary, overlayBackdropDim: boundary, overlayReadabilityProtection: false });
    expect(value).toMatchObject({ overlayTransparency: boundary, overlayBlur: Math.min(30, boundary),
      overlayBackdropDim: boundary, overlayReadabilityProtection: false });
    expect(normalizeWallpaper(value)).toEqual(value);
  });

  it("clamps finite values without resetting unrelated materials or independent panels", () => {
    const original = { ...DEFAULT_WALLPAPER, topbarStyle: "glass" as const, topbarTransparency: 100, topbarBlur: 0,
      sidebarStyle: "glass" as const, sidebarTransparency: 0, sidebarBlur: 30 };
    expect(normalizeWallpaper({ ...original, overlayTransparency: -1, overlayBlur: 999, overlayBackdropDim: -2 }))
      .toEqual({ ...original, overlayTransparency: 0, overlayBlur: 30, overlayBackdropDim: 0 });
  });
});

describe("overlay migration, presets and portable backups", () => {
  it("upgrades v29 without changing card values, collection hierarchy or old shell controls", () => {
    const state = createDefaultState();
    const old = Object.fromEntries(Object.entries(state.wallpaper).filter(([key]) =>
      !OVERLAY_GLASS_KEYS.some(overlay => key === overlay)));
    const legacy = { ...state, version: 29, wallpaper: { ...old, glassTransparency: 100, glassBlur: 0,
      glassPanelTransparency: 100, glassPopoverTransparency: 100 } };
    const migrated = parseStoredState(JSON.stringify(legacy));
    expect(migrated.recovered).toBe(false);
    expect(migrated.state).toEqual({ ...legacy, version: STATE_VERSION, wallpaper: { ...legacy.wallpaper,
      overlayTransparency: 25, overlayBlur: 24, overlayBackdropDim: 30, overlayReadabilityProtection: true } });
    expect(parseStoredState(JSON.stringify(migrated.state)).state).toEqual(migrated.state);
    expect(STORAGE_KEY).toBe("site-hub:v1");
  });

  it("fills only missing overlay fields in mixed old/new data", () => {
    expect(normalizeWallpaper({ ...DEFAULT_WALLPAPER, overlayTransparency: 0, overlayBlur: undefined,
      overlayBackdropDim: 100, overlayReadabilityProtection: false })).toEqual({ ...DEFAULT_WALLPAPER,
      overlayTransparency: 0, overlayBackdropDim: 100, overlayReadabilityProtection: false });
  });

  it("retains complete legacy custom slots and adds safe overlay values instead of discarding them", () => {
    const snapshot = pickWallpaperGlass({ ...DEFAULT_WALLPAPER, glassTransparency: 100, glassBlur: 0,
      glassPanelTransparency: 100 });
    const legacy = Object.fromEntries(Object.entries(snapshot).filter(([key]) =>
      !OVERLAY_GLASS_KEYS.some(overlay => key === overlay)));
    const normalized = normalizeWallpaper({ ...DEFAULT_WALLPAPER, customPresets: [legacy, legacy] });
    expect(normalized.customPresets).toEqual([snapshot, snapshot]);
    expect(normalizeWallpaper(normalized)).toEqual(normalized);
  });

  it.each(WALLPAPER_PRESETS)("applies, saves, restores and identifies both materials for $id", preset => {
    const applied = { ...DEFAULT_WALLPAPER, ...applyWallpaperPreset(DEFAULT_WALLPAPER, preset.values) };
    expect(getWallpaperPreset(applied)?.id).toBe(preset.id);
    const saved = saveCustomWallpaperPreset(applied, 0);
    const edited = { ...applied, customPresets: saved, overlayBlur: 0, overlayTransparency: 100 };
    expect(getWallpaperPreset(edited)).toBeUndefined();
    const restored = { ...edited, ...applyWallpaperPreset(edited, saved[0]!) };
    expect(getWallpaperPreset(restored)?.id).toBe("custom-1");
    expect(pickWallpaperGlass(restored)).toEqual(preset.values);
    expect(resolveGlassSettings(restored).overlay.fill).toBeGreaterThan(0);
  });

  it("imports an old JSON backup with clear cards and complete custom slots without inheriting unsafe overlay values", () => {
    const state = createDefaultState();
    const oldSlot = Object.fromEntries(Object.entries(pickWallpaperGlass({ ...state.wallpaper,
      glassTransparency: 100, glassBlur: 0, glassPanelTransparency: 100 })).filter(([key]) =>
      !OVERLAY_GLASS_KEYS.some(overlay => key === overlay)));
    const oldWallpaper = Object.fromEntries(Object.entries({ ...state.wallpaper,
      glassTransparency: 100, glassBlur: 0, glassPanelTransparency: 100, customPresets: [oldSlot, null] })
      .filter(([key]) => !OVERLAY_GLASS_KEYS.some(overlay => key === overlay)));
    const payload = JSON.parse(serializeExport(state));
    payload.state = { ...payload.state, version: 29, wallpaper: oldWallpaper };
    const restored = parseImportFile(JSON.stringify(payload));
    expect(restored.version).toBe(STATE_VERSION);
    expect(restored.wallpaper).toMatchObject({ glassTransparency: 100, glassBlur: 0,
      glassPanelTransparency: 100, overlayTransparency: 25, overlayBlur: 24 });
    expect(restored.wallpaper.customPresets[0]).toMatchObject({ ...oldSlot, overlayTransparency: 25,
      overlayBlur: 24, overlayBackdropDim: 30, overlayReadabilityProtection: true });
    expect(restored.groups).toEqual(state.groups);
    expect(parseStoredState(JSON.stringify(restored)).state).toEqual(restored);
  });

  it("round-trips new independent settings, false and custom slots through storage and JSON", () => {
    const state = createDefaultState();
    state.wallpaper = { ...state.wallpaper, glassTransparency: 100, glassBlur: 0, overlayBlur: 0,
      overlayTransparency: 100, overlayBackdropDim: 0, overlayReadabilityProtection: false };
    state.wallpaper.customPresets = saveCustomWallpaperPreset(state.wallpaper, 1);
    expect(parseStoredState(JSON.stringify(state)).state).toEqual(state);
    expect(parseImportFile(serializeExport(state))).toEqual({ ...state, githubMigration: undefined });
  });
});
