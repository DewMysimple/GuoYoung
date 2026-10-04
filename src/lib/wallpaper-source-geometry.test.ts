import { expect, it } from "vitest";
import { wallpaperSourceGeometry, type WallpaperSourceInput } from "./wallpaper-source-geometry";

const input: WallpaperSourceInput = {
  box: { left: 0, top: 0, width: 1200, height: 800 },
  naturalWidth: 1600, naturalHeight: 900, fit: "cover", positionX: 0.25, positionY: 0.75,
  transformScale: 1, wallpaperBlur: 0, glassBlur: 24, pixelRatio: 1,
};

it("positions a cover source from its visible image geometry rather than a card origin", () => {
  const result = wallpaperSourceGeometry(input)!;
  expect(result.width).toBeCloseTo(1600 * 800 / 900);
  expect(result.left).toBeCloseTo((1200 - result.width) * 0.25);
  expect(result.top).toBe(0);
  expect(result.height).toBe(800);
  expect(result.cardBlur).toBe(24);
  expect(result.spread).toBe(72);
  expect(result.sourceFilter).toBe("none");
  expect(result.cardFilter).toBe("blur(24px)");
});

it("keeps contain gaps and fractional transformed coordinates without DPR rounding", () => {
  const result = wallpaperSourceGeometry({ ...input, fit: "contain",
    box: { left: -12.125, top: -8.375, width: 1224, height: 816 }, transformScale: 1.02 })!;
  expect(result.width).toBe(1224);
  expect(result.height).toBe(688.5);
  expect(result.left).toBe(-12.125);
  expect(result.top).toBe(87.25);
});

it("scales the wallpaper's pre-transform blur and composes Gaussian variance", () => {
  const result = wallpaperSourceGeometry({ ...input, wallpaperBlur: 4, transformScale: 1.5 })!;
  expect(result.blur).toBe(6);
  expect(result.cardBlur).toBeCloseTo(Math.sqrt(6 ** 2 + 24 ** 2));
  expect(result.spread).toBeCloseTo(3 * result.cardBlur);
  expect(wallpaperSourceGeometry({ ...input, wallpaperBlur: 4, transformScale: 1.5, glassBlur: 0 })?.cardBlur).toBe(6);
});

it("does not publish unready or invalid geometry", () => {
  expect(wallpaperSourceGeometry({ ...input, naturalWidth: 0 })).toBeNull();
  expect(wallpaperSourceGeometry({ ...input, box: { ...input.box, width: 0 } })).toBeNull();
  expect(wallpaperSourceGeometry({ ...input, transformScale: Number.NaN })).toBeNull();
  expect(wallpaperSourceGeometry({ ...input, glassBlur: -1 })).toBeNull();
  expect(wallpaperSourceGeometry({ ...input, pixelRatio: 0 })).toBeNull();
});

it("shares source passes at fractional DPR and adds glass only after them", () => {
  for (const pixelRatio of [1, 1.25, 1.5, 2]) {
    for (const wallpaperBlur of [0, 0.5, 8, 30]) {
      const sourceOnly = wallpaperSourceGeometry({ ...input, wallpaperBlur, glassBlur: 0, pixelRatio })!;
      expect(sourceOnly.cardFilter).toBe(sourceOnly.sourceFilter);
      expect(sourceOnly.sourceFilter).not.toContain("blur(0px)");
      const radii = [...sourceOnly.sourceFilter.matchAll(/blur\(([^)]+)/g)].map(match => Number.parseFloat(match[1]));
      expect(Math.hypot(...radii)).toBeCloseTo(wallpaperBlur);
      expect(radii[0] ?? 0).toBeLessThanOrEqual(2 / pixelRatio);
      const frosted = wallpaperSourceGeometry({ ...input, wallpaperBlur, glassBlur: 24, pixelRatio })!;
      expect(frosted.sourceFilter).toBe(sourceOnly.sourceFilter);
      expect(frosted.cardFilter).toBe(`${radii.length ? `${sourceOnly.sourceFilter} ` : ""}blur(24px)`);
    }
  }
});
