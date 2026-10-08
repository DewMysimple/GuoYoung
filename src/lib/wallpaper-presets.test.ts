import { describe, expect, it } from "vitest";
import { createDefaultState, DEFAULT_WALLPAPER } from "../data/defaults";
import { applyWallpaperPreset, getWallpaperPreset, pickGlass, pickWallpaperGlass, saveCustomWallpaperPreset, WALLPAPER_PRESETS } from "./wallpaper-presets";
import { normalizeWallpaper, parseStoredState } from "./storage";
import { parseImportFile, serializeExport } from "./data-transfer";
import { glassBackdropFilter } from "./wallpaper-glass";

describe("wallpaper appearance presets", () => {
  it("provides four distinct valid presets including the exact reference material", () => {
    expect(WALLPAPER_PRESETS).toHaveLength(4);
    expect(new Set(WALLPAPER_PRESETS.map(preset => JSON.stringify(preset.values))).size).toBe(4);
    expect(pickGlass(WALLPAPER_PRESETS[0].values)).toEqual({
      glassTransparency: 100, glassControlTransparency: 100, glassPanelTransparency: 100, glassPopoverTransparency: 100,
      glassShadow: 72, glassBlur: 21, glassSaturation: 100, glassHighlight: 18,
    });
    for (const preset of WALLPAPER_PRESETS) {
      const next = { ...DEFAULT_WALLPAPER, ...applyWallpaperPreset(DEFAULT_WALLPAPER, preset.values) };
      expect(normalizeWallpaper(next)).toEqual(next);
      expect(getWallpaperPreset(next)?.id).toBe(preset.id);
    }
    expect(glassBackdropFilter(WALLPAPER_PRESETS[1].values)).toBe("none");
  });

  it("applies only material fields and leaves independent panels intact when the switch is off", () => {
    const value = { ...DEFAULT_WALLPAPER, source: "local" as const, localAssetId: "keep", fit: "contain" as const,
      zoom: 150, overlay: 47, presetIncludesPanels: false, topbarStyle: "glass" as const, topbarTransparency: 37 };
    const next = { ...value, ...applyWallpaperPreset(value, WALLPAPER_PRESETS[0].values) };
    expect(next).toEqual({ ...value, ...pickGlass(WALLPAPER_PRESETS[0].values) });
    expect(getWallpaperPreset(next)?.id).toBe("clear");
    expect(getWallpaperPreset({ ...next, presetIncludesPanels: true })).toBeUndefined();
    expect(getWallpaperPreset({ ...next, glassShadow: 17 })).toBeUndefined();
  });

  it("saves complete isolated snapshots with the switch off and overwrites just the chosen slot", () => {
    const value = { ...DEFAULT_WALLPAPER, presetIncludesPanels: false, glassShadow: 17,
      topbarStyle: "shared" as const, topbarTransparency: 37, topbarBlur: 8, sidebarStyle: "glass" as const, sidebarBlur: 9 };
    const first = saveCustomWallpaperPreset(value, 0);
    expect(first).toEqual([pickWallpaperGlass(value), null]);
    expect(first[0]).not.toHaveProperty("customPresets");
    expect(first[0]).not.toHaveProperty("source");
    expect(value.customPresets).toEqual([null, null]);
    const edited = { ...value, customPresets: first, glassShadow: 23, topbarBlur: 4 };
    const second = saveCustomWallpaperPreset(edited, 1);
    expect(second).toEqual([first[0], pickWallpaperGlass(edited)]);
    const overwritten = saveCustomWallpaperPreset({ ...edited, customPresets: second }, 0);
    expect(overwritten).toEqual([pickWallpaperGlass(edited), second[1]]);
    const restored = { ...edited, presetIncludesPanels: true,
      ...applyWallpaperPreset({ ...edited, presetIncludesPanels: true }, first[0]!) };
    expect(pickWallpaperGlass(restored)).toEqual(first[0]);
    expect(getWallpaperPreset({ ...restored, customPresets: first })?.id).toBe("custom-1");
  });

  it.each([24, 25])("migrates version %s without replacing collections or existing preferences", version => {
    const state = createDefaultState();
    const { presetIncludesPanels: _scope, customPresets: _presets, ...wallpaper } = state.wallpaper;
    const original = { ...state, version, wallpaper: { ...wallpaper, glassShadow: 17, topbarTransparency: 37 } };
    const loaded = parseStoredState(JSON.stringify(original));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state).toEqual({ ...original, version: 26,
      wallpaper: { ...original.wallpaper, presetIncludesPanels: true, customPresets: [null, null] } });
    expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
  });

  it("round-trips both custom slots, shared modes and the scope preference through storage and backups", () => {
    const state = createDefaultState();
    state.wallpaper.presetIncludesPanels = false;
    state.wallpaper.customPresets = [pickWallpaperGlass(state.wallpaper), pickWallpaperGlass(WALLPAPER_PRESETS[0].values)];
    expect(parseStoredState(JSON.stringify(state)).state).toEqual(state);
    expect(parseImportFile(serializeExport(state))).toEqual({ ...state, githubMigration: undefined });
  });

  it("rejects incomplete snapshots, bounds valid numbers and strips extra or nested fields", () => {
    const snapshot = { ...WALLPAPER_PRESETS[0].values, glassBlur: 500, topbarTransparency: -1, source: "url", customPresets: ["nested"] };
    expect(normalizeWallpaper({ customPresets: [snapshot, { glassBlur: 12 }, snapshot], presetIncludesPanels: "false" }))
      .toMatchObject({ presetIncludesPanels: true, customPresets: [
        { ...WALLPAPER_PRESETS[0].values, glassBlur: 30, topbarTransparency: 0 }, null,
      ] });
    expect(normalizeWallpaper({ customPresets: [null, { ...snapshot, glassBlur: "12" }] }).customPresets).toEqual([null, null]);
    expect(normalizeWallpaper({ customPresets: [[], { ...snapshot, topbarStyle: "other" }] }).customPresets).toEqual([null, null]);
  });
});
