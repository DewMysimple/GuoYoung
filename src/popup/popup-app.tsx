import {
  ArrowClockwise,
  ArrowLeft,
  ArrowSquareOut,
  BookmarkSimple,
  CaretRight,
  FolderSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SquaresFour,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useId, useInsertionEffect, useMemo, useRef, useState } from "react";
import { typographyVariables } from "../lib/typography";
import { useLocalFont } from "../hooks/use-local-font";
import {
  getChromiumExtensionApi,
  type BrowserTab,
} from "../lib/browser-runtime";
import {
  getGithubOtherGroupId,
  getWorkspaceGroups,
  isGithubHomeUrl,
  isGithubUrl,
} from "../lib/github-workspace";
import { getGroupPath, getGroupsInTreeOrder, getRootGroups } from "../lib/group-hierarchy";
import { createSiteHubStore } from "../lib/state-store";
import {
  findSiteByUrl,
  updateSiteInState,
  addSiteToState,
  addGroupToState,
  findGroupByName,
} from "../lib/site-state";
import { getHostname, inferSiteName, normalizeUrl } from "../lib/site-utils";
import type { SiteCollectionState, SiteGroup, SiteWorkspace } from "../types";
import { useTheme } from "../hooks/use-theme";
import { useTextSelection } from "../hooks/use-text-selection";
import { DEFAULT_APPEARANCE, DEFAULT_WALLPAPER } from "../data/defaults";
import { BookmarkTile } from "./bookmark-tree";
import { useBookmarkSession } from "./hooks/use-bookmark-session";
import { SelectMenu } from "../components/select-menu";
import { CategoryIcon as GroupIcon } from "../components/category-icon";
import { Favicon } from "../components/favicon";
import { wallpaperGlassStyle } from "../lib/wallpaper-glass";

type PopupTab = "quick" | "bookmarks";

const POPUP_PREFERENCES_KEY = "site-hub:popup-preferences";

interface PopupPreferences {
  lastMainGroupId?: string;
  lastGithubGroupId?: string;
  lastBookmarkGroupId?: string;
}

function readPopupPreferences(): PopupPreferences {
  try {
    const raw = localStorage.getItem(POPUP_PREFERENCES_KEY);
    if (!raw) return {};
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    return {
      lastMainGroupId: typeof candidate.lastMainGroupId === "string" ? candidate.lastMainGroupId : undefined,
      lastGithubGroupId: typeof candidate.lastGithubGroupId === "string" ? candidate.lastGithubGroupId : undefined,
      lastBookmarkGroupId: typeof candidate.lastBookmarkGroupId === "string" ? candidate.lastBookmarkGroupId : undefined,
    };
  } catch {
    return {};
  }
}

function savePopupPreferences(preferences: PopupPreferences) {
  try {
    localStorage.setItem(POPUP_PREFERENCES_KEY, JSON.stringify({ ...readPopupPreferences(), ...preferences }));
  } catch {
    // A restricted extension context should not block adding a site.
  }
}

function getQuickWorkspace(url: string | undefined): SiteWorkspace {
  return url && isGithubUrl(url) && !isGithubHomeUrl(url) ? "github" : "main";
}

function getDefaultQuickGroup(groups: readonly SiteGroup[], workspace: SiteWorkspace, state: SiteCollectionState) {
  return (workspace === "github" ? groups.find(group => group.id === getGithubOtherGroupId(state)) : undefined)
    ?? groups.find(group => !group.isProtected) ?? groups[0];
}

