import {
  BookmarkSimple,
  CaretDown,
  CaretRight,
  Check,
  Folder,
  Globe,
  MagnifyingGlass,
  Plus,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteBookmarkSelection,
  filterBookmarkTree,
  getDescendantIds,
  importSelectedBookmarks,
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

function BookmarkCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={onChange}
    />
  );
}

function BookmarkRow({
  node,
  selectedIds,
  expandedIds,
  onToggleSelect,
  onToggleExpanded,
  depth = 0,
}: {
  node: BrowserBookmarkTreeNode;
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  onToggleSelect: (node: BrowserBookmarkTreeNode) => void;
  onToggleExpanded: (id: string) => void;
  depth?: number;
}) {
  const descendantIds = getDescendantIds(node);
  const selectedCount = descendantIds.filter((id) => selectedIds.has(id)).length;
  const checked = selectedCount === descendantIds.length;
  const indeterminate = selectedCount > 0 && !checked;
  const expanded = expandedIds.has(node.id);
  const isFolder = !node.url;
  return (
    <li>
      <div className="bookmark-row" style={{ paddingInlineStart: `${10 + depth * 16}px` }}>
        {isFolder ? (
          <button
            type="button"
            className="tree-toggle"
            aria-label={`${expanded ? "收起" : "展开"}${node.title}`}
            onClick={() => onToggleExpanded(node.id)}
          >
            {expanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
          </button>
        ) : (
          <span className="tree-toggle-spacer" />
        )}
        <BookmarkCheckbox
          checked={checked}
          indeterminate={indeterminate}
          label={`选择 ${node.title || "未命名书签"}`}
          onChange={() => onToggleSelect(node)}
        />
        <span className={`bookmark-kind ${isFolder ? "folder" : "site"}`}>
          {isFolder ? <Folder size={16} weight="fill" /> : <Globe size={16} />}
        </span>
        <span className="bookmark-copy">
          <strong>{node.title || "未命名书签"}</strong>
          {node.url && <small>{node.url}</small>}
        </span>
      </div>
      {isFolder && expanded && node.children && (
        <ul>
          {node.children.map((child) => (
            <BookmarkRow
              key={child.id}
              node={child}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              onToggleSelect={onToggleSelect}
              onToggleExpanded={onToggleExpanded}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function PopupApp() {
  const api = getChromiumExtensionApi();
  const store = useMemo(() => createSiteHubStore(api), [api]);
  const [tab, setTab] = useState<PopupTab>("quick");
  const [state, setState] = useState<SiteCollectionState | null>(null);
  const [activeBrowserTab, setActiveBrowserTab] = useState<BrowserTab | null>(null);
  const [quickWorkspace, setQuickWorkspace] = useState<SiteWorkspace>("main");
  const [quickName, setQuickName] = useState("");
  const [quickGroupId, setQuickGroupId] = useState("");
  const [quickDuplicateId, setQuickDuplicateId] = useState<string>();
  const [bookmarkRoots, setBookmarkRoots] = useState<BrowserBookmarkTreeNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [bookmarkQuery, setBookmarkQuery] = useState("");
  const [deleteSummary, setDeleteSummary] = useState<BookmarkDeleteSummary | null>(null);
  const [busy, setBusy] = useState(false);
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
  const popupPreferences = useMemo(() => readPopupPreferences(), []);
  const defaultGroup = useMemo(() => {
    if (quickWorkspace === "github") {
      return (
        groups.find((group) => group.id === popupPreferences.lastGithubGroupId) ??
        groups.find((group) => group.id === getGithubOtherGroupId(state!)) ??
        groups.find((group) => !group.isProtected) ??
        groups[0]
      );
    }
    return groups.find((group) => !group.isProtected) ?? groups[0];
  }, [groups, popupPreferences.lastGithubGroupId, quickWorkspace, state]);

  async function reloadBookmarks() {
    if (!api?.bookmarks) return;
    const tree = await api.bookmarks.getTree();
    const roots = tree.flatMap((root) => root.children ?? [root]);
    setBookmarkRoots(roots);
    setExpandedIds(new Set(roots.map((root) => root.id)));
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      store.load(),
      api?.tabs?.query({ active: true, currentWindow: true }) ?? Promise.resolve([]),
      api?.bookmarks?.getTree() ?? Promise.resolve([]),
    ]).then(([loaded, tabs, tree]) => {
      if (!active) return;
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
      setActiveBrowserTab(current);
      setQuickName(
        current?.title?.trim() ||
          (current?.url ? inferSiteName(current.url) : "") ||
          "",
      );
      const roots = tree.flatMap((root) => root.children ?? [root]);
      setBookmarkRoots(roots);
      setExpandedIds(new Set(roots.map((root) => root.id)));
    }).catch(() => {
      if (active) setNotice({ kind: "error", text: "无法读取扩展数据，请重新加载扩展。" });
    });
    return () => {
      active = false;
    };
  }, [api, store]);

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

  async function saveNextState(next: SiteCollectionState) {
    setState(next);
    await store.save(next);
  }

  async function handleQuickAdd() {
    if (!state || !quickUrl || !quickGroupId || !quickName.trim()) return;
    if (duplicate && quickDuplicateId !== duplicate.id) {
      setQuickDuplicateId(duplicate.id);
      return;
    }
    setBusy(true);
    try {
      const values = {
        name: quickName.trim(),
        url: quickUrl,
        groupId: quickGroupId,
        customIconUrl: "",
        iconSource: "auto" as const,
      };
      const next = duplicate
        ? updateSiteInState(state, duplicate.id, values)
        : addSiteToState(state, values);
      await saveNextState(next);
      if (quickWorkspace === "github") {
        savePopupPreferences({ lastGithubGroupId: quickGroupId });
      }
      setQuickDuplicateId(undefined);
      setNotice({
        kind: "success",
        text: duplicate
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
    const ids = getDescendantIds(node);
    setSelectedIds((current) => {
      const next = new Set(current);
      const shouldSelect = ids.some((id) => !next.has(id));
      ids.forEach((id) => (shouldSelect ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  async function handleImportBookmarks() {
    if (!state || !defaultGroup || selectedIds.size === 0) return;
    setBusy(true);
    try {
      const result = importSelectedBookmarks(
        state,
        bookmarkRoots,
        selectedIds,
        quickGroupId || defaultGroup.id,
      );
      await saveNextState(result.state);
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

  if (!state) {
    return <main className="popup-loading">正在读取收藏…</main>;
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
      </header>

      <nav className="popup-tabs" aria-label="工具栏功能">
        <button className={tab === "quick" ? "active" : ""} onClick={() => setTab("quick")}>
          <Plus size={17} weight="bold" />快速添加
        </button>
        <button className={tab === "bookmarks" ? "active" : ""} onClick={() => setTab("bookmarks")}>
          <BookmarkSimple size={17} />浏览器书签
        </button>
      </nav>

      {notice && <div className={`popup-notice ${notice.kind}`} role="status">{notice.text}</div>}

      {tab === "quick" ? (
        <section className="popup-page quick-page">
          <div className="current-site-card">
            <span className="current-site-icon">
              {quickIcon ? <img src={quickIcon} alt="" /> : <Globe size={24} />}
            </span>
            <div>
              <strong>{activeBrowserTab?.title || "当前页面不可收藏"}</strong>
              <small>{quickUrl || "浏览器内部页面和扩展页面不能添加"}</small>
            </div>
          </div>
          <label className="popup-field">
            <span>网站名称</span>
            <input
              value={quickName}
              disabled={!quickUrl}
              maxLength={120}
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
              <span>
                已收藏在“{state.groups.find((group) => group.id === duplicate.groupId)?.name ?? "其他"}”。再次确认会移动到当前分组并更新名称。
              </span>
            </div>
          )}
          <button
            type="button"
            className="popup-primary"
            disabled={!quickUrl || !quickName.trim() || busy}
            onClick={handleQuickAdd}
          >
            {duplicate && quickDuplicateId
              ? "确认移动并更新"
              : quickWorkspace === "github"
                ? "添加到 GitHub"
                : isGithubHomeUrl(quickUrl ?? "")
                  ? "添加到主页并同步顶部入口"
                  : "添加到主页"}
          </button>
        </section>
      ) : (
        <section className="popup-page bookmarks-page">
          {!api?.bookmarks ? (
            <div className="popup-empty">扩展缺少书签权限，请重新加载扩展。</div>
          ) : (
            <>
              <div className="bookmark-toolbar">
                <label className="bookmark-search">
                  <MagnifyingGlass size={16} />
                  <input
                    value={bookmarkQuery}
                    onChange={(event) => setBookmarkQuery(event.target.value)}
                    placeholder="搜索书签或网址"
                  />
                </label>
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
              <div className="bookmark-tree" role="tree">
                {visibleBookmarkRoots.length ? (
                  <ul>
                    {visibleBookmarkRoots.map((node) => (
                      <BookmarkRow
                        key={node.id}
                        node={node}
                        selectedIds={selectedIds}
                        expandedIds={expandedIds}
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
                <span>已选择 {selectedIds.size} 项</span>
                <div>
                  <button className="popup-danger" disabled={!selectedIds.size || busy} onClick={requestDeleteBookmarks}>
                    <Trash size={16} />删除
                  </button>
                  <button className="popup-primary compact" disabled={!selectedIds.size || busy} onClick={handleImportBookmarks}>
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
