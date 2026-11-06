import { useCallback, useMemo, useState } from "react";
import {
  deleteBookmarkSelection,
  filterBookmarkTree,
  getDescendantIds,
  importSelectedBookmarks,
  indexBookmarkTree,
  summarizeBookmarkDeletion,
  type BookmarkDeleteSummary,
} from "../../lib/bookmark-manager";
import type { BrowserBookmarksApi, BrowserBookmarkTreeNode } from "../../lib/browser-runtime";
import { getWorkspaceGroups } from "../../lib/github-workspace";
import { getGroupsInTreeOrder, getRootGroups } from "../../lib/group-hierarchy";
import type { SiteHubStore } from "../../lib/state-store";
import type { SiteCollectionState, SiteGroup } from "../../types";
import { getBookmarkSiteIds } from "../bookmark-tree";

interface BookmarkSessionOptions {
  bookmarks: BrowserBookmarksApi | undefined;
  state: SiteCollectionState | null;
  mainGroups: readonly SiteGroup[];
  loadState: SiteHubStore["load"];
  saveNextState: (next: SiteCollectionState) => Promise<void>;
  setBusy: (busy: boolean) => void;
  setNotice: (notice: { kind: "success" | "error"; text: string }) => void;
}

export function useBookmarkSession({
  bookmarks, state, mainGroups, loadState, saveNextState, setBusy, setNotice,
}: BookmarkSessionOptions) {
  const [bookmarkGroupId, setBookmarkGroupId] = useState("");
  const [bookmarkRoots, setBookmarkRoots] = useState<BrowserBookmarkTreeNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bookmarkPath, setBookmarkPath] = useState<string[]>([]);
  const [bookmarkQuery, setBookmarkQuery] = useState("");
  const [deleteSummary, setDeleteSummary] = useState<BookmarkDeleteSummary | null>(null);

  // The assembly calls this only after its allSettled generation is still active.
  // It performs no reads and preserves the existing query/selection on reload.
  const initializeBookmarks = useCallback((tree: BrowserBookmarkTreeNode[], groups: SiteGroup[]) => {
    setBookmarkGroupId((current) => groups.some((group) => group.id === current)
      ? current
      : (groups.find((group) => !group.isProtected) ?? groups[0])?.id ?? "");
    const roots = tree.flatMap((root) => root.children ?? [root]);
    setBookmarkRoots(roots);
    setBookmarkPath([]);
  }, []);

  const defaultBookmarkGroup = mainGroups.find((group) => !group.isProtected) ?? mainGroups[0];
  const folderIcons = useMemo(() => new Map(getRootGroups(mainGroups).map((group) => [
    group.name.trim().toLocaleLowerCase("zh-CN"), group.icon,
  ] as const)), [mainGroups]);

  async function reloadBookmarks() {
    if (!bookmarks) return;
    const tree = await bookmarks.getTree();
    const roots = tree.flatMap((root) => root.children ?? [root]);
    setBookmarkRoots(roots);
    setBookmarkPath([]);
  }

  const visibleBookmarkRoots = useMemo(
    () => filterBookmarkTree(bookmarkRoots, bookmarkQuery),
    [bookmarkQuery, bookmarkRoots],
  );
  const bookmarkIndex = useMemo(() => indexBookmarkTree(bookmarkRoots), [bookmarkRoots]);
  const bookmarkPathNodes = useMemo(
    () => bookmarkPath.flatMap((id) => {
      const node = bookmarkIndex.get(id)?.node;
      return node && !node.url ? [node] : [];
    }),
    [bookmarkIndex, bookmarkPath],
  );
  const currentBookmarkFolder = bookmarkPathNodes.at(-1);
  const currentBookmarkNodes = currentBookmarkFolder?.children ?? bookmarkRoots;
  const visibleBookmarkTiles = useMemo(() => {
    if (!bookmarkQuery.trim()) return currentBookmarkNodes;
    const matching: BrowserBookmarkTreeNode[] = [];
    const collectMatches = (nodes: BrowserBookmarkTreeNode[]) => {
      for (const node of nodes) {
        const isMatch = [node.title, node.url ?? ""].some((value) =>
          value.toLocaleLowerCase("zh-CN").includes(bookmarkQuery.trim().toLocaleLowerCase("zh-CN")),
        );
        if (isMatch) matching.push(node);
        else collectMatches(node.children ?? []);
      }
    };
    collectMatches(visibleBookmarkRoots);
    return matching;
  }, [bookmarkQuery, currentBookmarkNodes, visibleBookmarkRoots]);
  const visibleIds = useMemo(
    () => new Set(visibleBookmarkTiles.flatMap((node) =>
      bookmarkQuery.trim() ? getBookmarkSiteIds(node) : getDescendantIds(node),
    )),
    [bookmarkQuery, visibleBookmarkTiles],
  );
  const selectedBookmarkCount = [...selectedIds].filter((id) => Boolean(bookmarkIndex.get(id)?.node.url)).length;

  function toggleBookmarkSelection(node: BrowserBookmarkTreeNode) {
    const ids = bookmarkQuery.trim() ? getBookmarkSiteIds(node) : getDescendantIds(node);
    setSelectedIds((current) => {
      const next = new Set(current);
      const shouldSelect = ids.some((id) => !next.has(id));
      ids.forEach((id) => (shouldSelect ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function openBookmarkFolder(node: BrowserBookmarkTreeNode) {
    const entry = bookmarkIndex.get(node.id);
    setBookmarkPath([...(entry?.ancestorIds ?? []), node.id]);
    if (bookmarkQuery.trim()) {
      setBookmarkQuery("");
      setSelectedIds(new Set());
    }
  }

  async function handleImportBookmarks() {
    if (!state || !defaultBookmarkGroup || selectedBookmarkCount === 0) return;
    setBusy(true);
    try {
      const loaded = await loadState();
      if (loaded.recovered) throw new Error("Invalid stored collection");
      const freshMainGroups = getGroupsInTreeOrder(getWorkspaceGroups(loaded.state.groups, "main"));
      const targetGroup = freshMainGroups.find((group) => group.id === bookmarkGroupId)
        ?? freshMainGroups.find((group) => !group.isProtected)
        ?? freshMainGroups[0];
      if (!targetGroup) throw new Error("No homepage group available");
      const result = importSelectedBookmarks(
        loaded.state,
        bookmarkRoots,
        selectedIds,
        targetGroup.id,
      );
      await saveNextState(result.state);
      setBookmarkGroupId(targetGroup.id);
      setNotice({
        kind: result.failed ? "error" : "success",
        text: `新增 ${result.added} 个，跳过 ${result.skipped} 个，失败 ${result.failed} 个。`,
      });
      setSelectedIds(new Set());
    } catch {
      setNotice({ kind: "error", text: "导入失败，主页收藏没有被修改。" });
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteBookmarks() {
    const summary = summarizeBookmarkDeletion(bookmarkRoots, selectedIds);
    if (summary.roots.length > 0) setDeleteSummary(summary);
  }

  async function confirmDeleteBookmarks() {
    if (!bookmarks || !deleteSummary) return;
    setBusy(true);
    try {
      const result = await deleteBookmarkSelection(bookmarks, deleteSummary);
      await reloadBookmarks();
      setSelectedIds(new Set());
      setNotice({
        kind: result.failed ? "error" : "success",
        text: result.failed
          ? `已删除 ${result.deleted} 项，${result.failed} 项删除失败。`
          : "所选浏览器书签已删除。",
      });
    } catch {
      setNotice({ kind: "error", text: "删除失败，浏览器书签未完全修改。" });
    } finally {
      setBusy(false);
      setDeleteSummary(null);
    }
  }

  async function refreshBookmarks() {
    try {
      await reloadBookmarks();
      setSelectedIds(new Set());
      setNotice({ kind: "success", text: "浏览器书签已更新。" });
    } catch {
      setNotice({ kind: "error", text: "书签读取失败，请重试。" });
    }
  }

  const selectedVisibleCount = [...visibleIds].filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.size > 0 && selectedVisibleCount === visibleIds.size;

  function changeBookmarkQuery(query: string) {
    setBookmarkQuery(query);
    setBookmarkPath([]);
    setSelectedIds(new Set());
  }

  function backBookmarkFolder() {
    setBookmarkPath((path) => path.slice(0, -1));
  }

  function toggleVisibleBookmarks() {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => allVisibleSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function cancelDeleteBookmarks() {
    setDeleteSummary(null);
  }

  return {
    bookmarkGroupId, selectedIds, bookmarkQuery, deleteSummary,
    folderIcons, bookmarkPathNodes, currentBookmarkFolder, visibleBookmarkTiles,
    visibleIds, selectedBookmarkCount, allVisibleSelected,
    initializeBookmarks, setBookmarkGroupId, toggleBookmarkSelection, openBookmarkFolder,
    handleImportBookmarks, requestDeleteBookmarks, confirmDeleteBookmarks, refreshBookmarks,
    changeBookmarkQuery, backBookmarkFolder, toggleVisibleBookmarks, cancelDeleteBookmarks,
  };
}
