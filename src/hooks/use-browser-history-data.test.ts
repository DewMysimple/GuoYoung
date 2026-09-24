import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useBrowserHistoryData } from "./use-browser-history-data";
import { deleteBrowserHistoryUrl, readHistoryAvailability, searchBrowserHistory } from "../lib/browser-history";
import type { BrowserHistoryItem, BrowserPermissionChangedEvent, ChromiumExtensionApi } from "../lib/browser-runtime";

vi.mock("../lib/browser-history", async (original) => ({
  ...await original<typeof import("../lib/browser-history")>(),
  getHistoryAvailability: () => "granted",
  readHistoryAvailability: vi.fn().mockResolvedValue("granted"),
  subscribeToBrowserHistoryChanges: vi.fn(() => () => {}),
  searchBrowserHistory: vi.fn(),
  deleteBrowserHistoryUrl: vi.fn(),
}));

const options = { api: undefined, timeRange: "7d" as const, permissionVersion: 0, permissionError: null, onRequestPermission: vi.fn() };
beforeEach(() => {
  vi.mocked(readHistoryAvailability).mockReset().mockResolvedValue("granted");
  vi.mocked(searchBrowserHistory).mockReset().mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

it("ignores an older search response after the query changes", async () => {
  vi.useFakeTimers();
  let finishOld!: (items: BrowserHistoryItem[]) => void;
  vi.mocked(searchBrowserHistory).mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
    .mockResolvedValueOnce([{ id: "new", url: "https://new.test", title: "New" }]);
  const { result, rerender } = renderHook(({ query }) => useBrowserHistoryData({ ...options, query }), { initialProps: { query: "old" } });
  await act(() => vi.advanceTimersByTimeAsync(160));
  rerender({ query: "new" });
  await act(() => vi.advanceTimersByTimeAsync(160));
  expect(result.current.items.map((item) => item.id)).toEqual(["new"]);
  await act(async () => finishOld([{ id: "old", url: "https://old.test" }]));
  expect(result.current.items.map((item) => item.id)).toEqual(["new"]);
});

function permissionEvents() {
  const event = () => {
    const listeners = new Set<Parameters<BrowserPermissionChangedEvent["addListener"]>[0]>();
    return { listeners, addListener: (fn: Parameters<BrowserPermissionChangedEvent["addListener"]>[0]) => { listeners.add(fn); },
      removeListener: (fn: Parameters<BrowserPermissionChangedEvent["removeListener"]>[0]) => { listeners.delete(fn); },
      emit: (permissions = ["history"]) => { listeners.forEach(fn => fn({ permissions })); } };
  };
  const added = event(), removed = event();
  const api: ChromiumExtensionApi = { runtime: { id: "test" }, permissions: {
    contains: vi.fn(), request: vi.fn(), onAdded: added, onRemoved: removed,
  } };
  return { api, added, removed };
}

it("clears history on revocation, ignores in-flight data and recovers on regrant", async () => {
  vi.useFakeTimers();
  const events = permissionEvents();
  let finish!: (items: BrowserHistoryItem[]) => void;
  vi.mocked(searchBrowserHistory).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue([{ id: "fresh", url: "https://fresh.test" }]);
  const { result, unmount } = renderHook(() => useBrowserHistoryData({ ...options, api: events.api, query: "" }));
  await act(() => vi.advanceTimersByTimeAsync(160));
  act(() => events.removed.emit(["bookmarks"]));
  expect(result.current.availability).toBe("granted");
  act(() => events.removed.emit());
  expect(result.current.availability).toBe("permission-needed");
  expect(result.current.items).toEqual([]);
  await act(async () => finish([{ id: "stale", url: "https://stale.test" }]));
  expect(result.current.items).toEqual([]);
  await act(async () => events.added.emit());
  await act(() => vi.advanceTimersByTimeAsync(160));
  expect(result.current.availability).toBe("granted");
  expect(result.current.items.map(item => item.id)).toEqual(["fresh"]);
  unmount();
  expect(events.added.listeners.size).toBe(0);
  expect(events.removed.listeners.size).toBe(0);
});

it("does not let an older permission check undo a revocation event", async () => {
  const events = permissionEvents();
  let finish!: (value: "granted") => void;
  vi.mocked(readHistoryAvailability).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useBrowserHistoryData({ ...options, api: events.api, query: "" }));
  act(() => events.removed.emit());
  await act(async () => finish("granted"));
  expect(result.current.availability).toBe("permission-needed");
});

it("rechecks permission on focus and on retry even if permission events were missed", async () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useBrowserHistoryData({ ...options, query: "" }));
  await act(() => vi.advanceTimersByTimeAsync(160));
  vi.mocked(readHistoryAvailability).mockResolvedValue("permission-needed");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(result.current.availability).toBe("permission-needed");
  vi.mocked(readHistoryAvailability).mockResolvedValue("granted");
  await act(async () => result.current.refresh());
  expect(result.current.availability).toBe("granted");
});

it("allows a denied permission request to be retried and prevents duplicate pending requests", async () => {
  vi.mocked(readHistoryAvailability).mockResolvedValue("permission-needed");
  let finish!: (value: { granted: boolean }) => void;
  const request = vi.fn(() => new Promise<{ granted: boolean }>(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useBrowserHistoryData({ ...options, query: "", onRequestPermission: request }));
  await act(async () => {});
  let pending!: Promise<void>;
  act(() => { pending = result.current.refreshPermission(); });
  await act(async () => result.current.refreshPermission());
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ granted: false }); await pending; });
  expect(result.current.permissionLoading).toBe(false);
  expect(result.current.permissionError).toContain("未完成");
  act(() => { pending = result.current.refreshPermission(); });
  vi.mocked(readHistoryAvailability).mockResolvedValue("granted");
  await act(async () => { finish({ granted: true }); await pending; });
  expect(result.current.availability).toBe("granted");
  expect(result.current.permissionError).toBeNull();
});

it("deduplicates pending deletion and reports exactly the successful URLs", async () => {
  vi.useFakeTimers();
  vi.mocked(searchBrowserHistory).mockResolvedValue([]);
  let finishDelete!: () => void;
  vi.mocked(deleteBrowserHistoryUrl).mockImplementation((url) => url.endsWith("one")
    ? new Promise((resolve) => { finishDelete = resolve; }) : Promise.reject(new Error("failed")));
  const { result } = renderHook(() => useBrowserHistoryData({ ...options, query: "" }));
  await act(() => vi.advanceTimersByTimeAsync(160));
  let deletion!: Promise<string[]>;
  act(() => { deletion = result.current.deleteUrls(["https://site.test/one", "https://site.test/two", "https://site.test/one"]); });
  expect(await result.current.deleteUrls(["https://site.test/one"])).toEqual([]);
  expect(deleteBrowserHistoryUrl).toHaveBeenCalledTimes(2);
  await act(async () => { finishDelete(); await deletion; });
  expect(await deletion).toEqual(["https://site.test/one"]);
  expect(result.current.error).toContain("已删除 1 条，1 条删除失败");
  expect(result.current.busy).toBe(false);
});
