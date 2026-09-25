import { describe, expect, it } from "vitest";
import { createDefaultState, DEFAULT_WALLPAPER } from "../data/defaults";
import { getGlassPreset, GLASS_PRESETS } from "./glass-presets";
import { normalizeWallpaper, parseStoredState } from "./storage";

describe("glass presets", () => {
  it("provides six distinct, valid materials without changing image or topbar settings", () => {
    expect(GLASS_PRESETS).toHaveLength(6);
    const saved = { ...DEFAULT_WALLPAPER, source: "local" as const, localAssetId: "keep", zoom: 150, overlay: 47, topbarStyle: "glass" as const, topbarOpacity: 63 };
    for (const preset of GLASS_PRESETS) {
      const next = { ...saved, ...preset.values };
      expect(normalizeWallpaper(next)).toEqual(next);
      expect(getGlassPreset(next)?.id).toBe(preset.id);
      expect(next).toMatchObject({ source: "local", localAssetId: "keep", zoom: 150, overlay: 47, topbarStyle: "glass", topbarOpacity: 63 });
      const state = { ...createDefaultState(), wallpaper: next };
      expect(parseStoredState(JSON.stringify(state)).state.wallpaper).toEqual(next);
    }
    expect(getGlassPreset({ ...saved, glassShadow: 17 })).toBeUndefined();
  });
});
