import { describe, expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import {
  createExportPayload,
  parseImportFile,
  serializeExport,
  SITE_HUB_EXPORT_FORMAT,
} from "./data-transfer";

describe("data transfer", () => {
  it("exports a versioned envelope and restores the state", () => {
    const state = createDefaultState();
    const payload = createExportPayload(state, "2026-07-29T00:00:00.000Z");

    expect(payload).toMatchObject({
      format: SITE_HUB_EXPORT_FORMAT,
      exportVersion: 1,
      exportedAt: "2026-07-29T00:00:00.000Z",
    });
    expect(parseImportFile(serializeExport(state))).toEqual(state);
  });

  it("accepts direct legacy state files through the existing migrations", () => {
    const state = createDefaultState();

    expect(parseImportFile(JSON.stringify(state))).toEqual(state);
  });

  it("rejects malformed or unsupported files", () => {
    expect(() => parseImportFile("{broken")).toThrow("有效的 JSON");
    expect(() =>
      parseImportFile(
        JSON.stringify({
          format: SITE_HUB_EXPORT_FORMAT,
          exportVersion: 99,
          state: createDefaultState(),
        }),
      ),
    ).toThrow("版本不受支持");
    expect(() => parseImportFile(JSON.stringify({ hello: "world" }))).toThrow(
      "数据结构无效",
    );
  });

  it("keeps search history and local wallpaper files out of exports", () => {
    const state = createDefaultState();
    state.searchHistory = [
      { query: "private query", searchedAt: "2026-07-29T00:00:00.000Z" },
    ];
    state.wallpaper = {
      ...state.wallpaper,
      source: "local",
      localAssetId: "local-secret",
    };

    const payload = createExportPayload(state);
    expect(payload.state.searchHistory).toEqual([]);
    expect(payload.state.wallpaper.source).toBe("none");
    expect(payload.state.wallpaper.localAssetId).toBeUndefined();
  });

  it("keeps a compressed local brand logo inside portable exports", () => {
    const state = createDefaultState();
    state.brand = {
      ...state.brand,
      logoSource: "local",
      logoDataUrl: "data:image/webp;base64,AAAA",
    };

    const restored = parseImportFile(serializeExport(state));
    expect(restored.brand).toEqual(state.brand);
  });
});
