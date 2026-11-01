import { useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from "react";
import { searchWeb } from "../../lib/browser-search";
import { getWorkspaceGroups } from "../../lib/github-workspace";
import type { SearchHistoryEntry, SiteGroup, SiteWorkspace } from "../../types";

export interface CollectionSearchSessionOptions {
  activeWorkspace: SiteWorkspace;
  activeGroupId: string;
  groups: SiteGroup[];
  searchHistory: readonly SearchHistoryEntry[];
  setActiveWorkspace: (workspace: SiteWorkspace) => void;
  setActiveGroupId: (groupId: string) => void;
  recordSearch: (query: string) => Promise<void>;
  onNotice: (notice: { kind: "success" | "error"; message: string }) => void;
}

type CollectionSearchOrigin = {
  workspace: SiteWorkspace;
  groupId: string;
};

/** useSiteHub owns saved history and collection data; this Hook owns only the search session. */
export function useCollectionSearchSession({
  activeWorkspace,
  activeGroupId,
  groups,
  searchHistory,
  setActiveWorkspace,
  setActiveGroupId,
  recordSearch,
  onNotice,
}: CollectionSearchSessionOptions) {
  const [query, setQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const collectionSearchOriginRef = useRef<CollectionSearchOrigin | null>(null);

  function setCollectionQuery(nextQuery: string) {
    const nextIsSearching = Boolean(nextQuery.trim());
    const wasSearching = Boolean(query.trim());

    if (nextIsSearching && !wasSearching) {
      collectionSearchOriginRef.current = {
        workspace: activeWorkspace,
        groupId: activeGroupId,
      };
      setActiveGroupId("all");
    } else if (!nextIsSearching && wasSearching) {
      const origin = collectionSearchOriginRef.current;
      collectionSearchOriginRef.current = null;
      if (origin) {
        const originGroups = getWorkspaceGroups(groups, origin.workspace);
        const originGroupStillExists =
          origin.groupId === "all" ||
          originGroups.some((group) => group.id === origin.groupId);
        setActiveWorkspace(origin.workspace);
        setActiveGroupId(originGroupStillExists ? origin.groupId : "all");
      }
    }

    setQuery(nextQuery);
  }

  function resetCollectionQuery() {
    collectionSearchOriginRef.current = null;
    setQuery("");
  }

  async function performSearch(text: string) {
    const normalized = text.trim();
    if (!normalized) return;
    setHistoryOpen(false);
    void recordSearch(normalized).catch(() => {
      onNotice({
        kind: "error",
        message: "搜索已发起，但这条历史记录未能保存。",
      });
    });
    try {
      await searchWeb(normalized);
    } catch {
      onNotice({
        kind: "error",
        message: "无法调用浏览器搜索，请稍后重试。",
      });
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performSearch(query);
  }

  function handleSearchBlur(event: FocusEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.closest(".search-panel")?.contains(next)) return;
    setHistoryOpen(false);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (query.trim() || !historyOpen || searchHistory.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHistoryIndex((current) =>
        Math.min(searchHistory.length - 1, current + 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHistoryIndex((current) => Math.max(-1, current - 1));
    } else if (event.key === "Escape") {
      setHistoryOpen(false);
      setHistoryIndex(-1);
    } else if (event.key === "Enter" && historyIndex >= 0) {
      event.preventDefault();
      const historyQuery = searchHistory[historyIndex]?.query;
      if (historyQuery) {
        setCollectionQuery(historyQuery);
        void performSearch(historyQuery);
      }
    }
  }

  function handleSearchFocus() {
    setHistoryOpen(true);
    setHistoryIndex(-1);
  }

  function dismissHistory() {
    setHistoryOpen(false);
  }

  function activateHistoryQuery(historyQuery: string) {
    setCollectionQuery(historyQuery);
    void performSearch(historyQuery);
  }

  return {
    query,
    historyOpen,
    historyIndex,
    setCollectionQuery,
    resetCollectionQuery,
    dismissHistory,
    handleSearchFocus,
    handleSearchBlur,
    handleSearchKeyDown,
    handleSearchSubmit,
    activateHistoryQuery,
  };
}
