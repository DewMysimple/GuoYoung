import { describe, expect, it } from "vitest";
import { DEFAULT_WALLPAPER } from "../../data/defaults";
import { normalizeWallpaper as normalizeStoredWallpaper } from "../storage";
import { pickWallpaperGlass } from "../wallpaper-presets";
import { normalizeWallpaper } from "./wallpaper";

describe("wallpaper storage normalization boundary", () => {
  it("keeps the existing storage export bound to the unique pure implementation", () => {
    expect(normalizeStoredWallpaper).toBe(normalizeWallpaper);
  });

  it("copies the two frozen preset slots while preserving explicit zeros and false", () => {
    const first = Object.freeze({ ...pickWallpaperGlass(DEFAULT_WALLPAPER),
      glassBlur: 0, glassHighlight: 0, topbarTransparency: 0 });
    const second = Object.freeze({ ...first, glassShadow: 19 });
    const input = Object.freeze({ source: "local", localAssetId: "wallpaper-asset",
      positionX: 0, positionY: 100, zoom: 50, overlay: 0, blur: 0,
      presetIncludesPanels: false, customPresets: Object.freeze([first, second]) });
    const result = normalizeWallpaper(input);
    expect(result).toEqual({ ...DEFAULT_WALLPAPER, ...input,
      topbarStyle: "glass", customPresets: [first, second] });
    expect(result).not.toBe(input);
    expect(result.customPresets).not.toBe(input.customPresets);
    expect(result.customPresets[0]).not.toBe(first);
    expect(result.customPresets[1]).not.toBe(second);
    expect(normalizeWallpaper(result)).toEqual(result);
    result.customPresets[0]!.glassShadow = 70;
    expect(first.glassShadow).toBe(DEFAULT_WALLPAPER.glassShadow);
  });

  it("gives finite current coordinates and transparency priority over legacy values", () => {
    const result = normalizeWallpaper({ position: "right bottom", positionX: 0, positionY: 21.5,
      topbarOpacity: 27, topbarTransparency: 0, topbarStyle: "shared",
      sidebarStyle: "glass", sidebarTransparency: 0, sidebarBlur: 0 });
    expect(result).toMatchObject({ positionX: 0, positionY: 21.5, topbarTransparency: 0,
      topbarStyle: "shared", sidebarStyle: "glass", sidebarTransparency: 0, sidebarBlur: 0 });
    expect(normalizeWallpaper({ position: "right bottom", positionX: Infinity, positionY: NaN,
      topbarTransparency: NaN, topbarOpacity: 27 })).toMatchObject({ positionX: 100,
      positionY: 100, topbarTransparency: 73 });
    expect(normalizeWallpaper(result)).toEqual(result);
  });

  it("keeps malformed snapshots empty and discards only slots beyond the original two", () => {
    const snapshot = pickWallpaperGlass(DEFAULT_WALLPAPER);
    expect(normalizeWallpaper({ customPresets: [{ ...snapshot, glassBlur: NaN }, snapshot, snapshot] })
      .customPresets).toEqual([null, snapshot]);
    expect(normalizeWallpaper({ customPresets: [snapshot, { ...snapshot, glassBlur: Infinity }] })
      .customPresets).toEqual([snapshot, null]);
    expect(normalizeWallpaper({ customPresets: [{ glassBlur: 0 }, []] })
      .customPresets).toEqual([null, null]);
  });

  it("preserves observable getter errors at the old public boundary", () => {
    const failure = new Error("synthetic wallpaper read failure");
    const input = { get source(): string { throw failure; } };
    for (const normalize of [normalizeWallpaper, normalizeStoredWallpaper]) {
      expect(() => normalize(input)).toThrow(failure);
    }
  });
});
