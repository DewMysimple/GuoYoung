import { DataWorkspace, type DataWorkspaceContext } from "./components/data-workspace";
import { WorkspaceSearch } from "./components/workspace-search";
import { TopbarResizeHandle } from "./components/topbar-resize-handle";
import { patchAppearance } from "./lib/appearance-settings";
import { appearanceScale, scaledGeometry, cardLayoutVariables, getMinimumCardWidth } from "./lib/layout";
import { useSettingsPanelLayout } from "./hooks/use-settings-panel-layout";
import { LayoutSettingsContext } from "./components/site-grid-layout";
import { typographyVariables } from "./lib/typography";
import { useLocalFont } from "./hooks/use-local-font";
import { wallpaperGlassStyle } from "./lib/wallpaper-glass";
import { useTextSelection } from "./hooks/use-text-selection";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import {
  DndContext,
  DragOverlay,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  ArrowLeft,
  Database,
  ArrowsDownUp,
  CaretDown,
  CheckSquare,
  ClockCounterClockwise,
  FolderOpen,
  FolderPlus,
  GearSix,
  GithubLogo,
  House,
  LinkSimple,
  Plus,
  Rows,
  SquaresFour,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useReducedMotion } from "framer-motion";
import type { SiteHubStore } from "./lib/state-store";
import { BrandMark } from "./components/brand-mark";
import { BrowserHistoryView } from "./components/browser-history-view";
import { ConfirmDialog } from "./components/confirm-dialog";
import { GroupDialog } from "./components/group-dialog";
import {
  GroupDropTab,
} from "./components/group-drop-target";
import { NewGroupDialog } from "./components/new-group-dialog";
import { MoveSitesDialog } from "./components/move-sites-dialog";
import { FolderCardDragPreview } from "./components/folder-card";
import "./components/folder-navigation.css";
import { GroupSortDragPreview } from "./components/group-sort-preview";
import { GithubHomeEntry } from "./components/github-home-entry";
import { GithubRepositoryImportDialog } from "./components/github-repository-import-dialog";
import { useGithubRepositoryWorkflow } from "./app/hooks/use-github-repository-workflow";
import { useCollectionSearchSession } from "./app/hooks/use-collection-search-session";
import { SelectMenu } from "./components/select-menu";
import { GithubRefreshDetailsDialog } from "./components/github-refresh-details-dialog";
import { GroupedCollection } from "./components/grouped-collection";
import { CollectionSiteGrid } from "./components/collection-site-grid";
import {
  SettingsPanel,
  type SettingsDraft,
  type SettingsSection,
} from "./components/settings-panel";
import {
  SiteCard,
  SiteCardDragPreview,
  type SiteDragMode,
} from "./components/site-card";
import { SiteDialog } from "./components/site-dialog";
import { OTHER_GROUP_ID } from "./data/defaults";
import { useSiteHub } from "./hooks/use-site-hub";
import { useGroupSorting } from "./hooks/use-group-sorting";
import { useSiteDragging } from "./hooks/use-site-dragging";
import { useSiteClickGuard } from "./hooks/use-site-click-guard";
import { useLatestEvent } from "./hooks/use-latest-event";
import { groupSortTabId, readGroupSortId } from "./lib/collection-drag-ids";
import { CollectionMouseSensor, CollectionTouchSensor, GROUP_SORT_ACTIVATION_DISTANCE, SITE_DRAG_ACTIVATION_DISTANCE } from "./lib/collection-drag-sensors";
import { useCollectionSelection } from "./hooks/use-collection-selection";
import { useSweepSelection } from "./hooks/use-sweep-selection";
import { useTheme } from "./hooks/use-theme";
import { useWallpaper } from "./hooks/use-wallpaper";
import { dismissWallpaperStartup } from "./lib/wallpaper-startup";
import { getChromiumExtensionApi, isExtensionEnvironment } from "./lib/browser-runtime";
import {
  requestHistoryPermission,
  type BrowserHistoryPermissionResult,
} from "./lib/browser-history";
import type { DroppedSitePreview } from "./lib/external-link-drop";
import {
  groupSortIntentFromTargetIndex,
} from "./lib/group-sort";
import {
  filterSites,
  sortSitesByHeat,
} from "./lib/site-utils";
import { getGroupedSiteSections } from "./lib/grouped-sites";
import {
  canParentGroup,
  getChildGroups,
  getGroupEntries,
  getGroupPath,
  getGroupSiteCounts,
  getGroupSubtreeIds,
  getRootGroups,
  siteEntryId,
  type CollectionEntry,
} from "./lib/group-hierarchy";
import type {
  CategoryIcon as GroupIconName,
  SiteFormValues,
  SiteGroup,
  SiteItem,
  SiteSortMode,
  SiteWorkspace,
} from "./types";
import {
  findGithubHomeSite,
  getGroupWorkspace,
  getWorkspaceGroups,
  isGithubHomeUrl,
  isGithubUrl,
} from "./lib/github-workspace";

type GroupFilter = "all" | string;
type CollectionHistoryLocation = {
  workspace: SiteWorkspace;
  groupId: GroupFilter;
  parentId?: string;
  originGroupId?: GroupFilter;
  scrollTop?: number;
};

function readCollectionLocation(historyState: unknown): CollectionHistoryLocation | undefined {
  const entry = historyState as { siteHubLayer?: string; collectionLocation?: CollectionHistoryLocation } | null;
  if (!entry?.siteHubLayer) return entry?.collectionLocation;
}

function replaceCollectionLocation(location: CollectionHistoryLocation | undefined) {
  window.history.replaceState({ ...window.history.state, collectionLocation: location }, "");
}

function hasBookmarkImportLink() {
  return new URLSearchParams(window.location.search).get("data") === "bookmarks";
}

const SORT_OPTIONS: Array<{ value: SiteSortMode; label: string }> = [
  { value: "manual", label: "手动排列" },
  { value: "name-asc", label: "名称 A–Z" },
  { value: "name-desc", label: "名称 Z–A" },
  { value: "newest", label: "最近添加" },
  { value: "oldest", label: "最早添加" },
  { value: "heat", label: "热量排列" },
];

