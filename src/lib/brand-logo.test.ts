import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BRAND_LOGO_DATA_URL_LENGTH,
  isBrandLogoDataUrl,
  isHttpImageUrl,
  prepareBrandLogo,
} from "./brand-logo";

describe("brand logo validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts http image URLs and rejects unsafe protocols", () => {
    expect(isHttpImageUrl("https://example.com/logo.svg")).toBe(true);
    expect(isHttpImageUrl("http://example.com/logo.png")).toBe(true);
    expect(isHttpImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isHttpImageUrl("javascript:alert(1)")).toBe(false);
  });

  it("accepts bounded compressed WebP data and rejects oversized data", () => {
    expect(isBrandLogoDataUrl("data:image/webp;base64,AAAA")).toBe(true);
    expect(isBrandLogoDataUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(
      isBrandLogoDataUrl(
        `data:image/webp;base64,${"A".repeat(MAX_BRAND_LOGO_DATA_URL_LENGTH)}`,
      ),
    ).toBe(false);
  });

  it("compresses an uploaded logo to a portable 512px WebP", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 1024, height: 512, close }),
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["logo"], { type: "image/webp" })),
    );

    const logo = await prepareBrandLogo(
      new File(["source"], "logo.png", { type: "image/png" }),
    );

    expect(logo).toMatch(/^data:image\/webp;base64,/);
    expect(drawImage).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
