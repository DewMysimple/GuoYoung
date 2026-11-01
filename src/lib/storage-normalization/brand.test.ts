import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND } from "../../data/defaults";
import { normalizeBrand as normalizeStoredBrand } from "../storage";
import { normalizeBrand } from "./brand";

describe("brand storage normalization boundary", () => {
  it("keeps the existing storage export bound to the unique pure implementation", () => {
    expect(normalizeStoredBrand).toBe(normalizeBrand);
  });

  it("normalizes a frozen caller value without sharing it or replacing explicit false", () => {
    const input = Object.freeze({ name: `  ${"名".repeat(40)}  `,
      tabTitle: ` ${"t".repeat(90)} `, showName: false, showLogo: false,
      logoSource: "url", logoUrl: "https://Example.test:443/logo.svg#mark",
      logoDataUrl: "data:image/webp;base64,AAAA", logoShape: "rectangle" });
    const result = normalizeBrand(input);
    expect(result).toEqual({ name: "名".repeat(32), tabTitle: "t".repeat(80),
      showName: false, showLogo: false, logoSource: "url",
      logoUrl: input.logoUrl, logoShape: "rectangle" });
    expect(result).not.toBe(input);
    expect(normalizeBrand(result)).toEqual(result);
    expect(input.logoDataUrl).toBe("data:image/webp;base64,AAAA");
  });

  it("retains only the valid resource for the selected source", () => {
    expect(normalizeBrand({ logoSource: "local", logoDataUrl: "data:image/webp;base64,AAAA",
      logoUrl: "https://unused.test/logo.png" })).toEqual({ ...DEFAULT_BRAND,
      logoSource: "local", logoDataUrl: "data:image/webp;base64,AAAA" });
    expect(normalizeBrand({ logoSource: "local", logoDataUrl: "data:image/png;base64,AAAA",
      logoUrl: "https://unused.test/logo.png" })).toEqual(DEFAULT_BRAND);
    expect(normalizeBrand({ logoSource: "url", logoUrl: "javascript:alert(1)",
      logoDataUrl: "data:image/webp;base64,AAAA" })).toEqual(DEFAULT_BRAND);
  });

  it("preserves observable getter errors at the old public boundary", () => {
    const failure = new Error("synthetic field read failure");
    const input = { get name(): string { throw failure; } };
    for (const normalize of [normalizeBrand, normalizeStoredBrand]) {
      expect(() => normalize(input)).toThrow(failure);
    }
  });
});
