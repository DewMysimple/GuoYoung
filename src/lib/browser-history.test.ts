import { describe, expect, it, vi } from "vitest";
import {
  createHistoryQuery,
  getHistoryAvailability,
  getHistoryRange,
  normalizeHistoryItems,
  readHistoryAvailability,
  searchBrowserHistory,
  deleteBrowserHistoryRange,
  deleteBrowserHistoryUrl,
  deleteAllBrowserHistory,
} from "./browser-history";
import type { ChromiumExtensionApi } from "./browser-runtime";

function createApi(
  overrides: Partial<ChromiumExtensionApi> = {},
): ChromiumExtensionApi {
  return {
    runtime: { id: "history-test" },
    history: {
      search: vi.fn().mockResolvedValue([]),
      deleteUrl: vi.fn().mockResolvedValue(undefined),
      deleteRange: vi.fn().mockResolvedValue(undefined),
      deleteAll: vi.fn().mockResolvedValue(undefined),
    },
    permissions: {
      contains: vi.fn().mockResolvedValue(true),
      request: vi.fn().mockResolvedValue(true),
    },
    ...overrides,
  };
}

describe("browser history adapter", () => {
  it("creates explicit local-time ranges and requests all matching results", () => {
    const now = new Date("2026-08-27T10:30:00.000Z").getTime();
    const query = createHistoryQuery({ text: "  GitHub ", range: "all", now });
    expect(query).toEqual({
      text: "GitHub",
      startTime: 0,
      endTime: now,
      maxResults: 0,
    });

    const yesterday = getHistoryRange("yesterday", now);
    expect(yesterday.endTime).toBe(
      new Date("2026-08-27T00:00:00.000").getTime(),
    );
    expect(yesterday.endTime - yesterday.startTime).toBe(24 * 60 * 60 * 1000);
  });

  it("deduplicates URLs and keeps newest history items first", () => {
    expect(
      normalizeHistoryItems([
        { id: "old", url: "https://example.com", lastVisitTime: 10 },
        { id: "new", url: "https://new.example", lastVisitTime: 30 },
        { id: "duplicate", url: "https://example.com", lastVisitTime: 20 },
        { id: "missing-url", title: "No URL" },
      ]),
    ).toEqual([
      { id: "new", url: "https://new.example", lastVisitTime: 30 },
      { id: "old", url: "https://example.com", lastVisitTime: 10 },
    ]);
  });

  it("reads optional permission status and handles unsupported web mode", async () => {
    expect(getHistoryAvailability({})).toBe("unsupported");
    const api = createApi({ history: undefined });
    expect(getHistoryAvailability(api)).toBe("permission-needed");
    expect(await readHistoryAvailability(api)).toBe("granted");

    const denied = createApi({
      history: undefined,
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
        request: vi.fn().mockResolvedValue(false),
      },
    });
    expect(await readHistoryAvailability(denied)).toBe("permission-needed");
  });

  it("maps search and deletion calls to the browser history API", async () => {
    const api = createApi();
    const items = [
      { id: "one", title: "Example", url: "https://example.com", lastVisitTime: 2 },
    ];
    api.history!.search = vi.fn().mockResolvedValue(items);

    await expect(
      searchBrowserHistory({ text: "Example", range: "30d", now: 1000 }, api),
    ).resolves.toEqual(items);
    expect(api.history!.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Example", maxResults: 0 }),
    );

    await deleteBrowserHistoryUrl("https://example.com", api);
    await deleteBrowserHistoryRange({ startTime: 1, endTime: 2 }, api);
    await deleteAllBrowserHistory(api);
    expect(api.history!.deleteUrl).toHaveBeenCalledWith({
      url: "https://example.com",
    });
    expect(api.history!.deleteRange).toHaveBeenCalledWith({
      startTime: 1,
      endTime: 2,
    });
    expect(api.history!.deleteAll).toHaveBeenCalledTimes(1);
  });
});