export function App({ store }: { store?: SiteHubStore } = {}) {
  const {
    state,
    isLoading,
    recovered,
    storageError,
    retrySave,
    storageMode,
    addSite,
    updateSite,
    recordSiteClick,
    deleteSite,
    restoreSite,
    restoreAllSites,
    permanentlyDeleteSite,
    emptyTrash,
    setTrashRetentionDays,
    commitSites,
    commitGroupEntries,
    moveSites,
    addGroup,
    updateGroup,
    reorderGroups,
    reorderGroupBlock,
    deleteGroup,
    deleteGroups,
    importData,
    dataImport,
    importGithubRepositories,
    importGithubRepositoryBatch,
    migrateGithubSites,
    reset,
    saveSettings,
    recordSearch,
    deleteSearchHistory,
    clearSearchHistory,
    setDisplayMode,
    setSortMode: persistSortMode,
  } = useSiteHub(store);
  const [settingsPreview, setSettingsPreview] =
    useState<SettingsDraft | null>(null);
  const [interfaceScaleAtDragStart, setInterfaceScaleAtDragStart] = useState<number | null>(null);
  const effectiveBrand = settingsPreview?.brand ?? state.brand;
  const effectiveAppearance =
    settingsPreview?.appearance ?? state.appearance;
  const localFont = useLocalFont(effectiveAppearance);
  const effectiveWallpaper =
    settingsPreview?.wallpaper ?? state.wallpaper;
  useTheme(effectiveAppearance.theme, effectiveAppearance.accentColor);
  const { imageUrl: wallpaperUrl, error: wallpaperError, pending: wallpaperPending } =
    useWallpaper(effectiveWallpaper);
  const presented = useRef(false);
  const waitingForWallpaper = !presented.current && wallpaperPending && !wallpaperUrl;
  useLayoutEffect(() => {
    if (isLoading || waitingForWallpaper) return;
    presented.current = true;
    if (!wallpaperUrl) dismissWallpaperStartup();
  }, [isLoading, waitingForWallpaper, wallpaperUrl]);
  useLayoutEffect(() => {
    if (!wallpaperUrl) return;
    const root = document.documentElement;
    // Viewport units can already exclude a persistent root scrollbar. Measure
    // its real width instead so wallpaper reaches the edge and search stays centered.
    const update = () => root.style.setProperty("--page-scrollbar-width", `${window.innerWidth - root.clientWidth}px`);
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      root.style.removeProperty("--page-scrollbar-width");
    };
  }, [wallpaperUrl]);
  const reduceMotion = useReducedMotion();
  const [activeGroupId, setActiveGroupId] = useState<GroupFilter>(
    () => readCollectionLocation(window.history.state)?.groupId ?? "all",
  );
  const [collectionReveal, setCollectionReveal] = useState<{ scrollTop: number; focus?: boolean }>();
  const collectionTitleRef = useRef<HTMLHeadingElement>(null);
  const [sitesToMove, setSitesToMove] = useState<string[]>([]);
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [dialogGroupId, setDialogGroupId] = useState<string>();
  const [dialogWorkspace, setDialogWorkspace] = useState<SiteWorkspace>("main");
  const [siteDialogPrefill, setSiteDialogPrefill] = useState<
    DroppedSitePreview | undefined
  >();
  const [newGroupDialogOpen, setNewGroupDialogOpen] = useState(false);
  const [newGroupBeforeId, setNewGroupBeforeId] = useState<string>();
  const [newGroupParentId, setNewGroupParentId] = useState<string>();
  const [newGroupInsertionContext, setNewGroupInsertionContext] = useState<{
    groupName: string;
    position: "before" | "after";
  }>();
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [managedGroupId, setManagedGroupId] = useState<string>();
  const extension = getChromiumExtensionApi();
  const hasBrowserBookmarks = isExtensionEnvironment(extension) && Boolean(extension?.bookmarks);
  const [dataContext, setDataContext] = useState<DataWorkspaceContext | null>(
    () => hasBrowserBookmarks && hasBookmarkImportLink() ? { mode: "bookmarks" } : null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsSection>();
  const [settingsInitialTrashOpen, setSettingsInitialTrashOpen] =
    useState(false);
  const [editingSite, setEditingSite] = useState<SiteItem | null>(null);
  const [armedDeleteSiteId, setArmedDeleteSiteId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [transferNotice, setTransferNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [dragSitesPreview, setDragSitesPreview] = useState<SiteItem[] | null>(
    null,
  );
  const [browserHistoryOpen, setBrowserHistoryOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<SiteWorkspace>(
    () => readCollectionLocation(window.history.state)?.workspace ?? "main",
  );
  const [historyPermissionVersion, setHistoryPermissionVersion] = useState(0);
  const [historyPermissionError, setHistoryPermissionError] = useState<string | null>(
    null,
  );
  const {
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
  } = useCollectionSearchSession({
    activeWorkspace,
    activeGroupId,
    groups: state.groups,
    searchHistory: state.searchHistory,
    setActiveWorkspace,
    setActiveGroupId,
    recordSearch,
    onNotice: setTransferNotice,
  });
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const {
    githubImportOpen,
    githubImportInitialUrl,
    githubImportPreview,
    githubImportLoading,
    githubImportConfirming,
    githubImportError,
    githubBulkRefreshLoading,
    githubRefreshReport,
    openGithubRepositoryImport,
    handleGithubRepositoryRead,
    handleGithubRepositoryConfirm,
    closeGithubRepositoryImport,
    openGithubRefresh,
    handleGithubHomeRefresh,
    closeGithubRefreshReport,
  } = useGithubRepositoryWorkflow({
    groups: state.groups,
    importGithubRepositories,
    importGithubRepositoryBatch,
    onSelectGroup: selectGroup,
    onNotice: setTransferNotice,
    onCloseAddMenu: () => setAddMenuOpen(false),
  });
  const addMenuRef = useRef<HTMLDivElement>(null);
  const armedDeleteTimerRef = useRef<number | null>(null);
  const sortMode: SiteSortMode =
    state.sortModeByWorkspace[activeWorkspace] ?? state.sortMode ?? "manual";

  const handlePopState = useLatestEvent((event: PopStateEvent) => {
      const layer = event.state?.siteHubLayer;
      if (layer === "data" || (!layer && hasBrowserBookmarks && hasBookmarkImportLink())) {
        setDataContext(layer === "data" ? event.state.dataContext ?? { mode: "import" } : { mode: "bookmarks" });
        setBrowserHistoryOpen(false);
        return;
      }
      setDataContext(null);
      if (
        event.state?.siteHubLayer === "browser-history" ||
        event.state?.siteHubLayer === "history-detail"
      ) {
        setBrowserHistoryOpen(true);
        return;
      }
      const location = readCollectionLocation(event.state);
      if (location) {
        // Returning from the data layer keeps the search session open over its
        // original folder, just as it does over a first-level collection.
        if (dataContext && query.trim() && location.workspace === activeWorkspace) return;
        resetCollectionQuery();
        dismissHistory();
        cancelSelection();
        setBrowserHistoryOpen(false);
        setActiveWorkspace(location.workspace);
        setActiveGroupId(location.groupId);
        setCollectionReveal({ scrollTop: location.scrollTop ?? 0, focus: Boolean(location.parentId) });
        return;
      }
      if (browserHistoryOpen) {
        setBrowserHistoryOpen(false);
        setActiveWorkspace("main");
      }
  });
  useEffect(() => {
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handlePopState]);

  const workspaceGroups = useMemo(
    () => getWorkspaceGroups(state.groups, activeWorkspace),
    [activeWorkspace, state.groups],
  );
  const groups = useMemo(() => getRootGroups(workspaceGroups), [workspaceGroups]);
  const defaultGroup =
    groups.find((group) => !group.isProtected) ??
    groups.find((group) => group.id === OTHER_GROUP_ID) ??
    groups[0];
  const activeGroup =
    activeGroupId === "all"
      ? undefined
      : workspaceGroups.find((group) => group.id === activeGroupId);
  const activeParent = groups.find(group => group.id === activeGroup?.parentId);
  const activeGithubImportGroup =
    activeWorkspace === "github" && activeGroup?.githubImportSource
      ? activeGroup
      : undefined;
  const workspaceGroupIds = useMemo(
    () => new Set(workspaceGroups.map((group) => group.id)),
    [workspaceGroups],
  );
  const workspaceSites = useMemo(
    () => state.sites.filter(
      (site) =>
        workspaceGroupIds.has(site.groupId) &&
        !(activeWorkspace === "github" && isGithubHomeUrl(site.url)),
    ),
    [activeWorkspace, state.sites, workspaceGroupIds],
  );
  const renderedSites = useMemo(
    () =>
      (dragSitesPreview ?? state.sites).filter((site) =>
        workspaceGroupIds.has(site.groupId) &&
        !(activeWorkspace === "github" && isGithubHomeUrl(site.url)),
      ),
    [activeWorkspace, dragSitesPreview, state.sites, workspaceGroupIds],
  );
  const isGlobalCollectionSearch = Boolean(query.trim());
  const siteCounts = useMemo(
    () => getGroupSiteCounts(workspaceGroups, workspaceSites),
    [workspaceGroups, workspaceSites],
  );
  const searchGroups = isGlobalCollectionSearch ? state.groups : workspaceGroups;
  const searchSites = isGlobalCollectionSearch
    ? state.sites.filter(
        (site) => !(activeWorkspace === "github" && isGithubHomeUrl(site.url)),
      )
    : activeGroupId === "all" && groups.length !== workspaceGroups.length
      ? renderedSites.filter(site => groups.some(group => group.id === site.groupId))
      : renderedSites;
  const githubHomeSite = useMemo(
    () => findGithubHomeSite(state.sites) ?? null,
    [state.sites],
  );
  const scopedSites = useMemo(
    () =>
      filterSites(
        searchSites,
        query,
        searchGroups,
        isGlobalCollectionSearch ? "all" : activeGroupId,
      ),
    [activeGroupId, isGlobalCollectionSearch, query, searchGroups, searchSites],
  );
  const visibleSites = useMemo(() => {
    if (isGlobalCollectionSearch || sortMode === "manual") return scopedSites;
    const sortGroupId = isGlobalCollectionSearch ? "all" : activeGroupId;
    if (sortMode === "heat") return sortSitesByHeat(scopedSites, sortGroupId);
    return [...scopedSites].sort((a, b) => {
      if (sortMode === "name-asc") {
        return a.name.localeCompare(b.name, "zh-CN", { sensitivity: "base" });
      }
      if (sortMode === "name-desc") {
        return b.name.localeCompare(a.name, "zh-CN", { sensitivity: "base" });
      }
      const first = Date.parse(a.createdAt);
      const second = Date.parse(b.createdAt);
      return sortMode === "newest" ? second - first : first - second;
    });
  }, [activeGroupId, isGlobalCollectionSearch, scopedSites, sortMode]);
  const isSearching = Boolean(query.trim());
  const isGroupedView =
    !isGlobalCollectionSearch &&
    activeGroupId === "all" &&
    state.displayModeByWorkspace[activeWorkspace] === "grouped";
  const addCardGroup = activeGroup ?? defaultGroup;
  const groupedSections = useMemo(
    () => getGroupedSiteSections(groups, visibleSites, sortMode, isSearching).map(section => ({
      ...section,
      count: siteCounts.get(section.group.id) ?? 0,
      entries: getChildGroups(workspaceGroups, section.group.id).length
        ? getGroupEntries(section.group, workspaceGroups, section.sites, sortMode)
        : undefined,
    })),
    [groups, isSearching, siteCounts, sortMode, visibleSites, workspaceGroups],
  );
  const flatEntries = useMemo((): CollectionEntry[] | undefined => {
    if (isSearching || isGroupedView) return;
    if (activeGroup) {
      if (getChildGroups(workspaceGroups, activeGroup.id).length) {
        return getGroupEntries(activeGroup, workspaceGroups, visibleSites, sortMode);
      }
      return;
    }
    const folders = groups.flatMap(group =>
      getGroupEntries(group, workspaceGroups, [], sortMode).filter(entry => entry.kind === "folder"),
    );
    if (!folders.length) return;
    const sites = visibleSites.map(site => ({ kind: "site" as const, id: siteEntryId(site.id), site }));
    return sortMode === "manual" ? [...sites, ...folders] : [...folders, ...sites];
  }, [activeGroup, groups, isGroupedView, isSearching, sortMode, visibleSites, workspaceGroups]);
  const selectableSiteIds = useMemo(
    () =>
      isGroupedView
        ? groupedSections.flatMap(({ sites }) => sites.map((site) => site.id))
        : visibleSites.map((site) => site.id),
    [groupedSections, isGroupedView, visibleSites],
  );
  const selection = useCollectionSelection({
    sites: state.sites,
    groups,
    orderedSiteIds: selectableSiteIds,
    isGroupedView,
    isSearching,
  });
  const {
    selectionMode, selectedSiteIds, selectedGroupIds, cancelSelection,
  } = selection;
  const selectionArmed = selectionMode !== "none";
  const multiSelectMode = selectionMode === "sites";
  const groupSelectionActive = selectedGroupIds.size > 0;
  const groupSelectionMode = isGroupedView && selectionMode === "groups";
  const dragDisabled = isSearching || selectionArmed;
  const canReorderSites = sortMode === "manual";
  const siteDragMode: SiteDragMode = dragDisabled
    ? "disabled"
    : canReorderSites
      ? "reorder"
      : "transfer";
  const anyModalOpen =
    siteDialogOpen ||
    newGroupDialogOpen ||
    groupDialogOpen ||
    githubImportOpen ||
    sitesToMove.length > 0 ||
    Boolean(githubRefreshReport) ||
    settingsOpen ||
    resetOpen ||
    Boolean(dataContext);
  const { armSiteClickSuppression, handlers: siteClickHandlers } = useSiteClickGuard();
  const sweepSelection = useSweepSelection({ enabled: multiSelectMode && !anyModalOpen,
    itemSelector: "[data-site-dnd-id]", idAttribute: "data-site-dnd-id",
    ignoreSelector: ".card-actions", onToggle: selection.toggleSitesSelection });
  const groupSort = useGroupSorting({ groups, selection, reorderGroups, reorderGroupBlock,
    onStart: () => { clearArmedDelete(); cancelGroupManagementForSort(); },
  });
  const { beginGroupSort, finishGroupSort, detectGroupSortCollisions, updateKeyboardGroupSortIntent,
    handleGroupTabDragStart, handleGroupTabDragOver, handleGroupTabDragEnd } = groupSort;
  const { pendingDragId, activeDragId, overDragId, dragHoverGroupId, originGroupId,
    activeDraggedFolder, folderDragIds,
    activeDraggedSite, setPendingDragId, activeCollisionDetection: siteCollisionDetection,
    handleDragStart, handleDragOver, handleDragEnd, handleDragCancel,
  } = useSiteDragging({ sites: state.sites, groups: state.groups, renderedSites, workspaceGroupIds,
    activeGroupId, isGroupedView, canReorderSites, dragDisabled, setActiveGroupId,
    setDragSitesPreview, commitSites, commitGroupEntries, onCommitGroupNavigation: selectGroup,
    onStart: clearArmedDelete, armSiteClickSuppression });
  const activeCollisionDetection: CollisionDetection = args => args.active.data.current?.type === "group-row-sort"
    ? detectGroupSortCollisions(args, "vertical") : siteCollisionDetection(args);
  const activeDraggedGroup = activeDraggedSite ? workspaceGroups.find(group => group.id === activeDraggedSite.groupId) : undefined;
  const activeGroupSortId = groupSort.view?.activeId ?? null;
  const activeGroupSortAxis = groupSort.view?.axis ?? null;
  const groupSortIntent = groupSort.view?.intent ?? null;
  const activeSortedGroup = activeGroupSortId
    ? groups.find((group) => group.id === activeGroupSortId)
    : undefined;
  const activeSortedGroupCount = activeSortedGroup
    ? siteCounts.get(activeSortedGroup.id) ?? 0
    : 0;
  const groupSortAnnouncement = groupSortIntent
    ? `将${activeSortedGroup?.name ?? "分组"}移动到${
        groupSortIntent.beforeGroupId
          ? `${groups.find((group) => group.id === groupSortIntent.beforeGroupId)?.name ?? "目标分组"}之前`
          : "普通分组末尾"
      }`
    : activeSortedGroup
      ? `${activeSortedGroup.name}保持原位置`
      : "";
  const groupSortDisabled =
    isSearching ||
    multiSelectMode ||
    (groupSelectionMode && !groupSelectionActive) ||
    Boolean(activeDragId) ||
    anyModalOpen;

  useEffect(() => () => {
    if (armedDeleteTimerRef.current !== null) window.clearTimeout(armedDeleteTimerRef.current);
  }, []);

  const gridDrag = { activeId: activeDragId, overId: overDragId, originGroupId,
    pendingId: pendingDragId, folderIds: folderDragIds,
    reorder: canReorderSites && !multiSelectMode, disabled: dragDisabled };
  const allVisibleSitesSelected = selectableSiteIds.length > 0 && selectableSiteIds.every(id => selectedSiteIds.has(id));

  useEffect(() => {
    if (isLoading || activeGroupId === "all") return;
    const location = readCollectionLocation(window.history.state);
    const expectedParent = location?.groupId === activeGroupId ? location.parentId : undefined;
    if (activeGroup && (!expectedParent || activeGroup.parentId === expectedParent)) return;
    const groupId = groups.some(group => group.id === expectedParent) ? expectedParent! : "all";
    setActiveGroupId(groupId);
    if (location?.groupId === activeGroupId) replaceCollectionLocation({ workspace: activeWorkspace, groupId });
  }, [activeGroup, activeGroupId, activeWorkspace, groups, isLoading]);

  useLayoutEffect(() => {
    if (!collectionReveal || isLoading || dataContext || browserHistoryOpen) return;
    if (collectionReveal.focus) collectionTitleRef.current?.focus({ preventScroll: true });
    const root = document.documentElement;
    const grid = sweepSelection.containerRef.current;
    if (!collectionReveal.scrollTop || !grid || typeof ResizeObserver === "undefined") {
      root.scrollTop = collectionReveal.scrollTop;
      setCollectionReveal(undefined);
      return;
    }
    // Group grids can change row count once they measure their real width.
    // Keep the recorded position through that layout instead of anchoring to
    // whichever card occupied the same coordinates in the provisional grid.
    const previousAnchor = root.style.overflowAnchor;
    root.style.overflowAnchor = "none";
    root.scrollTop = collectionReveal.scrollTop;
    let timer = 0;
    const settle = () => {
      window.clearTimeout(timer);
      // Scrollbar width and the measured column count can settle in separate
      // renders. Reapply after a quiet layout window, including near the end
      // of a page where the provisional height can clamp the initial scroll.
      timer = window.setTimeout(() => {
        root.scrollTop = collectionReveal.scrollTop;
        setCollectionReveal(undefined);
      }, 120);
    };
    const observer = new ResizeObserver(settle);
    observer.observe(grid);
    settle();
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      root.style.overflowAnchor = previousAnchor;
    };
  }, [browserHistoryOpen, collectionReveal, dataContext, isLoading, sweepSelection.containerRef]);

  useEffect(() => {
    function handleOutsidePointer(event: PointerEvent) {
      if (!addMenuRef.current?.contains(event.target as Node)) {
        setAddMenuOpen(false);
      }
      const deleteButton = (event.target as Element).closest<HTMLElement>(
        "[data-delete-site-id]",
      );
      const inGithubHomeMenu = Boolean(
        (event.target as Element).closest(".github-home-entry-menu"),
      );
      if (
        armedDeleteSiteId &&
        !inGithubHomeMenu &&
        deleteButton?.dataset.deleteSiteId !== armedDeleteSiteId
      ) {
        clearArmedDelete();
      }
      if (selectionArmed && sitesToMove.length === 0) {
        const selectionSurface = (event.target as Element).closest(
          "[data-selection-surface]",
        );
        if (!selectionSurface) {
          cancelSelection();
        }
      }
    }
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setAddMenuOpen(false);
      clearArmedDelete();
      cancelSelection();
    }
    window.addEventListener("pointerdown", handleOutsidePointer);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [armedDeleteSiteId, selectionArmed, cancelSelection, sitesToMove.length]);

  useEffect(() => {
    if (!transferNotice) return;
    const timer = window.setTimeout(() => setTransferNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [transferNotice]);

  const sensors = useSensors(
    useSensor(CollectionMouseSensor, {
      activationConstraint: { distance: SITE_DRAG_ACTIVATION_DISTANCE },
    }),
    useSensor(CollectionTouchSensor, {
      activationConstraint: { distance: SITE_DRAG_ACTIVATION_DISTANCE },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const groupTabSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: GROUP_SORT_ACTIVATION_DISTANCE },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { distance: GROUP_SORT_ACTIVATION_DISTANCE },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function clearArmedDelete() {
    if (armedDeleteTimerRef.current !== null) {
      window.clearTimeout(armedDeleteTimerRef.current);
      armedDeleteTimerRef.current = null;
    }
    setArmedDeleteSiteId(null);
  }

  function requestSiteDelete(site: SiteItem) {
    if (armedDeleteSiteId === site.id) {
      clearArmedDelete();
      deleteSite(site.id);
      setTransferNotice({
        kind: "success",
        message: `“${site.name}”已移入回收站。`,
      });
      return;
    }
    clearArmedDelete();
    setArmedDeleteSiteId(site.id);
    armedDeleteTimerRef.current = window.setTimeout(() => {
      armedDeleteTimerRef.current = null;
      setArmedDeleteSiteId(null);
    }, 2000);
  }

  function toggleSiteSelection(site: SiteItem, shiftKey = false) {
    clearArmedDelete();
    selection.toggleSiteSelection(site, shiftKey);
  }

  function toggleMultiSelectMode() {
    clearArmedDelete();
    selection.toggleMultiSelectMode();
  }

  function toggleGroupedSiteSelection(groupSiteIds: readonly string[]) {
    clearArmedDelete();
    selection.toggleGroupedSiteSelection(groupSiteIds);
  }

  function toggleGroupSelection(groupId: string, shiftKey = false) {
    clearArmedDelete();
    selection.toggleGroupSelection(groupId, shiftKey);
  }

  function enterGroupSelectionFromDoubleClick(groupId: string) {
    clearArmedDelete();
    selection.enterGroupSelectionFromDoubleClick(groupId);
  }

  function renderCollectionCard(site: SiteItem, group: SiteGroup) {
    return (
      <SiteCard
        key={site.id}
        site={site}
        group={group}
        groupLabel={isGlobalCollectionSearch && group.parentId ? getGroupPath(searchGroups, group.id) : undefined}
        showClickCount={sortMode === "heat"}
        showNotes={effectiveAppearance.showSiteNotes}
        workspaceLabel={
          isGlobalCollectionSearch
            ? getGroupWorkspace(group) === "github" ? "GitHub" : "收藏主页"
            : undefined
        }
        dragMode={siteDragMode}
        dragDisabledReason={isSearching ? "搜索时无法排序" : selectionArmed ? "多选时按住并划过卡片选择" : undefined}
        dragPending={pendingDragId === site.id}
        selectionMode={multiSelectMode}
        selectionEntryEnabled={selectionArmed}
        linkInteractionDisabled={groupSelectionMode}
        actionsDisabled={selectionArmed}
        selected={selectedSiteIds.has(site.id)}
        deleteArmed={armedDeleteSiteId === site.id}
        dropTarget={
          canReorderSites && !multiSelectMode && Boolean(activeDragId) &&
          overDragId === site.id && activeDragId !== site.id
        }
        onEdit={openEditDialog}
        onDelete={requestSiteDelete}
        onVisit={(visitedSite) => recordSiteClick(visitedSite.id)}
        onToggleSelected={toggleSiteSelection}
      />
    );
  }

  function reorderManagedGroups(activeId: string, overId: string) {
    const ordinaryGroupIds = groups
      .filter((group) => !group.isProtected)
      .map((group) => group.id);
    const intent = groupSortIntentFromTargetIndex(
      "vertical",
      activeId,
      ordinaryGroupIds,
      ordinaryGroupIds.indexOf(overId),
    );
    if (intent) reorderGroups(activeId, intent.beforeGroupId);
  }

  function handleCollectionDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === "group-row-sort") {
      const groupId = readGroupSortId(String(event.active.id));
      if (groupId) beginGroupSort(groupId, "vertical", event.activatorEvent);
      return;
    }
    handleDragStart(event);
  }

  function handleCollectionDragOver(event: DragOverEvent) {
    if (event.active.data.current?.type === "group-row-sort") {
      updateKeyboardGroupSortIntent(
        event.over ? String(event.over.id) : undefined,
      );
      return;
    }
    handleDragOver(event);
  }

  function handleCollectionDragEnd(event: DragEndEvent) {
    if (event.active.data.current?.type === "group-row-sort") {
      finishGroupSort(true);
      return;
    }
    handleDragEnd(event);
  }

  function handleCollectionDragCancel() {
    if (groupSort.read()?.activeId) {
      finishGroupSort(false);
      return;
    }
    handleDragCancel();
  }

  function openAddDialog(groupId?: string, prefill?: DroppedSitePreview) {
    setAddMenuOpen(false);
    clearArmedDelete();
    const targetGroup =
      workspaceGroups.find((group) => group.id === groupId) ??
      activeGroup ??
      defaultGroup;
    if (!targetGroup) return;
    setEditingSite(null);
    setDialogWorkspace(activeWorkspace);
    setSiteDialogPrefill(prefill);
    setDialogGroupId(targetGroup.id);
    setSiteDialogOpen(true);
  }

  function selectGroup(groupId: GroupFilter) {
    clearArmedDelete();
    if (query.trim()) {
      resetCollectionQuery();
    }
    const location = readCollectionLocation(window.history.state);
    if (location?.workspace === activeWorkspace && location.parentId && location.originGroupId === groupId) {
      window.history.back();
      return;
    }
    if (location) {
      replaceCollectionLocation({ workspace: activeWorkspace, groupId });
    }
    setActiveGroupId(groupId);
    cancelSelection();
  }

  function openFolder(group: SiteGroup) {
    if (!group.parentId || group.id === activeGroupId || activeDragId || selectionArmed) return;
    const previousLocation = readCollectionLocation(window.history.state);
    replaceCollectionLocation({
      ...(previousLocation?.groupId === activeGroupId ? previousLocation : undefined),
      workspace: activeWorkspace, groupId: activeGroupId, scrollTop: window.scrollY,
    });
    const location: CollectionHistoryLocation = {
      workspace: activeWorkspace,
      groupId: group.id,
      parentId: group.parentId,
      originGroupId: activeGroupId,
    };
    window.history.pushState({ ...window.history.state, collectionLocation: location }, "");
    clearArmedDelete();
    if (query.trim()) resetCollectionQuery();
    dismissHistory();
    setActiveGroupId(group.id);
    setCollectionReveal({ scrollTop: 0, focus: true });
  }

  function returnFromFolder() {
    const location = readCollectionLocation(window.history.state);
    if (location?.groupId === activeGroupId && location.originGroupId !== undefined) {
      window.history.back();
      return;
    }
    selectGroup(activeParent?.id ?? "all");
  }

  const folderOriginId = activeParent ? readCollectionLocation(window.history.state)?.originGroupId : undefined;
  const folderReturnLabel = folderOriginId === "all" ? "全部" :
    groups.find(group => group.id === folderOriginId)?.name ?? activeParent?.name;

  const folderActions = {
    onOpen: openFolder,
    onManage: (group: SiteGroup) => openGroupManager(group.id),
    counts: siteCounts,
    groups: workspaceGroups,
  };

  function openGroupManager(groupId?: string) {
    setAddMenuOpen(false);
    setManagedGroupId(groupId);
    cancelSelection();
    setGroupDialogOpen(true);
  }

  function handleGroupDelete(group: SiteGroup, mode: "trash" | "keep" = "trash") {
    const deleted = getGroupSubtreeIds(workspaceGroups, [group.id]);
    const siteCount = state.sites.filter(site => deleted.has(site.groupId)).length;
    deleteGroup(group.id, mode);
    setGroupDialogOpen(false);
    setManagedGroupId(undefined);
    setTransferNotice({
      kind: "success",
      message:
        mode === "keep"
          ? `“${group.name}”已${group.parentId ? "删除" : "解散"}，网站已保留。`
          : siteCount > 0
          ? `“${group.name}”已删除，${siteCount} 个链接已移入回收站。`
          : `“${group.name}”已删除。`,
    });
  }

  function cancelGroupManagementForSort() {
    setGroupDialogOpen(false);
    setManagedGroupId(undefined);
  }

  function openEditDialog(site: SiteItem) {
    clearArmedDelete();
    setEditingSite(site);
    setDialogWorkspace(
      isGithubHomeUrl(site.url) ? "main" : getGroupWorkspace(
        state.groups.find((group) => group.id === site.groupId) ?? {
          workspace: activeWorkspace,
        },
      ),
    );
    setSiteDialogPrefill(undefined);
    setDialogGroupId(
      isGithubHomeUrl(site.url) &&
        getGroupWorkspace(
          state.groups.find((group) => group.id === site.groupId) ?? {
            workspace: activeWorkspace,
          },
        ) === "github"
        ? OTHER_GROUP_ID
        : site.groupId,
    );
    setSiteDialogOpen(true);
  }

  function handleSiteSubmit(
    values: SiteFormValues & { url: string; customIconUrl?: string },
    replaceExistingId?: string,
  ) {
    const editingFromMainGithubWorkspace =
      activeWorkspace === "main" &&
      dialogWorkspace === "github" &&
      Boolean(editingSite);
    if (editingFromMainGithubWorkspace) {
      try {
        if (!isGithubUrl(values.url)) {
          const mainGroups = getWorkspaceGroups(state.groups, "main");
          const fallbackGroup =
            mainGroups.find((group) => group.id === OTHER_GROUP_ID) ??
            mainGroups.find((group) => !group.isProtected) ??
            mainGroups[0];
          if (fallbackGroup && editingSite) {
            updateSite(editingSite.id, { ...values, groupId: fallbackGroup.id });
            setTransferNotice({
              kind: "success",
              message: "已将链接移回收藏主页的“其他”分组。",
            });
            return;
          }
        }
      } catch {
        // SiteDialog performs the final URL validation and will show its error.
      }
    }
    if (editingSite) updateSite(editingSite.id, values);
    else if (replaceExistingId) updateSite(replaceExistingId, values);
    else addSite(values);
  }

  function openNewGroupDialog(
    beforeGroupId?: string,
    insertionContext?: {
      groupName: string;
      position: "before" | "after";
    },
  ) {
    setAddMenuOpen(false);
    setNewGroupParentId(undefined);
    setNewGroupBeforeId(beforeGroupId);
    setNewGroupInsertionContext(insertionContext);
    setNewGroupDialogOpen(true);
  }

  function openNewChildGroupDialog(parent: SiteGroup) {
    if (!canParentGroup(parent, activeWorkspace)) return;
    cancelGroupManagementForSort();
    openNewGroupDialog();
    setNewGroupParentId(parent.id);
  }

  function handleNewGroup(name: string, icon: GroupIconName) {
    const parent = groups.find(group => group.id === newGroupParentId);
    if (newGroupParentId && !canParentGroup(parent, activeWorkspace)) return;
    const id = addGroup(name, icon, newGroupBeforeId, activeWorkspace, newGroupParentId);
    if (id && !newGroupInsertionContext && !newGroupParentId) selectGroup(id);
    setNewGroupBeforeId(undefined);
    setNewGroupParentId(undefined);
    setNewGroupInsertionContext(undefined);
  }

  function openData(mode: DataWorkspaceContext["mode"] = "import", groupId?: string) {
    setGroupDialogOpen(false);
    setSettingsOpen(false);
    setSettingsPreview(null);
    setDataContext({ mode, groupId });
    dismissHistory();
    setAddMenuOpen(false);
    dismissBrowserHistoryLayer();
    document.documentElement.scrollTop = 0;
    window.history.pushState({ ...(window.history.state ?? {}), siteHubLayer: "data", dataContext: { mode, groupId } }, "", window.location.href);
  }

  function openSettingsPanel(
    section?: SettingsSection,
    trashOpen = false,
  ) {
    setSettingsInitialSection(section);
    setSettingsInitialTrashOpen(trashOpen);
    setSettingsOpen(true);
  }

  async function requestBrowserHistoryAccess(): Promise<BrowserHistoryPermissionResult> {
    setHistoryPermissionError(null);
    const result = await requestHistoryPermission();
    if (result.granted) {
      setHistoryPermissionVersion((current) => current + 1);
    } else if (result.error) {
      setHistoryPermissionError(result.error);
    }
    return result;
  }

  function openBrowserHistory() {
    setDataContext(null);
    setActiveWorkspace("main");
    if (!browserHistoryOpen) {
      window.history.pushState(
        { ...(window.history.state ?? {}), siteHubLayer: "browser-history" },
        "",
        window.location.href,
      );
    }
    setBrowserHistoryOpen(true);
    void requestBrowserHistoryAccess();
  }

  function closeBrowserHistory() {
    const layer = window.history.state?.siteHubLayer;
    if (layer === "history-detail") {
      window.history.go(-2);
      return;
    }
    if (layer === "browser-history") {
      window.history.back();
      return;
    }
    setBrowserHistoryOpen(false);
    setActiveWorkspace("main");
  }

  function dismissBrowserHistoryLayer() {
    if (window.history.state?.siteHubLayer || hasBookmarkImportLink()) {
      const url = new URL(window.location.href);
      if (hasBookmarkImportLink()) url.searchParams.delete("data");
      window.history.replaceState(
        { ...(window.history.state ?? {}), siteHubLayer: undefined },
        "",
        url,
      );
    }
    setBrowserHistoryOpen(false);
  }

  function openCollectionHome() {
    setDataContext(null);
    setHistoryPermissionError(null);
    setActiveWorkspace("main");
    setActiveGroupId("all");
    resetCollectionQuery();
    dismissBrowserHistoryLayer();
    if (readCollectionLocation(window.history.state)) replaceCollectionLocation(undefined);
  }

  function openGithubWorkspace() {
    setDataContext(null);
    setHistoryPermissionError(null);
    dismissBrowserHistoryLayer();
    if (readCollectionLocation(window.history.state)) replaceCollectionLocation(undefined);
    setActiveWorkspace("github");
    setActiveGroupId("all");
    resetCollectionQuery();
    cancelSelection();
    migrateGithubSites();
  }

  function openGithubHomeAdd() {
    const mainGroups = getWorkspaceGroups(state.groups, "main");
    const targetGroup =
      mainGroups.find((group) => group.id === OTHER_GROUP_ID) ??
      mainGroups.find((group) => !group.isProtected) ??
      mainGroups[0];
    if (!targetGroup) return;
    setEditingSite(null);
    setDialogWorkspace("main");
    setDialogGroupId(targetGroup.id);
    setSiteDialogPrefill({ name: "GitHub", url: "https://github.com/" });
    setSiteDialogOpen(true);
  }

  const collectionTitle =
    isGlobalCollectionSearch
      ? "全库搜索"
      : activeGroupId === "all"
      ? activeWorkspace === "github"
        ? "全部 GitHub"
        : "全部网站"
      : (activeGroup?.name ?? "网站");
  useTextSelection(effectiveAppearance.allowTextSelection);
  const interfaceScale = appearanceScale(effectiveAppearance);
  const currentInterfaceScale = useRef(interfaceScale);
  currentInterfaceScale.current = interfaceScale;
  const handleInterfaceScaleInteraction = useCallback((active: boolean) => {
    if (active) setInterfaceScaleAtDragStart(current => current ?? currentInterfaceScale.current);
    else setInterfaceScaleAtDragStart(null);
  }, []);
  const interfaceTextScale = interfaceScaleAtDragStart ?? interfaceScale;
  const geometry = scaledGeometry(effectiveAppearance);
  const hasSiteNotes = state.sites.some(site => Boolean(site.note));
  const canPushSettings = useSettingsPanelLayout(settingsOpen, effectiveAppearance, hasSiteNotes);
  const appStyle = {
    ...cardLayoutVariables(effectiveAppearance),
    "--card-safe-width": `${getMinimumCardWidth(effectiveAppearance, hasSiteNotes)}px`,
    "--interface-scale": String(interfaceScale),
    "--font-scale": String(effectiveAppearance.fontScale / 100 * interfaceTextScale),
    "--ui-icon-scale": String(effectiveAppearance.uiIconScale / 100 * interfaceScale),
    "--control-scale": String(effectiveAppearance.controlScale / 100 * interfaceScale),
    "--radius-control": `${geometry.controlRadius}px`,
    "--page-padding": `${geometry.pagePadding}px`,
    "--brand-font-scale": String(
      Number(
        (
          (effectiveAppearance.fontScale / 100) *
          (effectiveAppearance.brandFontScale / 100) * interfaceScale
        ).toFixed(4),
      ),
    ),
    "--group-font-scale": String(
      Number(
        (
          (effectiveAppearance.fontScale / 100) *
          (effectiveAppearance.groupFontScale / 100) * interfaceScale
        ).toFixed(4),
      ),
    ),
    "--brand-logo-size": `${geometry.brandLogoSize}px`,
    "--brand-logo-scale": String(effectiveAppearance.brandLogoScale / 100),
    "--brand-logo-radius": `${geometry.brandLogoRadius}px`,
    "--brand-gap": `${geometry.brandGap}px`,
    "--group-nav-gap": `${geometry.groupNavigationGap}px`,
    "--topbar-height": `${geometry.topbarHeight}px`,
    "--search-width": `${geometry.searchWidth}px`,
    "--search-height": `${geometry.searchHeight}px`,
    "--search-radius": `${geometry.searchRadius}px`,
    "--group-tab-height": `${geometry.groupTabHeight}px`,
    "--group-gap": `${geometry.groupGap}px`,
    "--card-min-width": `${geometry.cardWidth}px`,
    "--card-min-height": `${geometry.cardHeight}px`,
    "--grid-gap": `${geometry.gap}px`,
    "--content-max-width": effectiveAppearance.contentWidthMode === "full" ? "100%" : `${geometry.contentWidth}px`,
    "--radius-card": `${geometry.radius}px`,
    "--site-icon-scale": String(effectiveAppearance.siteIconScale / 100),
    "--wallpaper-fit": effectiveWallpaper.fit,
    "--wallpaper-position-x": `${effectiveWallpaper.positionX}%`,
    "--wallpaper-position-y": `${effectiveWallpaper.positionY}%`,
    "--wallpaper-zoom": String(effectiveWallpaper.zoom / 100),
    "--wallpaper-blur": `${effectiveWallpaper.blur}px`,
    "--wallpaper-overlay": String(effectiveWallpaper.overlay / 100),
    ...wallpaperGlassStyle(effectiveWallpaper),
  } as CSSProperties;

  useInsertionEffect(() => {
    const root = document.documentElement;
    // Publish shared CSS tokens before child layout effects measure UI. Late tokens made border-color fall back to currentColor, then
    // animated that invalid first style into the saved glass material.
    for (const [property, value] of Object.entries({ ...appStyle, ...typographyVariables(effectiveAppearance) })) {
      root.style.setProperty(property, String(value));
    }
    root.dataset.textEffect = effectiveAppearance.textEffect;
    return () => { delete root.dataset.textEffect; };
  }, [
    effectiveAppearance,
    interfaceTextScale,
    effectiveWallpaper,
    wallpaperUrl,
  ]);

  useEffect(() => {
    document.title = effectiveBrand.tabTitle?.trim() || effectiveBrand.name;
  }, [effectiveBrand.name, effectiveBrand.tabTitle]);

  if (isLoading || waitingForWallpaper) {
    return <span className="visually-hidden" role="status">正在读取收藏</span>;
  }

  return (
    <LayoutSettingsContext value={effectiveAppearance}>
    <div
      data-app-shell
      data-text-effect={effectiveAppearance.textEffect}
      className={`app-shell min-h-[100dvh] ${
        activeDragId || pendingDragId ? "is-site-dragging" : ""
      } ${settingsOpen ? "settings-open" : ""} ${settingsOpen && effectiveAppearance.settingsPresentation === "push" && canPushSettings ? "settings-push" : ""} ${
        wallpaperUrl ? "has-wallpaper" : ""
      }`}
      style={appStyle}
      {...siteClickHandlers}
    >
      {wallpaperUrl && (
        <div className="wallpaper-layer" aria-hidden="true">
          <img src={wallpaperUrl} alt="" fetchPriority="high" onLoad={dismissWallpaperStartup} />
          <span />
        </div>
      )}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-navigation">
            {(effectiveBrand.showLogo || effectiveBrand.showName) && (
              <button
                type="button"
                className="brand"
                aria-label={`${effectiveBrand.name} 首页`}
                onClick={openCollectionHome}
              >
                {effectiveBrand.showLogo && <BrandMark brand={effectiveBrand} />}
                {effectiveBrand.showName && (
                  <span className="brand-name">{effectiveBrand.name}</span>
                )}
              </button>
            )}
            <button
              type="button"
              className={`topbar-history-button topbar-home-button ${
                !dataContext && !browserHistoryOpen && activeWorkspace === "main" ? "active" : ""
              }`}
              aria-label="打开收藏主页"
              aria-pressed={!dataContext && !browserHistoryOpen && activeWorkspace === "main"}
              onClick={openCollectionHome}
            >
              <House size={18} weight="regular" />
              <span>收藏主页</span>
            </button>
            <button
              type="button"
              className={`topbar-history-button topbar-github-button ${
                !dataContext && !browserHistoryOpen && activeWorkspace === "github" ? "active" : ""
              }`}
              aria-label="打开 GitHub 收藏"
              aria-pressed={!dataContext && !browserHistoryOpen && activeWorkspace === "github"}
              onClick={openGithubWorkspace}
            >
              <GithubLogo size={18} weight="regular" />
              <span>GitHub</span>
            </button>
            <button
              type="button"
              className={`topbar-history-button ${browserHistoryOpen ? "active" : ""}`}
              aria-label="打开历史记录"
              aria-pressed={browserHistoryOpen}
              onClick={openBrowserHistory}
            >
              <ClockCounterClockwise size={18} weight="regular" />
              <span>历史记录</span>
            </button>
          </div>
          <div className="topbar-actions">
            <button type="button" className={`topbar-history-button ${dataContext ? "active" : ""}`} aria-label="打开数据" aria-pressed={Boolean(dataContext)} onClick={() => openData()}><Database size={19} /><span>数据</span></button>
            <button
              type="button"
              className="topbar-history-button trash-button"
              onClick={() => openSettingsPanel("data", true)}
              aria-label="打开回收站"
              title="回收站"
            >
              <Trash size={19} weight="regular" />
              <span>回收站</span>
            </button>
            <button
              type="button"
              className="topbar-history-button settings-button"
              onClick={() => openSettingsPanel()}
              aria-label="打开设置"
              title="设置"
            >
              <GearSix size={19} weight="regular" />
              <span>设置</span>
            </button>
            <div className="topbar-add" ref={addMenuRef}>
              <button
                type="button"
                className="button primary-button add-button"
                aria-haspopup="menu"
                aria-expanded={addMenuOpen}
                onClick={() => setAddMenuOpen((current) => !current)}
              >
                <Plus size={18} weight="bold" />
                <span>添加</span>
                <CaretDown size={14} weight="bold" />
              </button>
              {addMenuOpen && (
                <div className="topbar-add-menu" role="menu" aria-label="添加">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openAddDialog()}
                  >
                    <span className="topbar-add-menu-icon">
                      <LinkSimple size={18} />
                    </span>
                    <span>
                      <strong>添加网站</strong>
                      <small>收藏一个新链接</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openNewGroupDialog()}
                  >
                    <span className="topbar-add-menu-icon">
                      <FolderPlus size={18} />
                    </span>
                    <span>
                      <strong>新建分组</strong>
                      <small>整理一组网站</small>
                    </span>
                  </button>
                  {hasBrowserBookmarks && <button type="button" role="menuitem" onClick={() => openData("bookmarks")}>
                    <span className="topbar-add-menu-icon"><FolderOpen size={18} /></span>
                    <span><strong>导入浏览器书签</strong><small>预览并保留文件夹层级</small></span>
                  </button>}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="page-container main-content">
        {storageError && (
          <div className="recovery-banner" role="alert">
            <span>{storageError}</span>
            <button type="button" className="button secondary-button" onClick={() => void retrySave()}>重试保存</button>
          </div>
        )}

        {recovered && (
          <div className="recovery-banner" role="status">
            <div>
              <strong>本地数据无法读取</strong>
              <span>已临时显示默认收藏，原始数据尚未被覆盖。</span>
            </div>
            <button
              type="button"
              className="button secondary-button"
              onClick={() => setResetOpen(true)}
            >
              恢复默认
            </button>
          </div>
        )}


        {dataContext && <DataWorkspace key={`${dataContext.mode}-${dataContext.groupId ?? "all"}`} state={state} context={dataContext} onBack={openCollectionHome} onImport={importData} importOperation={dataImport} onRetrySave={retrySave}
          localFont={settingsPreview ? undefined : localFont} onOpenFontSettings={() => openSettingsPanel("typography")} />}
          <BrowserHistoryView
            active={browserHistoryOpen}
            onBack={closeBrowserHistory}
            onRequestPermission={requestBrowserHistoryAccess}
            permissionError={historyPermissionError}
            permissionVersion={historyPermissionVersion}
          />
        {!dataContext && !browserHistoryOpen && (
          <>
        <WorkspaceSearch value={query} onChange={setCollectionQuery} label="搜索网页或筛选收藏" placeholder="筛选收藏，支持拼音、首字母缩写"
          description="输入筛选收藏，按 Enter 搜索网页"
          onSubmit={handleSearchSubmit} inputProps={{ id: "site-search", onFocus: handleSearchFocus,
            onBlur: handleSearchBlur, onKeyDown: handleSearchKeyDown }}>
            {historyOpen && !query.trim() && state.searchHistory.length > 0 && (
              <div className="search-history" role="listbox" aria-label="最近搜索" onBlur={handleSearchBlur}>
                <div className="search-history-header">
                  <span>最近搜索</span>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={clearSearchHistory}
                  >
                    清空
                  </button>
                </div>
                {state.searchHistory.map((entry, index) => (
                  <div
                    key={`${entry.query}-${entry.searchedAt}`}
                    className={`search-history-item ${
                      historyIndex === index ? "active" : ""
                    }`}
                    role="option"
                    aria-selected={historyIndex === index}
                  >
                    <button
                      type="button"
                      className="search-history-query"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => activateHistoryQuery(entry.query)}
                    >
                      <ClockCounterClockwise size={16} />
                      <span>{entry.query}</span>
                    </button>
                    <button
                      type="button"
                      className="search-history-delete"
                      aria-label={`删除搜索记录 ${entry.query}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => deleteSearchHistory(entry.query)}
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
        </WorkspaceSearch>

        {activeWorkspace === "github" && (
          <GithubHomeEntry
            site={githubHomeSite}
            deleteArmed={armedDeleteSiteId === githubHomeSite?.id}
            onAdd={openGithubHomeAdd}
            onOpen={(site) => recordSiteClick(site.id)}
            onRefresh={handleGithubHomeRefresh}
            refreshing={githubBulkRefreshLoading}
            onEdit={openEditDialog}
            onDelete={requestSiteDelete}
          />
        )}

        {transferNotice && (
          <div
            className={`transfer-banner ${transferNotice.kind}`}
            role={transferNotice.kind === "error" ? "alert" : "status"}
          >
            <span>{transferNotice.message}</span>
            <button
              type="button"
              className="clear-search"
              aria-label="关闭提示"
              onClick={() => setTransferNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}

        <section className="collection-section" aria-labelledby="collection-title">
          <div
            className={`collection-toolbar ${
              dragHoverGroupId ? "is-targeting-group-tab" : ""
            }`}
            >
            <div className="category-filter">
              <DndContext
                sensors={groupTabSensors}
                collisionDetection={(args) =>
                  detectGroupSortCollisions(args, "horizontal")
                }
                autoScroll={false}
                onDragPending={(event) => groupSort.trackPendingGroup(String(event.id))}
                onDragAbort={() => groupSort.trackPendingGroup(null)}
                onDragStart={handleGroupTabDragStart}
                onDragOver={handleGroupTabDragOver}
                onDragEnd={handleGroupTabDragEnd}
                onDragCancel={() => finishGroupSort(false)}
              >
                <SortableContext
                  items={groups.map((group) => groupSortTabId(group.id))}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="category-tabs" role="tablist" aria-label="网站分组">
                <button
                  type="button"
                  role="tab"
                  className={`category-tab ${
                    activeGroupId === "all" ? "active" : ""
                  }`}
                  aria-selected={activeGroupId === "all"}
                  onClick={() => selectGroup("all")}
                >
                  <SquaresFour size={16} />
                  全部
                  <span>{workspaceSites.length}</span>
                </button>
                {groups.map((group) => {
                  const count = siteCounts.get(group.id) ?? 0;
                  return (
                    <Fragment key={group.id}>
                      <GroupDropTab
                        group={group}
                        count={count}
                        selected={(activeParent?.id ?? activeGroupId) === group.id}
                        dragActive={
                          Boolean(activeDragId) && !activeDraggedFolder &&
                          !dragDisabled
                        }
                        dragOver={dragHoverGroupId === group.id}
                        sortDisabled={groupSortDisabled}
                        managementDisabled={selectionArmed || multiSelectMode}
                        onSelect={() => selectGroup(group.id)}
                        onManage={() => {
                          if (!selectionArmed && !multiSelectMode) {
                            openGroupManager(group.id);
                          }
                        }}
                        onSortIntent={cancelGroupManagementForSort}
                      />
                    </Fragment>
                  );
                })}
                  </div>
                </SortableContext>
                <DragOverlay
                  adjustScale={false}
                  dropAnimation={
                    reduceMotion
                      ? null
                      : {
                          duration: 160,
                          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                        }
                  }
                  zIndex={90}
                >
                  {activeSortedGroup && activeGroupSortAxis === "horizontal" ? (
                    <GroupSortDragPreview
                      axis="horizontal"
                      group={activeSortedGroup}
                      count={activeSortedGroupCount}
                      selected={activeGroupId === activeSortedGroup.id}
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>
              <button
                type="button"
                className="category-tab add-group-tab"
                aria-label="新建分组"
                title="新建分组"
                onClick={() => openNewGroupDialog()}
              >
                <Plus size={17} weight="bold" />
              </button>
            </div>

            <div className="collection-actions">
              {activeWorkspace === "github" && (
                <button
                  type="button"
                  className="manage-groups-button github-import-action"
                  disabled={selectionArmed || multiSelectMode || isSearching}
                  aria-label={
                    activeGithubImportGroup
                      ? `刷新 ${activeGithubImportGroup.name} 的作者仓库`
                      : "导入 GitHub 作者仓库"
                  }
                  onClick={() =>
                    activeGithubImportGroup
                      ? openGithubRefresh(activeGithubImportGroup)
                      : openGithubRepositoryImport()
                  }
                >
                  <GithubLogo size={16} />
                  {activeGithubImportGroup ? "刷新作者仓库" : "导入作者仓库"}
                </button>
              )}
              <button
                type="button"
                className="manage-groups-button"
                disabled={selectionArmed || multiSelectMode}
                aria-disabled={selectionArmed || multiSelectMode || undefined}
                onClick={() =>
                  openGroupManager(
                    activeGroupId === "all" ? undefined : activeGroupId,
                  )
                }
              >
                <FolderOpen size={16} />
                管理分组
              </button>
            </div>
          </div>

          <div className="collection-heading">
            <div>
              {activeParent && !isSearching && (
                <nav aria-label="收藏路径" className="folder-breadcrumb">
                  <button type="button" className="folder-return" aria-label={`返回${folderReturnLabel}`}
                    title={`返回${folderReturnLabel}`} onClick={returnFromFolder}>
                    <ArrowLeft size={14} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => selectGroup("all")}>
                    {activeWorkspace === "github" ? "全部 GitHub" : "全部网站"}
                  </button>
                  <span aria-hidden="true">/</span>
                  <button type="button" onClick={() => selectGroup(activeParent.id)}>{activeParent.name}</button>
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">{activeGroup?.name}</span>
                </nav>
              )}
              <h2 id="collection-title" ref={collectionTitleRef} tabIndex={activeParent ? -1 : undefined}>{collectionTitle}</h2>
              <p>
                {isSearching ? `找到 ${visibleSites.length} 个结果`
                  : activeParent ? `${siteCounts.get(activeGroupId) ?? 0} 个网站`
                  : `${activeGroup ? siteCounts.get(activeGroup.id) ?? 0 : workspaceSites.length} 个收藏`}
                </p>
            </div>
            <div className="collection-view-controls">
              {multiSelectMode && selectedSiteIds.size > 0 && <button
                type="button" className="view-control-button" data-selection-surface="move"
                onClick={() => setSitesToMove(selectableSiteIds.filter(id => selectedSiteIds.has(id)))}
              >
                <FolderOpen size={16} />
                <span>移动至分组</span>
              </button>}
              {(!multiSelectMode || isGroupedView || activeGroupId === "all") && <SelectMenu
                value={sortMode}
                options={SORT_OPTIONS}
                onChange={(nextMode) => persistSortMode(nextMode, activeWorkspace)}
                menuLabel="排列方式"
                popoverRole="menu"
                optionRole="menuitemradio"
                className="view-control"
                triggerClassName={`view-control-button ${sortMode !== "manual" ? "active" : ""}`}
                menuClassName="view-popover sort-popover"
                disabled={isSearching}
                title={isSearching ? "搜索结果按相关度排列，清空搜索后恢复原排列" : undefined}
                renderTrigger={(option) => <>
                  <ArrowsDownUp size={16} />
                  <span>{isSearching ? "相关度" : option?.label ?? "排列"}</span>
                </>}
              />}
              {multiSelectMode && !isGroupedView ? <button
                type="button" className="view-control-button"
                data-selection-surface="select-all"
                aria-pressed={allVisibleSitesSelected}
                disabled={selectableSiteIds.length === 0}
                onClick={() => toggleGroupedSiteSelection(selectableSiteIds)}
              >
                <CheckSquare size={16} />
                <span>{allVisibleSitesSelected ? "取消全选" : "全选"}</span>
              </button> : activeGroupId === "all" && !isSearching && (
                <SelectMenu
                  value={state.displayModeByWorkspace[activeWorkspace]}
                  options={[
                    { value: "flat" as const, label: "全部平铺", icon: <SquaresFour size={16} /> },
                    { value: "grouped" as const, label: "按分组显示", icon: <Rows size={16} /> },
                  ]}
                  onChange={(nextMode) => {
                    if (selectionArmed) cancelSelection();
                    setDisplayMode(nextMode, activeWorkspace);
                  }}
                  menuLabel="显示方式"
                  popoverRole="menu"
                  optionRole="menuitemradio"
                  className="view-control"
                  triggerClassName={`view-control-button ${state.displayModeByWorkspace[activeWorkspace] === "grouped" ? "active" : ""}`}
                  menuClassName="view-popover display-popover"
                  renderTrigger={(option) => <>
                    {option?.icon}
                    <span>显示</span>
                  </>}
                />
              )}
              {!isGroupedView && (
              <button
                type="button"
                className={`view-control-button multi-select-button ${
                  multiSelectMode ? "active" : ""
                }`}
                data-selection-surface="selection-switch"
                aria-pressed={multiSelectMode}
                disabled={isSearching || Boolean(activeDragId)}
                onClick={toggleMultiSelectMode}
              >
                {multiSelectMode ? <X size={16} /> : <CheckSquare size={16} />}
                <span>{multiSelectMode ? "取消" : "多选"}</span>
              </button>
              )}
            </div>
          </div>

          <div className="collection-grid-content" ref={sweepSelection.containerRef} {...sweepSelection.handlers}>
              {addCardGroup && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={activeCollisionDetection}
                  autoScroll={false}
                  measuring={{
                    droppable: { strategy: MeasuringStrategy.Always },
                  }}
                  onDragPending={(event) => {
                    if (String(event.id).startsWith("group-sort-row:")) {
                      groupSort.trackPendingGroup(String(event.id));
                    } else {
                      setPendingDragId(String(event.id));
                    }
                  }}
                  onDragAbort={() => { groupSort.trackPendingGroup(null); setPendingDragId(null); }}
                  onDragStart={handleCollectionDragStart}
                  onDragOver={handleCollectionDragOver}
                  onDragEnd={handleCollectionDragEnd}
                  onDragCancel={handleCollectionDragCancel}
                >
                  {isGroupedView ? (
                    <GroupedCollection navigationGap={effectiveAppearance.groupNavigationGap}
                      hasNotes={hasSiteNotes}
                      navigationSettingsDisabled={settingsOpen}
                      onNavigationGapChange={groupNavigationGap => saveSettings(state.brand,
                        patchAppearance(state.appearance, { groupNavigationGap }), state.wallpaper)}
                      sections={groupedSections} folderActions={folderActions} selection={{ ...selection,
                      toggleGroupSelection, toggleGroupedSiteSelection, enterGroupSelectionFromDoubleClick }}
                      drag={gridDrag} sorting={activeGroupSortAxis === "vertical"} sortDisabled={groupSortDisabled}
                      insertDisabled={Boolean(activeGroupSortId || activeDragId || isSearching || selectionArmed)}
                      onInsert={openNewGroupDialog} onManage={openGroupManager} onAdd={openAddDialog}
                      renderSite={renderCollectionCard} />
                  ) : (
                    <CollectionSiteGrid group={addCardGroup} sites={visibleSites} entries={flatEntries}
                      folderActions={folderActions} flat={activeGroupId === "all"} grouped={false} drag={gridDrag}
                      dropEnabled={Boolean(activeDragId) && !dragDisabled && canReorderSites && activeGroupId !== "all"}
                      renderSite={site => renderCollectionCard(site, searchGroups.find(group => group.id === site.groupId) ?? addCardGroup)}
                      onAdd={openAddDialog} />
                  )}
                  <DragOverlay
                    className="site-drag-overlay"
                    adjustScale={false}
                    dropAnimation={
                      reduceMotion
                        ? null
                        : {
                            duration: 170,
                            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                            // Keep site card material intact during the return.
                            // This overlay also serves vertical group sorting,
                            // whose existing source-hiding feedback is retained.
                            sideEffects: args => args.active.node.matches("[data-site-dnd-id], [data-folder-dnd-id]")
                              ? undefined
                              : defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } })(args),
                          }
                    }
                    zIndex={dragHoverGroupId ? 30 : 80}
                  >
                    {activeSortedGroup && activeGroupSortAxis === "vertical" ? (
                      <GroupSortDragPreview
                        axis="vertical"
                        sites={visibleSites.filter(site => groupSort.view?.activeIds.includes(site.groupId))}
                        group={activeSortedGroup}
                        count={activeSortedGroupCount}
                        batchCount={groupSort.view?.activeIds.length || 1}
                      />
                    ) : activeDraggedFolder ? (
                      <FolderCardDragPreview group={activeDraggedFolder} count={siteCounts.get(activeDraggedFolder.id) ?? 0} />
                    ) : activeDraggedSite && activeDraggedGroup ? (
                      <SiteCardDragPreview
                        site={activeDraggedSite}
                        group={activeDraggedGroup}
                        showClickCount={sortMode === "heat"}
                        showNotes={effectiveAppearance.showSiteNotes}
                        overGroupTab={Boolean(dragHoverGroupId)}
                      />
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}
          </div>
        </section>
          </>
        )}
      </main>

      <div className="visually-hidden" role="status" aria-live="polite">
        {groupSortAnnouncement}
      </div>

      {!browserHistoryOpen ? (
        <footer className="page-container footer">
          <span>
            {storageMode === "extension"
              ? `扩展本地保存 · ${workspaceSites.length} 个网站`
              : `浏览器本地保存 · ${workspaceSites.length} 个网站`}
          </span>
        </footer>
      ) : null}

      <SiteDialog
        open={siteDialogOpen}
        sites={state.sites}
        groups={getWorkspaceGroups(state.groups, dialogWorkspace)}
        workspace={dialogWorkspace}
        allowGithubExit={activeWorkspace === "main" && dialogWorkspace === "github"}
        initialGroupId={dialogGroupId}
        editingSite={editingSite}
        prefill={siteDialogPrefill}
        onOpenChange={setSiteDialogOpen}
        onSubmit={handleSiteSubmit}
      />

      <GithubRepositoryImportDialog
        open={githubImportOpen}
        state={state}
        preview={githubImportPreview}
        loading={githubImportLoading}
        confirming={githubImportConfirming}
        error={githubImportError}
        initialInput={githubImportInitialUrl}
        onOpenChange={closeGithubRepositoryImport}
        onRead={(input) => {
          void handleGithubRepositoryRead(input);
        }}
        onConfirm={handleGithubRepositoryConfirm}
      />

      <GithubRefreshDetailsDialog
        open={Boolean(githubRefreshReport)}
        report={githubRefreshReport}
        onOpenChange={closeGithubRefreshReport}
      />

      <NewGroupDialog
        open={newGroupDialogOpen}
        groups={workspaceGroups}
        parent={groups.find(group => group.id === newGroupParentId)}
        insertionContext={newGroupInsertionContext}
        onOpenChange={(open) => {
          setNewGroupDialogOpen(open);
          if (!open) {
            setNewGroupBeforeId(undefined);
            setNewGroupParentId(undefined);
            setNewGroupInsertionContext(undefined);
          }
        }}
        onSubmit={handleNewGroup}
      />

      <GroupDialog
        open={groupDialogOpen}
        initialGroupId={managedGroupId}
        groups={workspaceGroups}
        sites={state.sites}
        onOpenChange={(open) => {
          setGroupDialogOpen(open);
          if (!open) setManagedGroupId(undefined);
        }}
        onUpdate={updateGroup}
        onReorder={reorderManagedGroups}
        onDelete={handleGroupDelete}
        onCreateChild={openNewChildGroupDialog}
        currentGroupId={activeGroupId}
        onOpenChild={group => {
          cancelGroupManagementForSort();
          openFolder(group);
        }}
        onDeleteMany={(ids) => {
          const requested = workspaceGroups.filter(group => ids.includes(group.id) && !group.isProtected).map(group => group.id);
          const deleted = getGroupSubtreeIds(workspaceGroups, requested);
          const count = state.sites.filter(site => deleted.has(site.groupId)).length;
          deleteGroups(requested);
          setTransferNotice({ kind: "success", message: `已删除 ${deleted.size} 个分组，${count} 个链接已移入回收站。` });
        }}
        onExportGroup={(id) => openData("export", id)}
        onImportGroup={(id) => openData("import", id)}
      />

      {sitesToMove.length > 0 && <MoveSitesDialog
        sites={state.sites.filter(site => sitesToMove.includes(site.id))}
        groups={state.groups}
        onClose={() => setSitesToMove([])}
        onMove={groupId => {
          moveSites(sitesToMove.filter(id => state.sites.some(site => site.id === id)), groupId);
          setSitesToMove([]);
          cancelSelection();
          setTransferNotice({ kind: "success", message: `已移动至“${getGroupPath(state.groups, groupId)}”。` });
        }}
      />}

      {!settingsOpen && <TopbarResizeHandle value={effectiveAppearance.topbarHeight} scale={interfaceScale}
        onChange={(topbarHeight) => setSettingsPreview({ brand: state.brand, wallpaper: state.wallpaper,
          appearance: patchAppearance(state.appearance, { topbarHeight }) })}
        onCancel={() => setSettingsPreview(null)}
        onCommit={(topbarHeight) => {
          saveSettings(state.brand, patchAppearance(state.appearance, { topbarHeight }), state.wallpaper);
          setSettingsPreview(null);
        }} />}
      <SettingsPanel
        wallpaperPreviewUrl={wallpaperUrl}
        onInterfaceScaleInteraction={handleInterfaceScaleInteraction}
        open={settingsOpen}
        state={state}
        initialSection={settingsInitialSection}
        initialTrashOpen={settingsInitialTrashOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) {
            setSettingsInitialSection(undefined);
            setSettingsInitialTrashOpen(false);
          }
        }}
        onPreview={setSettingsPreview}
        localFontError={localFont.error ?? undefined}
        onSave={(draft) =>
          saveSettings(
            draft.brand,
            draft.appearance,
            draft.wallpaper,
          )
        }
        onExport={() => openData("export")}
        onImport={() => openData("import")}
        onResetBookmarks={() => {
          setSettingsOpen(false);
          setSettingsPreview(null);
          setResetOpen(true);
        }}
        onClearHistory={clearSearchHistory}
        onRestoreSite={(id) => {
          const name = state.deletedSites.find((entry) => entry.site.id === id)
            ?.site.name;
          restoreSite(id);
          setTransferNotice({
            kind: "success",
            message: name ? `“${name}”已恢复。` : "链接已恢复。",
          });
        }}
        onRestoreAllSites={() => {
          const count = state.deletedSites.length;
          restoreAllSites();
          setTransferNotice({
            kind: "success",
            message: `已恢复 ${count} 个链接。`,
          });
        }}
        onPermanentDeleteSite={(id) => {
          permanentlyDeleteSite(id);
          setTransferNotice({ kind: "success", message: "链接已永久删除。" });
        }}
        onEmptyTrash={() => {
          emptyTrash();
          setTransferNotice({ kind: "success", message: "回收站已清空。" });
        }}
        onTrashRetentionChange={(days) => {
          setTrashRetentionDays(days);
          setTransferNotice({
            kind: "success",
            message:
              days === null
                ? "回收站已设为永不自动清理。"
                : `回收站将在 ${days} 天后自动清理。`,
          });
        }}
        wallpaperLoadError={wallpaperError}
      />

      <ConfirmDialog
        open={resetOpen}
        title="恢复默认收藏？"
        description="当前收藏、分组和排序会被默认内容替换，外观、壁纸和搜索历史会保留。"
        confirmLabel="恢复默认"
        onOpenChange={setResetOpen}
        onConfirm={() => {
          reset();
          resetCollectionQuery();
          selectGroup("all");
          setResetOpen(false);
        }}
      />

    </div>
    </LayoutSettingsContext>
  );
}
