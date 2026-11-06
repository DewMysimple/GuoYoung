import { useCallback, useMemo, useRef, useState } from "react";
import {
  filterBookmarkTree,
  getBrowserBookmarkRoots,
  importSelectedBookmarks,
  indexBookmarkTree,
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
  onImported?: (groupId: string) => void;
  onCollectionRead?: (state: SiteCollectionState) => void;
}

export function useBookmarkSession({
  bookmarks, state, mainGroups, loadState, saveNextState, setBusy, setNotice, onImported, onCollectionRead,
}: BookmarkSessionOptions) {
  const [bookmarkGroupId, setBookmarkGroupId] = useState("");
  const [bookmarkRoots, setBookmarkRoots] = useState<BrowserBookmarkTreeNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bookmarkPath, setBookmarkPath] = useState<string[]>([]);
  const [bookmarkQuery, setBookmarkQuery] = useState("");
  const importing = useRef(false);

  // The assembly calls this only after its allSettled generation is still active.
  // It performs no reads and preserves the existing query/selection on reload.
  const initializeBookmarks = useCallback((tree: BrowserBookmarkTreeNode[], groups: SiteGroup[], lastTargetId?: string) => {
    setBookmarkGroupId((current) => groups.some((group) => group.id === current)
      ? current
      : (groups.find(group => group.id === lastTargetId) ?? groups.find(group => !group.isProtected) ?? groups[0])?.id ?? "");
    setBookmarkRoots(getBrowserBookmarkRoots(tree));
    setBookmarkPath([]);
  }, []);

  const folderIcons = useMemo(() => new Map(getRootGroups(mainGroups).map((group) => [
    group.name.trim().toLocaleLowerCase("zh-CN"), group.icon,
  ] as const)), [mainGroups]);

  async function reloadBookmarks() {
    if (!bookmarks) return;
    const tree = await bookmarks.getTree();
    setBookmarkRoots(getBrowserBookmarkRoots(tree));
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
    () => new Set(visibleBookmarkTiles.flatMap(getBookmarkSiteIds)),
    [visibleBookmarkTiles],
  );
  const selectedBookmarkCount = [...selectedIds].filter((id) => Boolean(bookmarkIndex.get(id)?.node.url)).length;

  function toggleBookmarkSelection(node: BrowserBookmarkTreeNode) {
    const ids = getBookmarkSiteIds(node);
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
    if (!state || !bookmarkGroupId || !selectedBookmarkCount || importing.current) return;
    importing.current = true;
    setBusy(true);
    try {
      const loaded = await loadState();
      if (loaded.recovered) throw new Error("Invalid stored collection");
      const freshMainGroups = getGroupsInTreeOrder(getWorkspaceGroups(loaded.state.groups, "main"));
      const targetGroup = freshMainGroups.find((group) => group.id === bookmarkGroupId);
      if (!targetGroup) {
        onCollectionRead?.(loaded.state);
        setBookmarkGroupId("");
        setNotice({ kind: "error", text: "目标分组已变更，请重新选择后导入。" });
        return;
      }
      const result = importSelectedBookmarks(
        loaded.state,
        bookmarkRoots,
        selectedIds,
        targetGroup.id,
        { mode: "target" },
      );
      if (result.state !== loaded.state) await saveNextState(result.state);
      else onCollectionRead?.(loaded.state);
      setBookmarkGroupId(targetGroup.id);
      if (result.added || result.skipped) onImported?.(targetGroup.id);
      setNotice({
        kind: result.failed ? "error" : "success",
        text: `新增 ${result.added} 个，跳过 ${result.skipped} 个，失败 ${result.failed} 个。`,
      });
      setSelectedIds(new Set());
    } catch {
      setNotice({ kind: "error", text: "导入失败，主页收藏没有被修改。" });
    } finally {
      importing.current = false;
      setBusy(false);
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
    setSelectedIds(new Set());
  }

  function backBookmarkFolder() {
    setBookmarkPath((path) => path.slice(0, -1));
  }

  function goToBookmarkAncestor(length: number) {
    setBookmarkPath(path => path.slice(0, length));
  }

  function toggleVisibleBookmarks() {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => allVisibleSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  return {
    bookmarkGroupId, selectedIds, bookmarkQuery,
    folderIcons, bookmarkPathNodes, currentBookmarkFolder, visibleBookmarkTiles,
    visibleIds, selectedBookmarkCount, allVisibleSelected,
    initializeBookmarks, setBookmarkGroupId, toggleBookmarkSelection, openBookmarkFolder,
    handleImportBookmarks, refreshBookmarks,
    changeBookmarkQuery, backBookmarkFolder, goToBookmarkAncestor, toggleVisibleBookmarks,
  };
}
