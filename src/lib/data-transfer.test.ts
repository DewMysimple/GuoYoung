import { describe, expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import {
  createGroupExportPayload,
  createExportPayload,
  parseGroupImportFile,
  parseImportFile,
  serializeGroupExport,
  serializeExport,
  SITE_HUB_GROUP_EXPORT_FORMAT,
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

  it("exports only the selected group as a portable resource package", () => {
    const state = createDefaultState();
    state.searchHistory = [
      { query: "private", searchedAt: "2026-07-29T00:00:00.000Z" },
    ];
    state.deletedSites = [
      {
        site: { ...state.sites[0] },
        deletedAt: "2026-07-29T00:00:00.000Z",
        originalGroupId: "search",
        originalGroupName: "搜索",
      },
    ];

    const payload = createGroupExportPayload(
      state,
      "design",
      "2026-07-29T00:00:00.000Z",
    );
    expect(payload).toMatchObject({
      format: SITE_HUB_GROUP_EXPORT_FORMAT,
      exportVersion: 1,
      exportedAt: "2026-07-29T00:00:00.000Z",
      group: { name: "设计", icon: "pen-nib" },
    });
    expect(payload.sites.map((site) => site.name)).toEqual(["Figma", "Dribbble"]);
    expect(JSON.stringify(payload)).not.toContain('"id"');
    expect(JSON.stringify(payload)).not.toContain("private");
    const parsed = parseGroupImportFile(serializeGroupExport(state, "design"));
    expect(parsed).toMatchObject({
      format: SITE_HUB_GROUP_EXPORT_FORMAT,
      group: { name: "设计", icon: "pen-nib" },
    });
    expect(parsed.sites[0]).toMatchObject({
      name: "Figma",
      url: "https://www.figma.com",
    });
  });

  it("rejects a full export when a group resource package is expected", () => {
    expect(() => parseGroupImportFile(serializeExport(createDefaultState()))).toThrow(
      "分组资源包",
    );
  });

  it("normalizes group package URLs and rejects invalid entries", () => {
    const state = createDefaultState();
    const payload = createGroupExportPayload(state, "design");
    const parsed = parseGroupImportFile(
      JSON.stringify({
        ...payload,
        sites: [{ name: "Example", url: "example.com/", order: 22 }],
      }),
    );
    expect(parsed.sites[0]).toMatchObject({
      name: "Example",
      url: "https://example.com",
      order: 0,
    });
    expect(() =>
      parseGroupImportFile(
        JSON.stringify({
          ...payload,
          sites: [{ name: "Bad", url: "javascript:alert(1)" }],
        }),
      ),
    ).toThrow("地址无效");
  });
});
