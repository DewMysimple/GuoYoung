import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BRAND_LOGO_DATA_URL_LENGTH,
  isBrandLogoDataUrl,
  isHttpImageUrl,
  prepareBrandLogo,
  logoCropRect,
  DEFAULT_LOGO_EDIT,
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
      new File([new Uint8Array(6 * 1024 * 1024)], "logo.png", { type: "image/png" }),
    );

    expect(logo).toMatch(/^data:image\/webp;base64,/);
    expect(drawImage).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("keeps a zoomed crop within the original image at either edge", () => {
    expect(logoCropRect(2000, 1000, { ...DEFAULT_LOGO_EDIT, shape: "square", crop: true, zoom: 2, x: 100, y: 0 }))
      .toEqual({ x: 1500, y: 0, width: 500, height: 500, ratio: 1 });
    const rect = logoCropRect(800, 1600, { ...DEFAULT_LOGO_EDIT, shape: "rectangle", crop: true, x: 0, y: 100 });
    expect(rect).toEqual({ x: 0, y: 1100, width: 800, height: 500, ratio: 1.6 });
  });
});
