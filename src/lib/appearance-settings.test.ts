import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { applyLayoutPreset, getLayoutPreset, patchAppearance, restoreLayout } from "./appearance-settings";

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
    expect(patchAppearance(legacy, { accentColor: "#00897b" })).toMatchObject({ ...legacy, layoutPreset: "custom", accentColor: "#00897b" });
    expect(patchAppearance(legacy, { fontScale: 110 })).toMatchObject({ fontScale: 110, brandFontScale: 150, cardFontScale: 112, groupFontScale: 90, brandLogoScale: 84, searchHeight: 66 });
  });

  it("keeps layout and reading choices independent in either order", () => {
    const first = patchAppearance(applyLayoutPreset(DEFAULT_APPEARANCE, "spacious"), { fontScale: 110 });
    const second = applyLayoutPreset(patchAppearance(DEFAULT_APPEARANCE, { fontScale: 110 }), "spacious");
    expect(first).toEqual(second);
    expect(getLayoutPreset(first)).toBe("spacious");
    expect(first.fontScale).toBe(110);
  });
  it("restores the selected geometry without undoing later color or text changes", () => {
    const selected = applyLayoutPreset(DEFAULT_APPEARANCE, "spacious");
    const adjusted = patchAppearance(patchAppearance(selected, { fontScale: 110 }), { cardHeight: 212, accentColor: "#00897b" });
    const restored = restoreLayout(adjusted, selected);
    expect(restored).toMatchObject({ cardHeight: 168, cardWidth: 190, fontScale: 110, accentColor: "#00897b", layoutPreset: "spacious" });
    expect(adjusted.cardHeight).toBe(212);
  });

  it("keeps new layout modes and interface presentation when applying a density preset", () => {
    const before = { ...DEFAULT_APPEARANCE, settingsPresentation: "push" as const,
      interfaceScale: 125, contentWidthMode: "full" as const, cardShape: "square" as const,
      cardLayout: "columns" as const, cardColumns: 8 };
    const after = applyLayoutPreset(before, "compact");
    expect(after).toMatchObject({ settingsPresentation: "push", interfaceScale: 125,
      contentWidthMode: "full", cardShape: "square", cardLayout: "columns", cardColumns: 8,
      cardWidth: 140, cardHeight: 124, gap: 8, layoutPreset: "custom" });
  });

  it("treats a changed layout mode as custom but keeps scale and presentation independent", () => {
    expect(getLayoutPreset({ ...DEFAULT_APPEARANCE, interfaceScale: 150, settingsPresentation: "push" })).toBe("standard");
    expect(getLayoutPreset({ ...DEFAULT_APPEARANCE, contentWidthMode: "full" })).toBe("custom");
    expect(getLayoutPreset({ ...DEFAULT_APPEARANCE, cardShape: "square" })).toBe("custom");
    expect(getLayoutPreset({ ...DEFAULT_APPEARANCE, cardLayout: "columns" })).toBe("custom");
    expect(getLayoutPreset({ ...DEFAULT_APPEARANCE, cardColumns: 8 })).toBe("standard");
  });

  it("matches presets from active layout values while preserving idle requested columns", () => {
    const adaptive = { ...DEFAULT_APPEARANCE, cardColumns: 9 };
    expect(getLayoutPreset(adaptive)).toBe("standard");
    const columns = patchAppearance(adaptive, { cardLayout: "columns" });
    expect(getLayoutPreset(columns)).toBe("custom");
    expect(columns.cardColumns).toBe(9);
    expect(patchAppearance(columns, { cardLayout: "adaptive" }).layoutPreset).toBe("standard");
    const compact = applyLayoutPreset(adaptive, "compact");
    expect(compact.layoutPreset).toBe("compact");
    expect(compact.cardColumns).toBe(9);
  });

  it("restores layout modes and hidden dimensions while keeping scale, presentation and reading preferences", () => {
    const before = { ...DEFAULT_APPEARANCE, settingsPresentation: "push" as const,
      interfaceScale: 130, fontScale: 115, contentWidthMode: "full" as const,
      cardShape: "square" as const, cardLayout: "columns" as const, cardColumns: 8,
      cardWidth: 300, cardHeight: 380 };
    const restored = restoreLayout(before, DEFAULT_APPEARANCE);
    expect(restored).toMatchObject({ settingsPresentation: "push", interfaceScale: 130, fontScale: 115,
      contentWidthMode: "fixed", cardShape: "free", cardLayout: "adaptive", cardColumns: 6,
      cardWidth: 160, cardHeight: 140, layoutPreset: "standard" });
    expect(before.cardHeight).toBe(380);
  });

});
