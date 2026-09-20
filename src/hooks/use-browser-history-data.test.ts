import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useBrowserHistoryData } from "./use-browser-history-data";
import { deleteBrowserHistoryUrl, searchBrowserHistory } from "../lib/browser-history";
import type { BrowserHistoryItem } from "../lib/browser-runtime";

vi.mock("../lib/browser-history", async (original) => ({
  ...await original<typeof import("../lib/browser-history")>(),
  getHistoryAvailability: () => "granted",
  readHistoryAvailability: vi.fn().mockResolvedValue("granted"),
  subscribeToBrowserHistoryChanges: vi.fn(() => () => {}),
  searchBrowserHistory: vi.fn(),
  deleteBrowserHistoryUrl: vi.fn(),
}));

const options = { api: undefined, timeRange: "7d" as const, permissionVersion: 0, permissionError: null, onRequestPermission: vi.fn() };
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