function PopupTargetSelect({ groups, value, onChange, label, disabled, placement }: {
  groups: readonly SiteGroup[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  disabled?: boolean;
  placement?: "top" | "bottom";
}) {
  return <SelectMenu
    ariaLabel={label}
    value={value}
    options={groups.map(group => ({
      value: group.id,
      label: getGroupPath(groups, group.id),
      icon: <GroupIcon name={group.icon} size={16} />,
    }))}
    className="popup-target-select"
    triggerClassName="popup-select-trigger"
    menuClassName="popup-select-popover"
    placement={placement}
    disabled={disabled || !groups.length}
    renderTrigger={option => <>{option?.icon ?? <FolderSimple size={16} />}
      <span className="popup-target-label" title={option?.label}>{option?.label ?? "选择分组"}</span></>}
    onChange={onChange}
  />;
}

export function PopupApp() {
  const api = getChromiumExtensionApi();
  const store = useMemo(() => createSiteHubStore(api), [api]);
  const [tab, setTab] = useState<PopupTab>("quick");
  const [state, setState] = useState<SiteCollectionState | null>(null);
  useTextSelection(state?.appearance.allowTextSelection ?? true);
  const typography = state?.appearance ?? DEFAULT_APPEARANCE;
  const wallpaper = state?.wallpaper ?? DEFAULT_WALLPAPER;
  useLocalFont(typography);
  useInsertionEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--font-scale", String(typography.fontScale / 100));
    for (const [property, value] of Object.entries(typographyVariables(typography))) root.style.setProperty(property, value);
  }, [typography]);
  useInsertionEffect(() => {
    const root = document.documentElement;
    root.dataset.glassSurface = "popup";
    const properties = Object.entries(wallpaperGlassStyle(wallpaper));
    for (const [property, value] of properties) root.style.setProperty(property, value);
    return () => {
      delete root.dataset.glassSurface;
      for (const [property] of properties) root.style.removeProperty(property);
    };
  }, [wallpaper]);
  useTheme(state?.appearance.theme ?? DEFAULT_APPEARANCE.theme,
    state?.appearance.accentColor ?? DEFAULT_APPEARANCE.accentColor);
  const [activeBrowserTab, setActiveBrowserTab] = useState<BrowserTab | null>(null);
  const [quickWorkspace, setQuickWorkspace] = useState<SiteWorkspace>("main");
  const [quickName, setQuickName] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const quickNameEdited = useRef(false);
  const quickNoteEdited = useRef(false);
  const quickGroupEdited = useRef(false);
  const [quickGroupId, setQuickGroupId] = useState("");
  const [recentGroupId, setRecentGroupId] = useState("");
  const [creatingQuickGroup, setCreatingQuickGroup] = useState(false);
  const [quickGroupName, setQuickGroupName] = useState("");
  const [quickGroupError, setQuickGroupError] = useState("");
  const quickGroupNameId = useId();
  const quickGroupInput = useRef<HTMLInputElement>(null);
  const quickGroupTrigger = useRef<HTMLButtonElement>(null);
  const quickSaving = useRef(false);
  const [quickDuplicateId, setQuickDuplicateId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string }>();
  const bookmarkBreadcrumbRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (creatingQuickGroup && tab === "quick") quickGroupInput.current?.focus({ preventScroll: true });
  }, [creatingQuickGroup, tab]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const groups = useMemo(
    () => state ? getGroupsInTreeOrder(getWorkspaceGroups(state.groups, quickWorkspace)) : [],
    [quickWorkspace, state],
  );
  const mainGroups = useMemo(() => state ? getGroupsInTreeOrder(getWorkspaceGroups(state.groups, "main")) : [], [state]);
  const {
    bookmarkGroupId, selectedIds, bookmarkQuery,
    folderIcons, bookmarkPathNodes, currentBookmarkFolder, visibleBookmarkTiles,
    visibleIds, selectedBookmarkCount, allVisibleSelected,
    initializeBookmarks, setBookmarkGroupId, toggleBookmarkSelection, openBookmarkFolder,
    handleImportBookmarks, refreshBookmarks,
    changeBookmarkQuery, backBookmarkFolder, goToBookmarkAncestor, toggleVisibleBookmarks,
  } = useBookmarkSession({
    bookmarks: api?.bookmarks, state, mainGroups, loadState: store.load,
    saveNextState, setBusy, setNotice,
    onImported: id => savePopupPreferences({ lastBookmarkGroupId: id }),
    onCollectionRead: setState,
  });

  useEffect(() => {
    const path = bookmarkBreadcrumbRef.current;
    if (path) path.scrollLeft = path.scrollWidth;
  }, [bookmarkPathNodes, bookmarkQuery, tab]);

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
        ...(tabsResult.status === "rejected" ? ["无法读取标签页"] : []),
        ...(bookmarksResult.status === "rejected" ? ["无法读取浏览器书签"] : []),
      ];
      if (failures.length) setNotice({ kind: "error", text: `${failures.join("；")}。` });
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
      const detectedGroups = getGroupsInTreeOrder(getWorkspaceGroups(
        loaded.state.groups,
        detectedWorkspace,
      ));
      const preferences = readPopupPreferences();
      const recentGroup = detectedGroups.find(group => group.id === (detectedWorkspace === "github"
        ? preferences.lastGithubGroupId : preferences.lastMainGroupId));
      const existing = normalizedCurrentUrl ? findSiteByUrl(loaded.state.sites, normalizedCurrentUrl) : undefined;
      const initialGroup = detectedGroups.find(group => group.id === existing?.groupId)
        ?? recentGroup ?? getDefaultQuickGroup(detectedGroups, detectedWorkspace, loaded.state);
      setRecentGroupId(recentGroup?.id ?? "");
      setQuickGroupId(initialGroup?.id ?? "");
      quickNameEdited.current = false;
      quickNoteEdited.current = false;
      quickGroupEdited.current = false;
      setQuickNote(existing?.note ?? "");
      setQuickDuplicateId(undefined);
      const mainGroups = getGroupsInTreeOrder(getWorkspaceGroups(loaded.state.groups, "main"));
      setActiveBrowserTab(current);
      setQuickName(
        existing?.name || current?.title?.trim() ||
          (current?.url ? inferSiteName(current.url) : "") ||
          "",
      );
      initializeBookmarks(tree, mainGroups, preferences.lastBookmarkGroupId);
    });
    return () => {
      active = false;
    };
  }, [api, store, loadVersion, initializeBookmarks]);

  const quickUrl = useMemo(() => {
    try {
      return activeBrowserTab?.url ? normalizeUrl(activeBrowserTab.url) : undefined;
    } catch {
      return undefined;
    }
  }, [activeBrowserTab]);
  const quickSitePreview = useMemo(() => {
    if (!quickUrl) return undefined;
    const tabIconUrl = activeBrowserTab?.favIconUrl?.trim();
    return {
      name: quickName.trim() || activeBrowserTab?.title?.trim() || inferSiteName(quickUrl) || quickUrl,
      url: quickUrl,
      customIconUrl: tabIconUrl ?? "",
      iconSource: tabIconUrl ? "custom" as const : "browser" as const,
    };
  }, [activeBrowserTab, quickName, quickUrl]);
  const duplicate =
    state && quickUrl ? findSiteByUrl(state.sites, quickUrl) : undefined;
  async function saveNextState(next: SiteCollectionState) {
    await store.save(next);
    setState(next);
  }

  function cancelQuickGroup(restoreFocus = false) {
    setCreatingQuickGroup(false);
    setQuickGroupName("");
    setQuickGroupError("");
    setQuickDuplicateId(undefined);
    if (restoreFocus) quickGroupTrigger.current?.focus({ preventScroll: true });
  }

  async function handleQuickAdd() {
    if (!state || !quickUrl || !quickName.trim() || quickSaving.current) return;
    const newGroupName = creatingQuickGroup ? quickGroupName.trim() : undefined;
    if (creatingQuickGroup ? !newGroupName : !quickGroupId) return;
    quickSaving.current = true;
    setBusy(true);
    try {
      const loaded = await store.load();
      if (loaded.recovered) throw new Error("Invalid stored collection");
      const freshGroups = getGroupsInTreeOrder(getWorkspaceGroups(loaded.state.groups, quickWorkspace));
      if (newGroupName && findGroupByName(getRootGroups(freshGroups), newGroupName)) {
        setState(loaded.state);
        setQuickGroupError("已经有同名分组，请选择现有分组。");
        setQuickDuplicateId(undefined);
        return;
      }
      const existing = findSiteByUrl(loaded.state.sites, quickUrl);
      if (duplicate && !existing) {
        setState(loaded.state);
        setQuickDuplicateId(undefined);
        setNotice({ kind: "error", text: "该收藏已在其他窗口移除，确认目标分组后可重新收藏。" });
        return;
      }
      if (existing && (newGroupName || duplicate?.id !== existing.id) && quickDuplicateId !== existing.id) {
        setState(loaded.state);
        setQuickDuplicateId(existing.id);
        if (!quickNameEdited.current) setQuickName(existing.name);
        if (!quickNoteEdited.current) setQuickNote(existing.note ?? "");
        return;
      }
      const chosenId = existing && !quickGroupEdited.current ? existing.groupId : quickGroupId;
      const chosenGroup = freshGroups.find(group => group.id === chosenId);
      if (!newGroupName && !chosenGroup) {
        setState(loaded.state);
        setQuickGroupId(getDefaultQuickGroup(freshGroups, quickWorkspace, loaded.state)?.id ?? "");
        setNotice({ kind: "error", text: "目标分组已变更，请重新选择后保存。" });
        return;
      }
      // Stage both changes against the latest collection, then persist once.
      // Confirmation, cancellation and failed writes cannot leave an empty group.
      const newGroupId = newGroupName ? crypto.randomUUID() : undefined;
      const base = newGroupName && newGroupId
        ? addGroupToState(loaded.state, newGroupName, "folder", newGroupId,
          new Date().toISOString(), undefined, quickWorkspace)
        : loaded.state;
      const targetGroup = newGroupId
        ? base.groups.find((group) => group.id === newGroupId)
        : chosenGroup;
      if (!targetGroup) throw new Error("No destination group available");
      const values = {
        name: existing && !quickNameEdited.current ? existing.name : quickName.trim(),
        url: quickUrl,
        groupId: targetGroup.id,
        note: existing && !quickNoteEdited.current ? existing.note : quickNote.trim(),
        customIconUrl: existing?.customIconUrl ?? "",
        iconSource: existing?.iconSource ?? "auto" as const,
      };
      const next = existing
        ? updateSiteInState(base, existing.id, values)
        : addSiteToState(base, values);
      await saveNextState(next);
      quickNameEdited.current = false;
      quickNoteEdited.current = false;
      quickGroupEdited.current = false;
      setQuickName(values.name);
      setQuickNote(values.note ?? "");
      setQuickGroupId(targetGroup.id);
      setRecentGroupId(targetGroup.id);
      savePopupPreferences(quickWorkspace === "github"
        ? { lastGithubGroupId: targetGroup.id } : { lastMainGroupId: targetGroup.id });
      cancelQuickGroup();
      setNotice({
        kind: "success",
        text: newGroupName
          ? existing ? `已新建“${newGroupName}”，并移动更新现有收藏。` : `已新建“${newGroupName}”，并添加当前网站。`
          : existing
          ? existing.groupId === targetGroup.id ? "已更新现有收藏。"
            : quickWorkspace === "github"
            ? "已移动并更新 GitHub 收藏。"
            : "已移动并更新现有收藏。"
          : quickWorkspace === "github"
            ? "当前 GitHub 页面已添加到 GitHub 收藏。"
            : isGithubHomeUrl(quickUrl ?? "")
              ? "GitHub 官方主页已添加，并会显示在 GitHub 顶部。"
              : "已添加到主页。",
      });
    } catch {
      setNotice({ kind: "error", text: "保存失败，请稍后重试。" });
    } finally {
      quickSaving.current = false;
      setBusy(false);
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

  const homeUrl = api?.runtime?.getURL?.("/index.html") ?? "/index.html";
  const managementUrl = `${homeUrl}?data=bookmarks`;
  const targetLabel = quickWorkspace === "github" ? "收藏到 GitHub 分组" : "收藏到分组";

  return (
    <main className={`popup-shell is-${tab}`}>
      <header className="popup-header">
        <div className="popup-brand-row">
          <div className="popup-brand">
            <span className="popup-brand-mark"><SquaresFour size={18} weight="bold" aria-hidden="true" /></span>
            <span>Mysimple</span>
          </div>
          <a className="popup-open-home" href={homeUrl} target="_blank" rel="noopener noreferrer" aria-label="打开收藏主页">
            管理 <ArrowSquareOut size={15} aria-hidden="true" />
          </a>
        </div>
        <nav className="popup-tabs" aria-label="工具栏功能">
          <button type="button" className={tab === "quick" ? "active" : ""} aria-current={tab === "quick" ? "page" : undefined} onClick={() => setTab("quick")}>
            <Plus size={17} weight="bold" />快速收藏
          </button>
          <button type="button" className={tab === "bookmarks" ? "active" : ""} aria-current={tab === "bookmarks" ? "page" : undefined} onClick={() => setTab("bookmarks")}>
            <BookmarkSimple size={17} />浏览器书签
          </button>
        </nav>
      </header>

      {notice && <div className={`popup-notice ${notice.kind}`} role="status">{notice.text}</div>}

      {tab === "quick" ? (
        <section className="popup-page quick-page" aria-label="快速收藏">
          <div className="popup-form-card">
            <div className="popup-card-heading">
              <h1>当前网页</h1>
              {duplicate && <span className="popup-status-chip">已收藏</span>}
            </div>
            <div className="popup-site-identity" data-testid="popup-site-identity">
              {quickSitePreview && (
                <span className="popup-target-icon" data-testid="popup-target-icon">
                  <Favicon site={quickSitePreview} size="large" />
                </span>
              )}
              <div className="popup-site-name">
                <input
                  value={quickName}
                  aria-label="网站名称"
                  disabled={!quickUrl || busy}
                  maxLength={120}
                  placeholder={quickUrl ? "输入网站名称" : "此页面不可收藏"}
                  onChange={(event) => {
                    quickNameEdited.current = true;
                    setQuickName(event.target.value);
                    setQuickDuplicateId(undefined);
                  }}
                />
                {quickUrl && <span className="popup-site-domain" title={quickUrl}>{getHostname(quickUrl)}</span>}
              </div>
            </div>
            <div className={`popup-group-picker ${creatingQuickGroup ? "is-creating" : ""}`}>
              <div className="popup-group-heading">
                <span className="popup-group-label">{targetLabel}</span>
                <button type="button" ref={quickGroupTrigger} className="popup-new-group-trigger"
                  disabled={!quickUrl || busy} aria-expanded={creatingQuickGroup} aria-controls={quickGroupNameId}
                  onClick={() => {
                    if (creatingQuickGroup) cancelQuickGroup();
                    else {
                      setCreatingQuickGroup(true);
                      setQuickGroupError("");
                      setQuickDuplicateId(undefined);
                    }
                  }}>
                  <Plus size={13} weight="bold" />新建分组
                </button>
              </div>
              <PopupTargetSelect groups={groups} value={creatingQuickGroup ? "" : quickGroupId} label={targetLabel}
                disabled={!quickUrl || busy} onChange={groupId => {
                  cancelQuickGroup();
                  quickGroupEdited.current = true;
                  setQuickGroupId(groupId);
                }} />
              {!creatingQuickGroup && quickGroupId && quickGroupId === recentGroupId && <span className="popup-target-help">最近使用的分组</span>}
              {creatingQuickGroup && <div className="popup-new-group" id={quickGroupNameId}>
                <div className="popup-new-group-row">
                  <label className="popup-field">
                    <input ref={quickGroupInput} aria-label="新分组名称" placeholder="输入新分组名称"
                      value={quickGroupName} disabled={busy} aria-invalid={Boolean(quickGroupError)}
                      aria-describedby={quickGroupError ? `${quickGroupNameId}-error` : undefined}
                      onChange={event => {
                        setQuickGroupName(event.target.value);
                        setQuickGroupError("");
                        setQuickDuplicateId(undefined);
                      }}
                      onKeyDown={event => {
                        if (event.nativeEvent.isComposing || busy) return;
                        if (event.key === "Escape") { event.preventDefault(); cancelQuickGroup(true); }
                        else if (event.key === "Enter") { event.preventDefault(); void handleQuickAdd(); }
                      }} />
                  </label>
                  <button type="button" className="popup-new-group-cancel" disabled={busy}
                    aria-label="取消新建分组" onClick={() => cancelQuickGroup(true)}>取消</button>
                </div>
                {quickGroupError && <p id={`${quickGroupNameId}-error`} className="popup-group-error" role="alert">{quickGroupError}</p>}
              </div>}
            </div>
            <label className="popup-note-field">
              <span>网站备注</span>
              <textarea aria-label="网站备注" value={quickNote} disabled={!quickUrl || busy}
                rows={2} maxLength={2000} placeholder="添加备注（可选）"
                onChange={event => {
                  quickNoteEdited.current = true;
                  setQuickNote(event.target.value);
                }} />
            </label>
            {duplicate && quickDuplicateId && (
              <div className="duplicate-popup-notice">
                <Warning size={18} />
                <span>已收藏在“{getGroupPath(state.groups, duplicate.groupId) || "其他"}”。{creatingQuickGroup
                  ? `再次确认会新建“${quickGroupName.trim()}”并移动网站。`
                  : "再次确认会保存对现有收藏的修改。"}</span>
              </div>
            )}
            <button
              type="button"
              className="popup-primary"
              disabled={!quickUrl || !quickName.trim() || (creatingQuickGroup ? !quickGroupName.trim() : !quickGroupId) || busy}
              onClick={handleQuickAdd}
            >
              {creatingQuickGroup ? <Plus size={18} weight="bold" />
                : duplicate ? <PencilSimple size={17} /> : <BookmarkSimple size={17} weight="bold" />}
              {creatingQuickGroup
                ? duplicate && quickDuplicateId ? "确认新建并移动" : "新建分组并添加"
                : duplicate && quickDuplicateId
                ? "确认移动并更新"
                : duplicate
                  ? "保存修改"
                  : "收藏当前网页"}
            </button>
          </div>
        </section>
      ) : (
        <section className="popup-page bookmarks-page" aria-label="浏览器书签">
          {!api?.bookmarks ? (
            <div className="popup-empty">扩展缺少书签权限，请重新加载扩展。</div>
          ) : (
            <>
              <div className="bookmark-toolbar">
                <label className="bookmark-search">
                  <MagnifyingGlass size={16} />
                  <input
                    value={bookmarkQuery}
                    disabled={busy}
                    onChange={(event) => changeBookmarkQuery(event.target.value)}
                    placeholder="搜索书签或网址"
                    aria-label="搜索书签或网址"
                  />
                </label>
                <button type="button" className="bookmark-refresh" title="刷新书签" aria-label="刷新书签" disabled={busy} onClick={() => void refreshBookmarks()}>
                  <ArrowClockwise size={17} />
                </button>
              </div>
              <div className="bookmark-list-heading">
                <div className="bookmark-location">
                  {!bookmarkQuery.trim() && bookmarkPathNodes.length > 0 && (
                    <button
                      type="button"
                      className="bookmark-back"
                      aria-label="返回上一级书签文件夹"
                      title="返回上一级"
                      onClick={backBookmarkFolder}
                    >
                      <ArrowLeft size={15} />
                    </button>
                  )}
                  {bookmarkQuery.trim() ? <span>搜索结果</span> : (
                    <nav className="bookmark-breadcrumbs" ref={bookmarkBreadcrumbRef} aria-label="书签文件夹路径">
                      {bookmarkPathNodes.length > 0
                        ? <button type="button" onClick={() => goToBookmarkAncestor(0)}>全部书签</button>
                        : <span aria-current="page">全部书签</span>}
                      {bookmarkPathNodes.map((node, index) => {
                        const label = node.title || "未命名文件夹";
                        return <span className="bookmark-crumb" key={node.id}>
                          <CaretRight size={11} aria-hidden="true" />
                          {index === bookmarkPathNodes.length - 1 ? <span title={label} aria-current="page">{label}</span>
                            : <button type="button" title={label} onClick={() => goToBookmarkAncestor(index + 1)}>{label}</button>}
                        </span>;
                      })}
                    </nav>
                  )}
                </div>
                <span className={`bookmark-selection-count ${selectedBookmarkCount ? "has-selection" : ""}`} aria-live="polite">
                  已选择 <strong>{selectedBookmarkCount}</strong> 项
                </span>
                <button
                  type="button"
                  className="select-visible"
                  disabled={visibleIds.size === 0 || busy}
                  onClick={toggleVisibleBookmarks}
                >
                  {allVisibleSelected ? "取消全选" : "全选结果"}
                </button>
              </div>
              <div className="bookmark-tree" aria-label={currentBookmarkFolder ? `${currentBookmarkFolder.title}中的书签` : "浏览器书签列表"}>
                {visibleBookmarkTiles.length ? (
                  <ul className="bookmark-grid">
                    {visibleBookmarkTiles.map((node) => (
                      <BookmarkTile
                        key={node.id}
                        node={node}
                        selectedIds={selectedIds}
                        disabled={busy}
                        folderIcons={folderIcons}
                        onToggleSelect={toggleBookmarkSelection}
                        onOpenFolder={openBookmarkFolder}
                      />
                    ))}
                  </ul>
                ) : <div className="popup-empty">{bookmarkQuery.trim() ? "没有匹配的浏览器书签" : currentBookmarkFolder ? "此文件夹中没有书签" : "没有浏览器书签"}</div>}
              </div>
              <div className="bookmark-footer">
                <div className="bookmark-destination">
                  <span className="popup-group-label">导入到分组</span>
                  <PopupTargetSelect groups={mainGroups} value={bookmarkGroupId} label="导入到分组"
                    disabled={busy} placement="top" onChange={setBookmarkGroupId} />
                </div>
                <div className="bookmark-footer-actions">
                  <a className="popup-bookmark-manage" href={managementUrl} target="_blank" rel="noopener noreferrer">
                    完整书签管理 <ArrowSquareOut size={14} aria-hidden="true" />
                  </a>
                  <button type="button" className="popup-primary compact" disabled={!selectedBookmarkCount || !bookmarkGroupId || busy} onClick={handleImportBookmarks}>
                    <Plus size={16} />导入所选
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <footer className="popup-footer">{tab === "quick" ? "收藏保存在本机" : "导入只复制链接 · 保留目录可在完整书签管理中预览"}</footer>
    </main>
  );
}
