import { describe, expect, it, vi } from "vitest";
import type { ChromiumExtensionApi } from "./browser-runtime";
import { searchWeb } from "./browser-search";

describe("browser search", () => {
  it("uses the Chromium default provider in extension mode", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const api: ChromiumExtensionApi = {
      runtime: { id: "extension-id" },
      search: { query },
    };

    await expect(searchWeb("  TypeScript 教程  ", { api })).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith({
      text: "TypeScript 教程",
      disposition: "CURRENT_TAB",
    });
  });

  it("falls back to Google in regular web mode", async () => {
    const navigate = vi.fn();

    await searchWeb("React dnd", { api: {}, navigate });

    expect(navigate).toHaveBeenCalledWith(
      "https://www.google.com/search?q=React%20dnd",
    );
  });

  it("does nothing for an empty query", async () => {
    const navigate = vi.fn();

    await expect(searchWeb("   ", { api: {}, navigate })).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
