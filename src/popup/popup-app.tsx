import {
  ArrowClockwise,
  ArrowSquareOut,
  BookmarkSimple,
  Globe,
  MagnifyingGlass,
  Plus,
  SquaresFour,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import {
  deleteBookmarkSelection,
  filterBookmarkTree,
  getDescendantIds,
  importSelectedBookmarks,
  indexBookmarkTree,
  summarizeBookmarkDeletion,
  type BookmarkDeleteSummary,
} from "../lib/bookmark-manager";
import {
  getBrowserFaviconUrl,
  getChromiumExtensionApi,
  type BrowserBookmarkTreeNode,
  type BrowserTab,
} from "../lib/browser-runtime";
import {
  getGithubOtherGroupId,
  getWorkspaceGroups,
  isGithubHomeUrl,
  isGithubUrl,
} from "../lib/github-workspace";
import { createSiteHubStore } from "../lib/state-store";
import {
  findSiteByUrl,
  updateSiteInState,
  addSiteToState,
} from "../lib/site-state";
import { inferSiteName, normalizeUrl } from "../lib/site-utils";
import type { SiteCollectionState, SiteWorkspace } from "../types";
import { useTheme } from "../hooks/use-theme";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { BookmarkTile, getBookmarkFolderIds, getBookmarkSiteIds } from "./bookmark-tree";

type PopupTab = "quick" | "bookmarks";

const POPUP_PREFERENCES_KEY = "site-hub:popup-preferences";

interface PopupPreferences {
  lastGithubGroupId?: string;
}

function readPopupPreferences(): PopupPreferences {
  try {
    const raw = localStorage.getItem(POPUP_PREFERENCES_KEY);
    if (!raw) return {};
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    return typeof candidate.lastGithubGroupId === "string"
      ? { lastGithubGroupId: candidate.lastGithubGroupId }
      : {};
  } catch {
    return {};
  }
}

function savePopupPreferences(preferences: PopupPreferences) {
  try {
    localStorage.setItem(POPUP_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // A restricted extension context should not block adding a site.
  }
}

function getQuickWorkspace(url: string | undefined): SiteWorkspace {
  return url && isGithubUrl(url) && !isGithubHomeUrl(url) ? "github" : "main";
}

export function PopupApp() {
  const api = getChromiumExtensionApi();
  const store = useMemo(() => createSiteHubStore(api), [api]);
  const [tab, setTab] = useState<PopupTab>("quick");
  const [state, setState] = useState<SiteCollectionState | null>(null);
  useTheme(state?.appearance.theme ?? DEFAULT_APPEARANCE.theme,
    state?.appearance.accentColor ?? DEFAULT_APPEARANCE.accentColor);
  const [activeBrowserTab, setActiveBrowserTab] = useState<BrowserTab | null>(null);
  const [quickWorkspace, setQuickWorkspace] = useState<SiteWorkspace>("main");
  const [quickName, setQuickName] = useState("");
  const [quickGroupId, setQuickGroupId] = useState("");
  const [bookmarkGroupId, setBookmarkGroupId] = useState("");
  const [quickDuplicateId, setQuickDuplicateId] = useState<string>();
  const [bookmarkRoots, setBookmarkRoots] = useState<BrowserBookmarkTreeNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [bookmarkQuery, setBookmarkQuery] = useState("");
  const [deleteSummary, setDeleteSummary] = useState<BookmarkDeleteSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string }>();

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const groups = useMemo(
    () => state ? getWorkspaceGroups(state.groups, quickWorkspace) : [],
    [quickWorkspace, state],
  );
  const mainGroups = useMemo(() => state ? getWorkspaceGroups(state.groups, "main") : [], [state]);
  const defaultBookmarkGroup = mainGroups.find((group) => !group.isProtected) ?? mainGroups[0];
  const folderIcons = useMemo(() => new Map(mainGroups.map((group) => [
    group.name.trim().toLocaleLowerCase("zh-CN"), group.icon,
  ] as const)), [mainGroups]);

  async function reloadBookmarks() {
    if (!api?.bookmarks) return;
    const tree = await api.bookmarks.getTree();
    const roots = tree.flatMap((root) => root.children ?? [root]);
    setBookmarkRoots(roots);
    setExpandedIds(new Set(roots.map((root) => root.id)));
  }

  useEffect(() => {
    let active = true;
    setLoadError(null);
    Promise.allSettled([
      store.load(),
      api?.tabs?.query({ active: true, currentWindow: true }) ?? Promise.resolve([]),
      api?.bookmarks?.getTree() ?? Promise.resolve([]),
    ]).then(([collectionResult, tabsResult, bookmarksResult]) => {
      if (!active) return;
      if (collectionResult.status === "rejected") {
        setLoadError("无法读取扩展数据，请重新加载扩展。");
        return;
      }
      const loaded = collectionResult.value;
      const tabs = tabsResult.status === "fulfilled" ? tabsResult.value : [];
      const tree = bookmarksResult.status === "fulfilled" ? bookmarksResult.value : [];
      const failures = [
        ...(tabsResult.status === "rejected" ? ["无法读取当前网页"] : []),
        ...(bookmarksResult.status === "rejected" ? ["无法读取浏览器书签"] : []),
      ];
      if (failures.length) setNotice({ kind: "error", text: `${failures.join("；")}。书签可在列表内刷新，当前网页请重新打开弹窗读取。` });
      setState(loaded.state);
      const current = tabs[0] ?? null;
      const normalizedCurrentUrl = (() => {
        try {
          return current?.url ? normalizeUrl(current.url) : undefined;
        } catch {
          return undefined;
        }
      })();
      const detectedWorkspace = getQuickWorkspace(normalizedCurrentUrl);
      setQuickWorkspace(detectedWorkspace);
      const detectedGroups = getWorkspaceGroups(
        loaded.state.groups,
        detectedWorkspace,
      );
      const detectedGroup = detectedWorkspace === "github"
        ? detectedGroups.find(
            (group) => group.id === readPopupPreferences().lastGithubGroupId,
          ) ?? detectedGroups.find((group) => group.id === getGithubOtherGroupId(loaded.state))
        : undefined;
      const initialGroup =
        detectedGroup ??
        detectedGroups.find((group) => !group.isProtected) ??
        detectedGroups[0];
      setQuickGroupId(initialGroup?.id ?? "");
      const mainGroups = getWorkspaceGroups(loaded.state.groups, "main");
      setBookmarkGroupId((current) => mainGroups.some((group) => group.id === current)
        ? current
        : (mainGroups.find((group) => !group.isProtected) ?? mainGroups[0])?.id ?? "");
      setActiveBrowserTab(current);
      setQuickName(
        current?.title?.trim() ||
          (current?.url ? inferSiteName(current.url) : "") ||
          "",
      );
      const roots = tree.flatMap((root) => root.children ?? [root]);
      setBookmarkRoots(roots);
      setExpandedIds(new Set(roots.map((root) => root.id)));
    });
    return () => {
      active = false;
    };
  }, [api, store, loadVersion]);

  const quickUrl = useMemo(() => {
    try {
      return activeBrowserTab?.url ? normalizeUrl(activeBrowserTab.url) : undefined;
    } catch {
      return undefined;
    }
  }, [activeBrowserTab]);
  const duplicate =
    state && quickUrl ? findSiteByUrl(state.sites, quickUrl) : undefined;
  const visibleBookmarkRoots = useMemo(
    () => filterBookmarkTree(bookmarkRoots, bookmarkQuery),
    [bookmarkQuery, bookmarkRoots],
  );
  const visibleBookmarkTiles = useMemo(() => {
    const flatten = (nodes: BrowserBookmarkTreeNode[], depth: number): Array<{ node: BrowserBookmarkTreeNode; depth: number }> =>
      nodes.flatMap((node) => [
        { node, depth },
        ...(!node.url && expandedIds.has(node.id) ? flatten(node.children ?? [], depth + 1) : []),
      ]);
    return flatten(visibleBookmarkRoots, 0);
  }, [expandedIds, visibleBookmarkRoots]);
  const visibleIds = useMemo(
    () => {
      if (!bookmarkQuery.trim()) {
        return new Set(visibleBookmarkRoots.flatMap(getDescendantIds));
      }
      const bookmarkIds: string[] = [];
      const collect = (node: BrowserBookmarkTreeNode) => {
        if (node.url) bookmarkIds.push(node.id);
        node.children?.forEach(collect);
      };
      visibleBookmarkRoots.forEach(collect);
      return new Set(bookmarkIds);
    },
    [bookmarkQuery, visibleBookmarkRoots],
  );
  const bookmarkIndex = useMemo(() => indexBookmarkTree(bookmarkRoots), [bookmarkRoots]);
  const selectedBookmarkCount = [...selectedIds].filter((id) => Boolean(bookmarkIndex.get(id)?.node.url)).length;
  async function saveNextState(next: SiteCollectionState) {
    await store.save(next);
    setState(next);
  }

  async function handleQuickAdd() {
    if (!state || !quickUrl || !quickGroupId || !quickName.trim()) return;
    if (duplicate && quickDuplicateId !== duplicate.id) {
      setQuickDuplicateId(duplicate.id);
      return;
    }
    setBusy(true);
    try {
      const loaded = await store.load();
      if (loaded.recovered) throw new Error("Invalid stored collection");
      const freshGroups = getWorkspaceGroups(loaded.state.groups, quickWorkspace);
      const targetGroup = freshGroups.find((group) => group.id === quickGroupId)
        ?? (quickWorkspace === "github"
          ? freshGroups.find((group) => group.id === getGithubOtherGroupId(loaded.state))
          : undefined)
        ?? freshGroups.find((group) => !group.isProtected)
        ?? freshGroups[0];
      if (!targetGroup) throw new Error("No destination group available");
      const existing = findSiteByUrl(loaded.state.sites, quickUrl);
      if (existing && quickDuplicateId !== existing.id) {
        setState(loaded.state);
        setQuickDuplicateId(existing.id);
        return;
      }
      const values = {
        name: quickName.trim(),
        url: quickUrl,
        groupId: targetGroup.id,
        customIconUrl: "",
        iconSource: "auto" as const,
      };
      const next = existing
        ? updateSiteInState(loaded.state, existing.id, values)
        : addSiteToState(loaded.state, values);
      await saveNextState(next);
      setQuickGroupId(targetGroup.id);
      if (quickWorkspace === "github") {
        savePopupPreferences({ lastGithubGroupId: targetGroup.id });
      }
      setQuickDuplicateId(undefined);
      setNotice({
        kind: "success",
        text: existing
          ? quickWorkspace === "github"
            ? "已移动并更新 GitHub 收藏。"
            : "已移动并更新现有收藏。"
          : quickWorkspace === "github"
            ? "当前 GitHub 页面已添加到 GitHub 收藏。"
            : isGithubHomeUrl(quickUrl ?? "")
              ? "GitHub 官方主页已添加，并会显示在 GitHub 顶部。"
              : "当前网页已添加到主页。",
      });
    } catch {
      setNotice({ kind: "error", text: "保存失败，请稍后重试。" });
    } finally {
      setBusy(false);
    }
  }

  function toggleBookmarkSelection(node: BrowserBookmarkTreeNode) {
    const ids = bookmarkQuery.trim() ? getBookmarkSiteIds(node) : getDescendantIds(node);
    setSelectedIds((current) => {
      const next = new Set(current);
      const shouldSelect = ids.some((id) => !next.has(id));
      ids.forEach((id) => (shouldSelect ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  async function handleImportBookmarks() {
    if (!state || !defaultBookmarkGroup || selectedBookmarkCount === 0) return;
    setBusy(true);
    try {
      const loaded = await store.load();
      if (loaded.recovered) throw new Error("Invalid stored collection");
      const freshMainGroups = getWorkspaceGroups(loaded.state.groups, "main");
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
    if (!api?.bookmarks || !deleteSummary) return;
    setBusy(true);
    try {
      const result = await deleteBookmarkSelection(api.bookmarks, deleteSummary);
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

  if (!state) {
    return <main className="popup-loading">
      {loadError ? <>
        <p role="alert">{loadError}</p>
        <button type="button" className="popup-primary" onClick={() => setLoadVersion((current) => current + 1)}>重新读取</button>
      </> : "正在读取收藏…"}
    </main>;
  }

  const selectedVisibleCount = [...visibleIds].filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.size > 0 && selectedVisibleCount === visibleIds.size;
  const quickIcon = quickUrl ? getBrowserFaviconUrl(quickUrl, 64, api) : undefined;

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div className="popup-brand">
          <img src="/favicon.svg" alt="" />
          <div><strong>{state.brand.name}</strong><span>网站收藏</span></div>
        </div>
        <a className="popup-open-home" href={api?.runtime?.getURL?.("index.html") ?? "/index.html"} target="_blank" rel="noopener noreferrer" aria-label="打开收藏主页" title="打开收藏主页">
          <ArrowSquareOut size={19} weight="bold" />
        </a>
      </header>

      <nav className="popup-tabs" aria-label="工具栏功能">
        <button type="button" className={tab === "quick" ? "active" : ""} aria-current={tab === "quick" ? "page" : undefined} onClick={() => setTab("quick")}>
          <Plus size={17} weight="bold" />快速添加
        </button>
        <button type="button" className={tab === "bookmarks" ? "active" : ""} aria-current={tab === "bookmarks" ? "page" : undefined} onClick={() => setTab("bookmarks")}>
          <BookmarkSimple size={17} />浏览器书签
        </button>
      </nav>

      {notice && <div className={`popup-notice ${notice.kind}`} role="status">{notice.text}</div>}

      {tab === "quick" ? (
        <section className="popup-page quick-page">
          <div className="popup-section-heading">
            <span className="popup-eyebrow"><SquaresFour size={14} /> 当前网页</span>
            <h1>保存到网站收藏</h1>
          </div>
          <div className="current-site-card">
            <span className="current-site-icon">
              {quickIcon ? <img src={quickIcon} alt="" /> : <Globe size={24} />}
            </span>
            <div className="current-site-copy">
              <strong>{activeBrowserTab?.title || "当前页面不可收藏"}</strong>
              <small>{quickUrl || "浏览器内部页面和扩展页面不能添加"}</small>
            </div>
            {duplicate && <span className="current-site-badge">已收藏</span>}
          </div>
          <div className="popup-form-card">
            <label className="popup-field">
              <span>网站名称</span>
              <input
                value={quickName}
                disabled={!quickUrl}
                maxLength={120}
                placeholder="输入便于查找的名称"
                onChange={(event) => {
                  setQuickName(event.target.value);
                  setQuickDuplicateId(undefined);
                }}
              />
            </label>
            <label className="popup-field">
              <span>{quickWorkspace === "github" ? "添加到 GitHub 分组" : "添加到分组"}</span>
              <select
                value={quickGroupId}
                disabled={!quickUrl}
                onChange={(event) => {
                  setQuickGroupId(event.target.value);
                  setQuickDuplicateId(undefined);
                }}
              >
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            {duplicate && quickDuplicateId && (
              <div className="duplicate-popup-notice">
                <Warning size={18} />
                <span>已收藏在“{state.groups.find((group) => group.id === duplicate.groupId)?.name ?? "其他"}”。再次确认会移动到当前分组并更新名称。</span>
              </div>
            )}
            <button
              type="button"
              className="popup-primary"
              disabled={!quickUrl || !quickName.trim() || busy}
              onClick={handleQuickAdd}
            >
              <Plus size={18} weight="bold" />
              {duplicate && quickDuplicateId
                ? "确认移动并更新"
                : duplicate
                  ? "更新已收藏网站"
                  : quickWorkspace === "github"
                    ? "添加到 GitHub"
                    : isGithubHomeUrl(quickUrl ?? "")
                      ? "添加到主页并同步顶部入口"
                      : "添加到主页"}
            </button>
          </div>
        </section>
      ) : (
        <section className="popup-page bookmarks-page">
          <div className="popup-section-heading bookmarks-heading">
            <span className="popup-eyebrow"><BookmarkSimple size={14} /> 浏览器书签</span>
            <h1>整理已有书签</h1>
          </div>
          {!api?.bookmarks ? (
            <div className="popup-empty">扩展缺少书签权限，请重新加载扩展。</div>
          ) : (
            <>
              <div className="bookmark-toolbar">
                <label className="bookmark-search">
                  <MagnifyingGlass size={16} />
                  <input
                    value={bookmarkQuery}
                    onChange={(event) => {
                      const query = event.target.value;
                      setBookmarkQuery(query);
                      setSelectedIds(new Set());
                      if (query.trim()) {
                        const folderIds = filterBookmarkTree(bookmarkRoots, query).flatMap(getBookmarkFolderIds);
                        setExpandedIds((current) => new Set([...current, ...folderIds]));
                      }
                    }}
                    placeholder="搜索书签或网址"
                    aria-label="搜索书签或网址"
                  />
                </label>
                <button type="button" className="bookmark-refresh" title="刷新书签" aria-label="刷新书签" onClick={() => void refreshBookmarks()}>
                  <ArrowClockwise size={17} />
                </button>
              </div>
              <div className="bookmark-list-heading">
                <span>{bookmarkQuery.trim() ? "搜索结果" : "书签列表"}</span>
                <button
                  type="button"
                  className="select-visible"
                  disabled={visibleIds.size === 0}
                  onClick={() => setSelectedIds((current) => {
                    const next = new Set(current);
                    visibleIds.forEach((id) => allVisibleSelected ? next.delete(id) : next.add(id));
                    return next;
                  })}
                >
                  {allVisibleSelected ? "取消全选" : "全选结果"}
                </button>
              </div>
              <div className="bookmark-tree" aria-label="浏览器书签列表">
                {visibleBookmarkTiles.length ? (
                  <ul className="bookmark-grid">
                    {visibleBookmarkTiles.map(({ node, depth }) => (
                      <BookmarkTile
                        key={node.id}
                        node={node}
                        selectedIds={selectedIds}
                        expanded={expandedIds.has(node.id)}
                        searchActive={Boolean(bookmarkQuery.trim())}
                        folderIcons={folderIcons}
                        depth={depth}
                        onToggleSelect={toggleBookmarkSelection}
                        onToggleExpanded={(id) => setExpandedIds((current) => {
                          const next = new Set(current);
                          next.has(id) ? next.delete(id) : next.add(id);
                          return next;
                        })}
                      />
                    ))}
                  </ul>
                ) : <div className="popup-empty">没有匹配的浏览器书签</div>}
              </div>
              <div className="bookmark-footer">
                <div className="bookmark-footer-summary"><strong>已选择 {selectedIds.size} 项</strong></div>
                <label className="bookmark-destination popup-field" title="没有文件夹的书签添加到此分组；文件夹书签按名称建组">
                  <span>默认分组</span>
                  <select value={bookmarkGroupId} onChange={(event) => setBookmarkGroupId(event.target.value)}>
                    {mainGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
                <div className="bookmark-footer-actions">
                  <button className="popup-danger" disabled={!selectedIds.size || busy} onClick={requestDeleteBookmarks}>
                    <Trash size={16} />删除
                  </button>
                  <button className="popup-primary compact" disabled={!selectedBookmarkCount || busy} onClick={handleImportBookmarks}>
                    <Plus size={16} />添加到主页
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {deleteSummary && (
        <div className="popup-confirm-backdrop" role="presentation">
          <section className="popup-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-bookmarks-title">
            <span className="confirm-warning"><Warning size={24} /></span>
            <h2 id="delete-bookmarks-title">删除浏览器原生书签？</h2>
            <p>将删除 {deleteSummary.bookmarkCount} 个网站和 {deleteSummary.folderCount} 个文件夹。主页收藏不会受到影响。</p>
            <div>
              <button onClick={() => setDeleteSummary(null)}>取消</button>
              <button className="popup-danger filled" disabled={busy} onClick={confirmDeleteBookmarks}>确认删除</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
