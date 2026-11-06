import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../../data/defaults";
import type { BrowserBookmarkTreeNode } from "../../lib/browser-runtime";
import { getWorkspaceGroups } from "../../lib/github-workspace";
import type { LoadedState } from "../../lib/storage";
import type { SiteCollectionState } from "../../types";
import { useBookmarkSession } from "./use-bookmark-session";

const a: BrowserBookmarkTreeNode = { id: "a", title: "Needle", url: "https://fixture.invalid/A?Case=Keep#Part" };
const b: BrowserBookmarkTreeNode = { id: "b", title: "Second", url: "https://fixture.invalid/B" };
const deep: BrowserBookmarkTreeNode = { id: "deep", title: "Deep", children: [b] };
const folder: BrowserBookmarkTreeNode = { id: "team", title: "Team", children: [a, deep] };
const loose: BrowserBookmarkTreeNode = { id: "loose", title: "Loose", url: "https://fixture.invalid/loose" };
const bar: BrowserBookmarkTreeNode = { id: "bar", title: "Bookmarks", children: [folder, loose] };
const tree: BrowserBookmarkTreeNode[] = [{ id: "root", title: "", children: [bar] }];

function setup(options: { withoutApi?: boolean; withoutState?: boolean } = {}) {
  let persisted = createDefaultState();
  const initial = persisted;
  const loadState = vi.fn(async (): Promise<LoadedState> => ({ state: persisted, recovered: false }));
  const save = vi.fn(async (next: SiteCollectionState): Promise<void> => { persisted = next; });
  const getTree = vi.fn(async () => tree);
  const remove = vi.fn(async (_id: string): Promise<void> => undefined);
  const removeTree = vi.fn(async (_id: string): Promise<void> => undefined);
  const setBusy = vi.fn();
  const setNotice = vi.fn();
  const hook = renderHook(() => {
    const [state, setState] = useState<SiteCollectionState | null>(options.withoutState ? null : initial);
    return useBookmarkSession({
      bookmarks: options.withoutApi ? undefined : { getTree, remove, removeTree },
      state,
      mainGroups: state ? getWorkspaceGroups(state.groups, "main") : [],
      loadState,
      saveNextState: async next => { await save(next); setState(next); },
      setBusy,
      setNotice,
    });
  });
  act(() => hook.result.current.initializeBookmarks(tree, getWorkspaceGroups(initial.groups, "main")));
  return {
    ...hook, initial, loadState, save, getTree, remove, removeTree, setBusy, setNotice,
    persisted: () => persisted,
    replacePersisted: (next: SiteCollectionState) => { persisted = next; },
  };
}

afterEach(cleanup);

