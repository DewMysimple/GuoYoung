import { describe, expect, it } from "vitest";
import { createDefaultState, DEFAULT_WALLPAPER } from "../data/defaults";
import { getGlassPreset, GLASS_PRESETS } from "./glass-presets";
import { glassBackdropFilter } from "./wallpaper-glass";
import { normalizeWallpaper, parseStoredState } from "./storage";

describe("glass presets", () => {
  it("preserves crystal color and elides neutral filters", () => {
    const crystal = GLASS_PRESETS.find(preset => preset.id === "crystal")!;
    expect(crystal.values.glassSaturation).toBe(100);
    expect(glassBackdropFilter(crystal.values)).toBe("none");
    expect(glassBackdropFilter({ glassBlur: 9, glassSaturation: 100 })).toBe("blur(9px)");
    expect(glassBackdropFilter({ glassBlur: 0, glassSaturation: 125 })).toBe("saturate(125%)");
  });
  it("provides nine distinct, valid materials without changing image or topbar settings", () => {
    expect(GLASS_PRESETS).toHaveLength(9);
    const saved = { ...DEFAULT_WALLPAPER, source: "local" as const, localAssetId: "keep", zoom: 150, overlay: 47, topbarStyle: "glass" as const, topbarTransparency: 37 };
    for (const preset of GLASS_PRESETS) {
      const next = { ...saved, ...preset.values };
      expect(normalizeWallpaper(next)).toEqual(next);
      expect(getGlassPreset(next)?.id).toBe(preset.id);
      expect(next).toMatchObject({ source: "local", localAssetId: "keep", zoom: 150, overlay: 47, topbarStyle: "glass", topbarTransparency: 37 });
      const state = { ...createDefaultState(), wallpaper: next };
      expect(parseStoredState(JSON.stringify(state)).state.wallpaper).toEqual(next);
    }
    expect(getGlassPreset({ ...saved, glassShadow: 17 })).toBeUndefined();
  });
});
