import { describe, expect, it } from "vitest";
import { isBrowserFaviconUrl } from "./browser-favicon-placeholder";

describe("browser favicon placeholder detection", () => {
  it("recognizes Chromium's internal favicon endpoint", () => {
    expect(
      isBrowserFaviconUrl(
        "chrome-extension://extension-id/_favicon/?pageUrl=https%3A%2F%2Fexample.com&size=64",
      ),
    ).toBe(true);
    expect(isBrowserFaviconUrl("https://example.com/favicon.ico")).toBe(false);
  });

  it("does not mistake similarly named web paths for the browser endpoint", () => {
    expect(
      isBrowserFaviconUrl("https://example.com/_favicon/?pageUrl=test"),
    ).toBe(false);
    expect(
      isBrowserFaviconUrl("chrome-extension://extension-id/favicon.ico"),
    ).toBe(false);
  });
});