describe("popup bookmark session", () => {
  it("initializes flattened roots without reads and retains a valid destination across explicit initialization", () => {
    const h = setup();
    expect(h.result.current.visibleBookmarkTiles).toEqual([bar]);
    expect(h.result.current.bookmarkPathNodes).toEqual([]);
    expect(h.result.current.bookmarkGroupId).toBe(getWorkspaceGroups(h.initial.groups, "main").find(group => !group.isProtected)?.id);
    expect(h.getTree).not.toHaveBeenCalled();
    expect(h.loadState).not.toHaveBeenCalled();
    const selected = getWorkspaceGroups(h.initial.groups, "main").at(-1)!;
    act(() => h.result.current.setBookmarkGroupId(selected.id));
    act(() => h.result.current.initializeBookmarks(tree, getWorkspaceGroups(h.initial.groups, "main")));
    expect(h.result.current.bookmarkGroupId).toBe(selected.id);
    const protectedOnly = [{ ...selected, id: "only", isProtected: true }];
    act(() => h.result.current.initializeBookmarks([{ id: "standalone", title: "Standalone", url: loose.url }], protectedOnly));
    expect(h.result.current.visibleBookmarkTiles.map(node => node.id)).toEqual(["standalone"]);
    expect(h.result.current.bookmarkGroupId).toBe("only");
    act(() => h.result.current.initializeBookmarks([], []));
    expect(h.result.current.bookmarkGroupId).toBe("");
  });

  it("navigates multiple folder levels and keeps ordinary selection when returning to a parent", () => {
    const h = setup();
    act(() => h.result.current.openBookmarkFolder(deep));
    expect(h.result.current.bookmarkPathNodes.map(node => node.id)).toEqual(["bar", "team", "deep"]);
    expect(h.result.current.visibleBookmarkTiles).toEqual([b]);
    act(() => h.result.current.toggleBookmarkSelection(b));
    act(() => h.result.current.backBookmarkFolder());
    expect(h.result.current.currentBookmarkFolder?.id).toBe("team");
    expect([...h.result.current.selectedIds]).toEqual(["b"]);
    act(() => h.result.current.backBookmarkFolder());
    act(() => h.result.current.backBookmarkFolder());
    expect(h.result.current.bookmarkPathNodes).toEqual([]);
    expect(h.result.current.visibleBookmarkTiles).toEqual([bar]);
  });

  it("applies only the supplied initialization result and preserves existing query and selection", () => {
    const h = setup();
    act(() => h.result.current.changeBookmarkQuery("Needle"));
    act(() => h.result.current.toggleVisibleBookmarks());
    const initialize = h.result.current.initializeBookmarks;
    act(() => initialize([{ id: "replacement-root", title: "", children: [
      { id: "replacement", title: "Needle replacement", url: loose.url },
    ] }], getWorkspaceGroups(h.initial.groups, "main")));
    expect(h.result.current.initializeBookmarks).toBe(initialize);
    expect(h.result.current.bookmarkQuery).toBe("Needle");
    expect([...h.result.current.selectedIds]).toEqual(["a"]);
    expect(h.result.current.selectedBookmarkCount).toBe(0);
    expect(h.result.current.visibleBookmarkTiles.map(node => node.id)).toEqual(["replacement"]);
    expect(h.getTree).not.toHaveBeenCalled();
  });

  it("shows filtered site cards without unmatched ancestors and selects only matching site ids", () => {
    const h = setup();
    act(() => h.result.current.toggleBookmarkSelection(folder));
    expect([...h.result.current.selectedIds]).toEqual(["a", "b"]);
    act(() => h.result.current.changeBookmarkQuery("  needle  "));
    expect(h.result.current.bookmarkPathNodes).toEqual([]);
    expect(h.result.current.selectedIds.size).toBe(0);
    expect(h.result.current.visibleBookmarkTiles.map(node => node.id)).toEqual(["a"]);
    expect([...h.result.current.visibleIds]).toEqual(["a"]);
    act(() => h.result.current.toggleBookmarkSelection(h.result.current.visibleBookmarkTiles[0]));
    expect([...h.result.current.selectedIds]).toEqual(["a"]);
    expect(h.result.current.selectedBookmarkCount).toBe(1);
    expect(h.result.current.allVisibleSelected).toBe(true);
  });

  it("selects descendant sites for a matched folder and clears search selection when opening it", () => {
    const h = setup();
    act(() => h.result.current.changeBookmarkQuery("Team"));
    expect(h.result.current.visibleBookmarkTiles.map(node => node.id)).toEqual(["team"]);
    act(() => h.result.current.toggleBookmarkSelection(h.result.current.visibleBookmarkTiles[0]));
    expect([...h.result.current.selectedIds]).toEqual(["a", "b"]);
    expect(h.result.current.selectedBookmarkCount).toBe(2);
    act(() => h.result.current.openBookmarkFolder(h.result.current.visibleBookmarkTiles[0]));
    expect(h.result.current.bookmarkQuery).toBe("");
    expect(h.result.current.selectedIds.size).toBe(0);
    expect(h.result.current.bookmarkPathNodes.map(node => node.id)).toEqual(["bar", "team"]);
  });

  it("toggles visible links without losing hidden selections", () => {
    const h = setup();
    act(() => h.result.current.openBookmarkFolder(bar));
    act(() => h.result.current.toggleBookmarkSelection(loose));
    act(() => h.result.current.openBookmarkFolder(folder));
    act(() => h.result.current.toggleVisibleBookmarks());
    expect([...h.result.current.selectedIds]).toEqual(["loose", "a", "b"]);
    expect(h.result.current.selectedBookmarkCount).toBe(3);
    expect(h.result.current.allVisibleSelected).toBe(true);
    act(() => h.result.current.toggleVisibleBookmarks());
    expect([...h.result.current.selectedIds]).toEqual(["loose"]);
    expect(h.result.current.allVisibleSelected).toBe(false);
  });

  it("refreshes through the existing api, resets path and selection, and preserves query without busy changes", async () => {
    const h = setup();
    act(() => h.result.current.changeBookmarkQuery("needle"));
    act(() => h.result.current.toggleVisibleBookmarks());
    h.getTree.mockResolvedValue([{ id: "new-root", title: "Needle new", url: loose.url }]);
    await act(async () => h.result.current.refreshBookmarks());
    expect(h.getTree).toHaveBeenCalledTimes(1);
    expect(h.result.current.bookmarkPathNodes).toEqual([]);
    expect(h.result.current.selectedIds.size).toBe(0);
    expect(h.result.current.bookmarkQuery).toBe("needle");
    expect(h.result.current.visibleBookmarkTiles.map(node => node.id)).toEqual(["new-root"]);
    expect(h.setBusy).not.toHaveBeenCalled();
    expect(h.setNotice).toHaveBeenLastCalledWith({ kind: "success", text: "浏览器书签已更新。" });
  });

  it("preserves existing tree, folder and selection when refreshing fails", async () => {
    const h = setup();
    act(() => h.result.current.openBookmarkFolder(folder));
    act(() => h.result.current.toggleBookmarkSelection(a));
    h.getTree.mockRejectedValue(new Error("read failed"));
    await act(async () => h.result.current.refreshBookmarks());
    expect(h.result.current.currentBookmarkFolder?.id).toBe("team");
    expect(h.result.current.visibleBookmarkTiles).toEqual([a, deep]);
    expect([...h.result.current.selectedIds]).toEqual(["a"]);
    expect(h.setNotice).toHaveBeenLastCalledWith({ kind: "error", text: "书签读取失败，请重试。" });
  });

  it("imports against a fresh collection and a fresh main workspace destination with one save", async () => {
    const h = setup();
    const fresh = { ...h.initial, groups: [...h.initial.groups, { ...h.initial.groups[0], id: "fresh", name: "Fresh", workspace: "main" as const, isProtected: false }], appearance: { ...h.initial.appearance, fontScale: 115 } };
    h.replacePersisted(fresh);
    act(() => h.result.current.setBookmarkGroupId("fresh"));
    act(() => h.result.current.toggleBookmarkSelection(loose));
    await act(async () => h.result.current.handleImportBookmarks());
    expect(h.loadState).toHaveBeenCalledTimes(1);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.persisted().sites.find(site => site.url === loose.url)?.groupId).toBe("fresh");
    expect(h.persisted().appearance.fontScale).toBe(115);
    expect(h.persisted().groups).toEqual(fresh.groups);
    expect(h.result.current.bookmarkGroupId).toBe("fresh");
    expect(h.result.current.selectedIds.size).toBe(0);
    expect(h.setBusy.mock.calls).toEqual([[true], [false]]);
    expect(h.setNotice).toHaveBeenLastCalledWith({ kind: "success", text: "新增 1 个，跳过 0 个，失败 0 个。" });
  });

  it("keeps selection for retargeting when a destination disappears and reports mixed import counts", async () => {
    const h = setup();
    const existing = h.initial.sites[0];
    const mixed: BrowserBookmarkTreeNode[] = [{ id: "root", title: "", children: [{ id: "bar", title: "Bookmarks", children: [loose,
      { id: "dup", title: "Existing", url: existing.url },
      { id: "bad", title: "Bad", url: "chrome://settings" },
    ] }] }];
    act(() => h.result.current.initializeBookmarks(mixed, getWorkspaceGroups(h.initial.groups, "main")));
    act(() => h.result.current.setBookmarkGroupId("deleted"));
    act(() => h.result.current.toggleVisibleBookmarks());
    await act(async () => h.result.current.handleImportBookmarks());
    expect(h.save).not.toHaveBeenCalled();
    expect(h.result.current.selectedBookmarkCount).toBe(3);
    expect(h.result.current.bookmarkGroupId).toBe("");
    expect(h.setNotice).toHaveBeenLastCalledWith({ kind: "error", text: "目标分组已变更，请重新选择后导入。" });
    act(() => h.result.current.setBookmarkGroupId("design"));
    await act(async () => h.result.current.handleImportBookmarks());
    expect(h.persisted().sites.find(site => site.url === loose.url)?.groupId).toBe("design");
    expect(h.persisted().sites.filter(site => site.url === existing.url)).toHaveLength(1);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.setNotice).toHaveBeenLastCalledWith({ kind: "error", text: "新增 1 个，跳过 1 个，失败 1 个。" });
  });

  it("retains selection and visible collection on a failed save and retries without duplicate groups or sites", async () => {
    const h = setup();
    h.save.mockRejectedValueOnce(new Error("quota"));
    act(() => h.result.current.toggleBookmarkSelection(folder));
    await act(async () => h.result.current.handleImportBookmarks());
    expect(h.persisted()).toBe(h.initial);
    expect([...h.result.current.selectedIds]).toEqual(["a", "b"]);
    expect(h.setNotice).toHaveBeenLastCalledWith({ kind: "error", text: "导入失败，主页收藏没有被修改。" });
    await act(async () => h.result.current.handleImportBookmarks());
    expect(h.loadState).toHaveBeenCalledTimes(2);
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(h.persisted().groups).toEqual(h.initial.groups);
    expect(h.persisted().sites.filter(site => site.url === a.url)).toHaveLength(1);
    expect(h.persisted().sites.filter(site => site.url === b.url)).toHaveLength(1);
    expect(h.result.current.selectedIds.size).toBe(0);
    act(() => h.result.current.toggleBookmarkSelection(folder));
    await act(async () => h.result.current.handleImportBookmarks());
    expect(h.setNotice).toHaveBeenLastCalledWith({ kind: "success", text: "新增 0 个，跳过 2 个，失败 0 个。" });
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.removeTree).not.toHaveBeenCalled();
    expect(h.persisted().groups).toEqual(h.initial.groups);
  });

  it.each(["rejected", "recovered"] as const)("does not save or clear selection after a %s latest collection read", async failure => {
    const h = setup();
    act(() => h.result.current.toggleBookmarkSelection(loose));
    if (failure === "rejected") h.loadState.mockRejectedValue(new Error("read failed"));
    else h.loadState.mockResolvedValue({ state: h.initial, recovered: true });
    await act(async () => h.result.current.handleImportBookmarks());
    expect(h.save).not.toHaveBeenCalled();
    expect([...h.result.current.selectedIds]).toEqual(["loose"]);
    expect(h.setBusy.mock.calls).toEqual([[true], [false]]);
    expect(h.setNotice).toHaveBeenLastCalledWith({ kind: "error", text: "导入失败，主页收藏没有被修改。" });
  });

  it("returns to the browsed folder after clearing search and follows a chosen ancestor", () => {
    const h = setup();
    act(() => h.result.current.openBookmarkFolder(deep));
    act(() => h.result.current.changeBookmarkQuery("Needle"));
    expect(h.result.current.visibleBookmarkTiles.map(node => node.id)).toEqual(["a"]);
    act(() => h.result.current.changeBookmarkQuery(""));
    expect(h.result.current.currentBookmarkFolder?.id).toBe("deep");
    expect(h.result.current.visibleBookmarkTiles).toEqual([b]);
    act(() => h.result.current.goToBookmarkAncestor(1));
    expect(h.result.current.currentBookmarkFolder?.id).toBe("bar");
    expect(h.result.current.visibleBookmarkTiles).toEqual([folder, loose]);
  });

  it("does not perform initial reads and keeps missing-api or missing-collection paths harmless", async () => {
    const h = setup({ withoutApi: true, withoutState: true });
    act(() => h.result.current.toggleBookmarkSelection(loose));
    await act(async () => h.result.current.handleImportBookmarks());
    expect(h.getTree).not.toHaveBeenCalled();
    expect(h.loadState).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.setBusy).not.toHaveBeenCalled();
    await act(async () => h.result.current.refreshBookmarks());
    expect(h.getTree).not.toHaveBeenCalled();
    expect(h.result.current.selectedIds.size).toBe(0);
  });
});
