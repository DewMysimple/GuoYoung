import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { applyLayoutPreset, applyTextSize, getLayoutPreset, getTextSize, patchAppearance } from "./appearance-settings";

describe("appearance choices", () => {
  it("changes layout without replacing color, reading size or brand geometry", () => {
    const before = { ...DEFAULT_APPEARANCE, accentColor: "#00897b", fontScale: 110, brandLogoSize: 48 };
    const after = applyLayoutPreset(before, "compact");
    expect(after).toMatchObject({ cardWidth: 140, gap: 8, layoutPreset: "compact", fontScale: 110, accentColor: "#00897b", brandLogoSize: 48 });
    expect(before.cardWidth).toBe(160);
  });

  it("recognizes actual geometry even when the persisted preset marker is stale", () => {
    expect(getLayoutPreset({ ...DEFAULT_APPEARANCE, cardWidth: 211 })).toBe("custom");
    expect(getLayoutPreset({ ...DEFAULT_APPEARANCE, layoutPreset: "custom" })).toBe("standard");
    const custom = patchAppearance(DEFAULT_APPEARANCE, { gap: 25 });
    expect(custom.layoutPreset).toBe("custom");
    expect(patchAppearance(custom, { gap: 12 }).layoutPreset).toBe("standard");
  });

  it("keeps hidden legacy values until an explicit corresponding choice", () => {
    const legacy = { ...DEFAULT_APPEARANCE, brandFontScale: 150, cardFontScale: 112, groupFontScale: 90, brandLogoScale: 84, searchHeight: 66 };
    expect(getTextSize(legacy)).toBeUndefined();
    expect(patchAppearance(legacy, { accentColor: "#00897b" })).toMatchObject({ ...legacy, layoutPreset: "custom", accentColor: "#00897b" });
    expect(applyTextSize(legacy, 110)).toMatchObject({ fontScale: 110, brandFontScale: 100, cardFontScale: 100, groupFontScale: 100, brandLogoScale: 84, searchHeight: 66 });
  });

  it("keeps layout and reading choices independent in either order", () => {
    const first = applyTextSize(applyLayoutPreset(DEFAULT_APPEARANCE, "spacious"), 110);
    const second = applyLayoutPreset(applyTextSize(DEFAULT_APPEARANCE, 110), "spacious");
    expect(first).toEqual(second);
    expect(getLayoutPreset(first)).toBe("spacious");
    expect(getTextSize(first)).toBe(110);
  });
});
