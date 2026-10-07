import { describe, expect, it } from "vitest";
import { createDefaultState, DEFAULT_WALLPAPER } from "../data/defaults";
import { getGlassPreset, GLASS_PRESETS, glassFilter } from "./glass-presets";
import { normalizeWallpaper, parseStoredState } from "./storage";

describe("glass presets", () => {
  it("avoids displacement in presets, preserves crystal color and elides neutral filters", () => {
    expect(GLASS_PRESETS.every(preset => !preset.values.glassRefraction)).toBe(true);
    const crystal = GLASS_PRESETS.find(preset => preset.id === "crystal")!;
    expect(crystal.values.glassSaturation).toBe(100);
    expect(glassFilter(crystal.values)).toBe("none");
    expect(glassFilter({ glassBlur: 9, glassSaturation: 100 })).toBe("blur(9px)");
    expect(glassFilter({ glassBlur: 0, glassSaturation: 125 }, "lens")).toBe("saturate(125%) url(#lens)");
  });
  it("provides nine distinct, valid materials without changing image or topbar settings", () => {
    expect(GLASS_PRESETS).toHaveLength(9);
    const saved = { ...DEFAULT_WALLPAPER, source: "local" as const, localAssetId: "keep", zoom: 150, overlay: 47, topbarOpacity: 63 };
    for (const preset of GLASS_PRESETS) {
      const next = { ...saved, ...preset.values };
      expect(normalizeWallpaper(next)).toEqual(next);
      expect(getGlassPreset(next)?.id).toBe(preset.id);
      expect(next).toMatchObject({ source: "local", localAssetId: "keep", zoom: 150, overlay: 47, topbarOpacity: 63 });
      const state = { ...createDefaultState(), wallpaper: next };
      expect(parseStoredState(JSON.stringify(state)).state.wallpaper).toEqual(next);
    }
    expect(getGlassPreset({ ...saved, glassShadow: 17 })).toBeUndefined();
  });
});
