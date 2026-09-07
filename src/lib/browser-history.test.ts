import { describe, expect, it, vi } from "vitest";
import {
  createHistoryQuery,
  getHistoryAvailability,
  getHistoryRange,
  getHistorySiteKey,
  groupBrowserHistoryItems,
  normalizeHistoryItems,
  readHistoryAvailability,
  requestHistoryPermission,
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

  it("groups history URLs by main domain and keeps the newest site first", () => {
    expect(getHistorySiteKey("https://gist.github.com/openai/demo")).toBe(
      "github.com",
    );
    expect(getHistorySiteKey("https://chatgpt.com/c/123")).toBe("chatgpt.com");

    expect(
      groupBrowserHistoryItems([
        {
          id: "github-repo",
          title: "Repository",
          url: "https://github.com/openai/repo",
          lastVisitTime: 20,
          visitCount: 3,
        },
        {
          id: "github-gist",
          title: "Gist",
          url: "https://gist.github.com/openai/demo",
          lastVisitTime: 10,
          visitCount: 2,
        },
        {
          id: "chatgpt",
          title: "ChatGPT",
          url: "https://chatgpt.com/c/123",
          lastVisitTime: 30,
          visitCount: 4,
        },
      ]),
    ).toMatchObject([
      {
        key: "chatgpt.com",
        label: "ChatGPT",
        items: [{ id: "chatgpt" }],
        lastVisitTime: 30,
        visitCount: 4,
      },
      {
        key: "github.com",
        label: "GitHub",
        items: [{ id: "github-repo" }, { id: "github-gist" }],
        lastVisitTime: 20,
        visitCount: 5,
      },
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
      expect.any(Function),
    );

    await deleteBrowserHistoryUrl("https://example.com", api);
    await deleteBrowserHistoryRange({ startTime: 1, endTime: 2 }, api);
    await deleteAllBrowserHistory(api);
    expect(api.history!.deleteUrl).toHaveBeenCalledWith(
      { url: "https://example.com" },
      expect.any(Function),
    );
    expect(api.history!.deleteRange).toHaveBeenCalledWith(
      { startTime: 1, endTime: 2 },
      expect.any(Function),
    );
    expect(api.history!.deleteAll).toHaveBeenCalledWith(expect.any(Function));
  });

  it("supports callback-only permissions and history methods", async () => {
    let granted = false;
    const callbackItems = [
      {
        id: "callback-one",
        title: "Callback Example",
        url: "https://callback.example",
        lastVisitTime: 20,
      },
    ];
    const api = createApi({
      permissions: {
        contains: vi.fn((_details, callback) => callback?.(granted)),
        request: vi.fn((_details, callback) => {
          granted = true;
          callback?.(true);
        }),
      },
      history: {
        search: vi.fn((_query, callback) => callback?.(callbackItems)),
        deleteUrl: vi.fn((_details, callback) => callback?.()),
        deleteRange: vi.fn((_range, callback) => callback?.()),
        deleteAll: vi.fn((callback) => callback?.()),
      },
    });

    expect(await readHistoryAvailability(api)).toBe("permission-needed");
    await expect(requestHistoryPermission(api)).resolves.toEqual({
      granted: true,
    });
    expect(await readHistoryAvailability(api)).toBe("granted");
    await expect(
      searchBrowserHistory({ text: "Callback", range: "all" }, api),
    ).resolves.toEqual(callbackItems);
    await deleteBrowserHistoryUrl(callbackItems[0].url!, api);
    await deleteBrowserHistoryRange({ startTime: 1, endTime: 2 }, api);
    await deleteAllBrowserHistory(api);
    expect(api.history!.deleteUrl).toHaveBeenCalledTimes(1);
    expect(api.history!.deleteRange).toHaveBeenCalledTimes(1);
    expect(api.history!.deleteAll).toHaveBeenCalledTimes(1);
  });

  it("returns a visible error result when permission request fails", async () => {
    const result = await requestHistoryPermission(
      createApi({
        permissions: {
          contains: vi.fn().mockResolvedValue(false),
          request: vi.fn().mockRejectedValue(new Error("permission denied")),
        },
      }),
    );
    expect(result.granted).toBe(false);
    expect(result.error).toContain("permission denied");
  });
});
