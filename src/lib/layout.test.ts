import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { appearanceScale, cardLayoutVariables, getGridLayout, getMinimumCardWidth, scaledGeometry } from "./layout";

describe("layout geometry", () => {
  it("reserves enough width for the standard icon, three actions, padding and border", () => {
    const layout = getGridLayout({ ...DEFAULT_APPEARANCE, cardLayout: "columns", cardColumns: 12 }, 1300);
    expect(layout.minCardWidth).toBe(158);
    expect(layout.columns).toBe(7);
    expect(layout.cardWidth).toBeGreaterThanOrEqual(158);
  });

  it("scales lengths once while preserving independent user ratios and input", () => {
    const appearance = { ...DEFAULT_APPEARANCE, interfaceScale: 125,
      cardWidth: 200, cardHeight: 180, gap: 16, fontScale: 110,
      uiIconScale: 130, controlScale: 115 };
    expect(appearanceScale(appearance)).toBe(1.25);
    const geometry = scaledGeometry(appearance);
    expect(geometry).toMatchObject({ cardWidth: 250, cardHeight: 225, gap: 20,
      topbarHeight: 80, pagePadding: 25, contentWidth: 2000 });
    expect(geometry).not.toHaveProperty("fontScale");
    expect(geometry).not.toHaveProperty("uiIconScale");
    expect(geometry).not.toHaveProperty("controlScale");
    expect(appearance).toMatchObject({ cardWidth: 200, cardHeight: 180, gap: 16,
      interfaceScale: 125, fontScale: 110, uiIconScale: 130, controlScale: 115 });
  });

  it("uses all fitting adaptive tracks and stretches to the measured content box", () => {
    const result = getGridLayout(DEFAULT_APPEARANCE, 1600);
    expect(result).toMatchObject({ columns: 9, minCardWidth: 160, gap: 12, cardHeight: 140 });
    expect(result.cardWidth).toBeCloseTo((1600 - 8 * 12) / 9);
    expect(result.cardWidth * result.columns + result.gap * (result.columns - 1)).toBeCloseTo(1600);
  });

  it("honors requested columns while capping them to the readable width", () => {
    const appearance = { ...DEFAULT_APPEARANCE, cardLayout: "columns" as const, cardColumns: 6 };
    const wide = getGridLayout(appearance, 1600);
    expect(wide.columns).toBe(6);
    expect(wide.cardWidth).toBeCloseTo((1600 - 5 * 12) / 6);
    const narrow = getGridLayout(appearance, 500);
    expect(narrow.columns).toBe(3);
    expect(narrow.cardWidth).toBeCloseTo((500 - 24) / 3);
    expect(narrow.cardWidth).toBeGreaterThanOrEqual(narrow.minCardWidth);
    expect(appearance.cardColumns).toBe(6);
  });

  it("computes square height from the stretched width rather than saved minimum", () => {
    const appearance = { ...DEFAULT_APPEARANCE, cardShape: "square" as const,
      cardLayout: "columns" as const, cardColumns: 3, cardHeight: 235 };
    const result = getGridLayout(appearance, 1000);
    expect(result.columns).toBe(3);
    expect(result.cardHeight).toBe(result.cardWidth);
    expect(result.cardWidth).toBeCloseTo((1000 - 24) / 3);
    expect(result.cardHeight).not.toBe(appearance.cardWidth);
    expect(appearance.cardHeight).toBe(235);
  });

  it.each([75, 100, 125, 150])("caps columns after applying interface scale %s exactly once", (interfaceScale) => {
    const appearance = { ...DEFAULT_APPEARANCE, interfaceScale, cardLayout: "columns" as const, cardColumns: 12 };
    const result = getGridLayout(appearance, 1000);
    const ratio = interfaceScale / 100;
    expect(result.minCardWidth).toBe(156 * ratio + 2);
    expect(result.cardHeight).toBe(140 * ratio);
    expect(result.gap).toBe(12 * ratio);
    expect(result.cardWidth).toBeGreaterThanOrEqual(result.minCardWidth);
    expect(result.cardWidth * result.columns + result.gap * (result.columns - 1)).toBeCloseTo(1000);
    expect((result.columns + 1) * result.minCardWidth + result.columns * result.gap).toBeGreaterThan(1000);
  });

  it("uses the current measured width without subtracting panel or content limits twice", () => {
    const appearance = { ...DEFAULT_APPEARANCE, interfaceScale: 125,
      settingsPresentation: "push" as const, contentWidthMode: "fixed" as const,
      contentWidth: 960, pagePadding: 80 };
    const result = getGridLayout(appearance, 1500);
    expect(result).toEqual(getGridLayout({ ...appearance, settingsPresentation: "overlay",
      contentWidthMode: "full", contentWidth: 3840, pagePadding: 12 }, 1500));
    expect(result.cardWidth * result.columns + result.gap * (result.columns - 1)).toBeCloseTo(1500);
  });

  it("keeps a mathematically exact column boundary at fractional interface scales", () => {
    const appearance = { ...DEFAULT_APPEARANCE, interfaceScale: 75.1, cardWidth: 132, gap: 4 };
    const scale = appearance.interfaceScale / 100;
    const exactWidth = getMinimumCardWidth(appearance) * 2 + 4 * scale;
    expect(getGridLayout(appearance, exactWidth).columns).toBe(2);
    expect(getGridLayout(appearance, exactWidth - .001).columns).toBe(1);
  });

  it("uses the content-safe minimum without destroying the saved adaptive width", () => {
    const appearance = { ...DEFAULT_APPEARANCE, cardWidth: 400, cardLayout: "columns" as const, cardColumns: 6 };
    const result = getGridLayout(appearance, 1000);
    expect(result.columns).toBe(5);
    expect(result.minCardWidth).toBe(158);
    expect(result.cardWidth).toBeCloseTo((1000 - 48) / 5);
    expect(getGridLayout({ ...appearance, cardLayout: "adaptive" }, 1000).columns).toBe(2);
    expect(appearance.cardWidth).toBe(400);
  });

  it("fits the actual topline across icon, control, padding and scale combinations", () => {
    for (const interfaceScale of [75, 100, 125, 150]) {
      for (const siteIconSize of [24, 38, 64]) {
        for (const controlScale of [80, 100, 130]) {
          for (const cardPadding of [6, 12, 28]) {
            for (const cardLayout of ["adaptive", "columns"] as const) {
              const appearance = { ...DEFAULT_APPEARANCE, interfaceScale, siteIconSize,
                controlScale, cardPadding, cardLayout, cardColumns: 12, cardWidth: 132 };
              const scale = interfaceScale / 100;
              const requiredContentWidth = (siteIconSize + 12 + 3 * 26 * controlScale / 100 +
                2 * 2 + 2 * cardPadding) * scale + 2;
              const safeWidth = getMinimumCardWidth(appearance);
              expect(safeWidth).toBeGreaterThanOrEqual(requiredContentWidth);
              expect(safeWidth).toBeGreaterThanOrEqual(132 * scale);
              for (const availableWidth of [900, 1300, 2000]) {
                const layout = getGridLayout(appearance, availableWidth);
                expect(layout.cardWidth).toBeGreaterThanOrEqual(safeWidth);
                expect(layout.cardWidth * layout.columns + layout.gap * (layout.columns - 1)).toBeCloseTo(availableWidth);
              }
            }
          }
        }
      }
    }
  });

  it("keeps the standard square minimum at 158px and free height independent of text size", () => {
    expect(getMinimumCardWidth({ ...DEFAULT_APPEARANCE, cardShape: "square" })).toBe(158);
    const appearance = { ...DEFAULT_APPEARANCE, cardLayout: "columns" as const,
      cardColumns: 12, fontScale: 130, cardFontScale: 140 };
    const free = getGridLayout(appearance, 1300);
    expect(free.minCardWidth).toBe(158);
    expect(free.cardHeight).toBe(140);
    const square = getGridLayout({ ...appearance, cardShape: "square" }, 1300);
    expect(square.minCardWidth).toBeCloseTo(215.765);
    expect(square.columns).toBeLessThan(free.columns);
    expect(square.cardHeight).toBe(square.cardWidth);
    expect(square.cardHeight).toBeGreaterThanOrEqual(square.minCardWidth);
  });

  it("reserves the heat count and footer at maximum text and geometry preferences", () => {
    const appearance = { ...DEFAULT_APPEARANCE, cardShape: "square" as const,
      cardLayout: "columns" as const, cardColumns: 12, interfaceScale: 150,
      fontScale: 130, cardFontScale: 140, siteIconSize: 64, controlScale: 130, cardPadding: 28 };
    expect(getMinimumCardWidth(appearance)).toBeCloseTo(409.6475);
    expect(getMinimumCardWidth({ ...appearance, cardShape: "free" })).toBeCloseTo(358.1);
    const layout = getGridLayout(appearance, 900);
    expect(layout).toMatchObject({ columns: 2, cardWidth: 441, cardHeight: 441 });
    expect(layout.cardHeight).toBeGreaterThanOrEqual(409.6475);
  });

  it("reserves a large footer icon and the opening arrow even at small text sizes", () => {
    expect(getMinimumCardWidth({ ...DEFAULT_APPEARANCE, cardShape: "square", groupIconSize: 28 }))
      .toBeCloseTo(167.75);
    const appearance = { ...DEFAULT_APPEARANCE, cardShape: "square" as const,
      cardLayout: "columns" as const, cardColumns: 12, siteIconSize: 24, controlScale: 80,
      cardPadding: 28, fontScale: 70, cardFontScale: 80, groupIconSize: 28, interfaceScale: 75 };
    const requiredHeight = (24 + 18 + 18 * .56 + 13.75 * .56 + 28 + 23 + 56) * .75 + 2;
    const layout = getGridLayout(appearance, requiredHeight * 2 + 9);
    expect(layout.cardHeight).toBeGreaterThanOrEqual(requiredHeight);
    expect(layout.cardHeight).toBe(layout.cardWidth);
  });

  it.each([75, 100, 125, 150])("fits square contents at all text sizes with interface scale %s", (interfaceScale) => {
    for (const fontScale of [70, 100, 130]) {
      for (const cardFontScale of [80, 100, 140]) {
        const appearance = { ...DEFAULT_APPEARANCE, interfaceScale, fontScale, cardFontScale,
          cardLayout: "columns" as const, cardShape: "square" as const, cardColumns: 12 };
        const scale = interfaceScale / 100;
        const fontRatio = fontScale / 100 * cardFontScale / 100;
        const contentHeight = (38 + Math.max(14 * 1.5 * fontRatio, 18) + 12 * 1.5 * fontRatio +
          11 * 1.25 * fontRatio + Math.max(12 * 1.5 * fontRatio, 16) + 7 + 5 + 4 + 5 + 2 + 24) * scale + 2;
        const layout = getGridLayout(appearance, 1300);
        expect(layout.cardHeight).toBeGreaterThanOrEqual(contentHeight);
        expect(layout.cardWidth).toBe(layout.cardHeight);
        expect(layout.cardWidth).toBeGreaterThanOrEqual(getMinimumCardWidth(appearance));
      }
    }
  });

  it("publishes matching base font sizes and once-scaled action/spacing CSS values", () => {
    const variables = cardLayoutVariables({ ...DEFAULT_APPEARANCE, interfaceScale: 150, controlScale: 130 });
    expect(Number.parseFloat(variables["--card-action-size"])).toBeCloseTo(50.7);
    expect(variables).toMatchObject({
      "--card-actions-gap": "3px", "--card-topline-gap": "18px",
      "--card-border-width": "1px", "--card-name-size": "14px", "--card-domain-size": "12px",
      "--card-open-arrow-size": "27px",
      "--card-detail-size": "11px", "--card-footer-size": "12px", "--card-text-line-height": "1.5",
      "--card-detail-line-height": "1.25", "--card-content-top": "10.5px", "--card-content-bottom": "7.5px",
      "--card-domain-gap": "6px", "--card-detail-gap": "7.5px", "--card-footer-gap": "3px",
    });
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])("keeps hidden or unavailable width %s finite", (width) => {
    const result = getGridLayout({ ...DEFAULT_APPEARANCE, cardShape: "square" }, width);
    expect(result.columns).toBe(1);
    expect(result.cardWidth).toBe(0);
    expect(result.cardHeight).toBe(0);
  });

  it("shrinks a single track to the available width when even one minimum cannot fit", () => {
    const result = getGridLayout({ ...DEFAULT_APPEARANCE, interfaceScale: 150, cardShape: "square" }, 100);
    expect(result).toMatchObject({ columns: 1, cardWidth: 100, cardHeight: 100, minCardWidth: 240, gap: 18 });
  });
});
