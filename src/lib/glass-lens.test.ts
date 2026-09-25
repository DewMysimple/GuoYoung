import { describe, expect, it } from "vitest";
import { lensDisplacement } from "./glass-lens";

describe("glass lens geometry", () => {
  it.each([[200, 160, 16], [1440, 104, 24], [680, 48, 16]])("keeps the center neutral and bends opposite rims inward (%d×%d)", (width, height, radius) => {
    expect(lensDisplacement(width / 2, height / 2, width, height, radius)).toEqual([0, 0]);
    const left = lensDisplacement(4, height / 2, width, height, radius);
    const right = lensDisplacement(width - 4, height / 2, width, height, radius);
    expect(left[0]).toBeGreaterThan(0);
    expect(right[0]).toBeCloseTo(-left[0]);
    expect(left[1]).toBe(0);
    expect(lensDisplacement(-1, height / 2, width, height, radius)).toEqual([0, 0]);
    expect(lensDisplacement(radius + 18, height / 2, width, height, radius)).toEqual([0, 0]);
  });
});
