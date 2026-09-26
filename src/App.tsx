import { WorkspaceSearch } from "./components/workspace-search";
import { TopbarResizeHandle } from "./components/topbar-resize-handle";
import { GlassRefraction, supportsGlassRefraction } from "./components/glass-refraction";
import { patchAppearance } from "./lib/appearance-settings";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  DndContext,
  DragOverlay,
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
import { GroupSortDragPreview } from "./components/group-sort-preview";
import { GithubHomeEntry } from "./components/github-home-entry";
import { GithubRepositoryImportDialog } from "./components/github-repository-import-dialog";
import { SelectMenu } from "./components/select-menu";
import {
  GithubRefreshDetailsDialog,
  type GithubRefreshReport,
  type GithubRefreshReportEntry,
} from "./components/github-refresh-details-dialog";
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
import { groupSortTabId, readGroupSortId } from "./lib/collection-drag-ids";
import { CollectionMouseSensor, CollectionTouchSensor, GROUP_SORT_ACTIVATION_DISTANCE, SITE_DRAG_ACTIVATION_DISTANCE } from "./lib/collection-drag-sensors";
import { useCollectionSelection } from "./hooks/use-collection-selection";
import { useTheme } from "./hooks/use-theme";
import { useWallpaper } from "./hooks/use-wallpaper";
import { dismissWallpaperStartup } from "./lib/wallpaper-startup";
import {
  requestHistoryPermission,
  type BrowserHistoryPermissionResult,
} from "./lib/browser-history";
import { searchWeb } from "./lib/browser-search";
import type { DroppedSitePreview } from "./lib/external-link-drop";
import {
  groupSortIntentFromTargetIndex,
} from "./lib/group-sort";
import {
  downloadExport,
  downloadGroupExport,
  parseGroupImportFile,
  parseImportFile,
  type GroupExportPayload,
} from "./lib/data-transfer";
import {
  filterSites,
  sortSitesByHeat,
} from "./lib/site-utils";
import { getGroupedSiteSections } from "./lib/grouped-sites";
import type {
  GithubRepositoryBatchImport,
} from "./lib/site-state";
import type {
  CategoryIcon as GroupIconName,
  SiteCollectionState,
  SiteFormValues,
  SiteGroup,
  SiteItem,
  SiteSortMode,
  SiteWorkspace,
} from "./types";
import { mergeGroupImportIntoState } from "./lib/site-state";
import {
  fetchGithubOwnerRepositories,
  formatGithubRepositoryError,
  type GithubOwnerRepositories,
} from "./lib/github-repository-api";
import {
  findGithubHomeSite,
  getGroupWorkspace,
  getWorkspaceGroups,
  isGithubHomeUrl,
  isGithubUrl,
  routeGithubSitesInState,
} from "./lib/github-workspace";

type GroupFilter = "all" | string;
type CollectionSearchOrigin = {
  workspace: SiteWorkspace;
  groupId: GroupFilter;
};

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
    addGroup,
    updateGroup,
    reorderGroups,
    reorderGroupBlock,
    deleteGroup,
    deleteGroups,
    importGroup,
    importGithubRepositories,
    importGithubRepositoryBatch,
    migrateGithubSites,
    reset,
    replaceState,
    saveSettings,
    recordSearch,
    deleteSearchHistory,
    clearSearchHistory,
    setDisplayMode,
    setSortMode: persistSortMode,
  } = useSiteHub(store);
  const [settingsPreview, setSettingsPreview] =
    useState<SettingsDraft | null>(null);
  const effectiveBrand = settingsPreview?.brand ?? state.brand;
  const effectiveAppearance =
    settingsPreview?.appearance ?? state.appearance;
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
  const [query, setQuery] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<GroupFilter>("all");
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [dialogGroupId, setDialogGroupId] = useState<string>();
  const [dialogWorkspace, setDialogWorkspace] = useState<SiteWorkspace>("main");
  const [siteDialogPrefill, setSiteDialogPrefill] = useState<
    DroppedSitePreview | undefined
  >();
  const [newGroupDialogOpen, setNewGroupDialogOpen] = useState(false);
  const [newGroupBeforeId, setNewGroupBeforeId] = useState<string>();
  const [newGroupInsertionContext, setNewGroupInsertionContext] = useState<{
    groupName: string;
    position: "before" | "after";
  }>();
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [managedGroupId, setManagedGroupId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsSection>("appearance");
  const [settingsInitialTrashOpen, setSettingsInitialTrashOpen] =
    useState(false);
  const [editingSite, setEditingSite] = useState<SiteItem | null>(null);
  const [armedDeleteSiteId, setArmedDeleteSiteId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [pendingImport, setPendingImport] =
    useState<SiteCollectionState | null>(null);
  const [pendingGroupImport, setPendingGroupImport] = useState<{
    targetGroupId: string;
    payload: GroupExportPayload;
    added: number;
    skipped: number;
  } | null>(null);
  const [transferNotice, setTransferNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [dragSitesPreview, setDragSitesPreview] = useState<SiteItem[] | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [browserHistoryOpen, setBrowserHistoryOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<SiteWorkspace>("main");
  const [historyPermissionVersion, setHistoryPermissionVersion] = useState(0);
  const [historyPermissionError, setHistoryPermissionError] = useState<string | null>(
    null,
  );
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [githubImportOpen, setGithubImportOpen] = useState(false);
  const [githubImportInitialUrl, setGithubImportInitialUrl] = useState("");
  const [githubImportPreview, setGithubImportPreview] =
    useState<GithubOwnerRepositories | null>(null);
  const [githubImportLoading, setGithubImportLoading] = useState(false);
  const [githubImportConfirming, setGithubImportConfirming] = useState(false);
  const [githubImportError, setGithubImportError] = useState<string | null>(null);
  const [githubBulkRefreshLoading, setGithubBulkRefreshLoading] = useState(false);
  const [githubRefreshReport, setGithubRefreshReport] =
    useState<GithubRefreshReport | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const groupImportInputRef = useRef<HTMLInputElement>(null);
  const groupImportTargetRef = useRef<string | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const collectionSearchOriginRef = useRef<CollectionSearchOrigin | null>(null);
  const armedDeleteTimerRef = useRef<number | null>(null);
  const sortMode: SiteSortMode =
    state.sortModeByWorkspace[activeWorkspace] ?? state.sortMode ?? "manual";

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (
        event.state?.siteHubLayer === "browser-history" ||
        event.state?.siteHubLayer === "history-detail"
      ) {
        return;
      }
      if (browserHistoryOpen) {
        setBrowserHistoryOpen(false);
        setActiveWorkspace("main");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [browserHistoryOpen]);

  const groups = useMemo(
    () => getWorkspaceGroups(state.groups, activeWorkspace),
    [activeWorkspace, state.groups],
  );
  const defaultGroup =
    groups.find((group) => !group.isProtected) ??
    groups.find((group) => group.id === OTHER_GROUP_ID) ??
    groups[0];
  const activeGroup =
    activeGroupId === "all"
      ? undefined
      : groups.find((group) => group.id === activeGroupId);
  const activeGithubImportGroup =
    activeWorkspace === "github" && activeGroup?.githubImportSource
      ? activeGroup
      : undefined;
  const workspaceGroupIds = useMemo(
    () => new Set(groups.map((group) => group.id)),
    [groups],
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
  const searchGroups = isGlobalCollectionSearch ? state.groups : groups;
  const searchSites = isGlobalCollectionSearch
    ? state.sites.filter(
        (site) => !(activeWorkspace === "github" && isGithubHomeUrl(site.url)),
      )
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
    () => getGroupedSiteSections(groups, visibleSites, sortMode, isSearching),
    [groups, isSearching, sortMode, visibleSites],
  );
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
  const dragDisabled = isSearching || groupSelectionMode;
  const canReorderSites = sortMode === "manual";
  const siteDragMode: SiteDragMode = dragDisabled
    ? "disabled"
    : multiSelectMode
      ? "transfer"
      : canReorderSites
      ? "reorder"
      : "transfer";
  const anyModalOpen =
    siteDialogOpen ||
    newGroupDialogOpen ||
    groupDialogOpen ||
    githubImportOpen ||
    Boolean(githubRefreshReport) ||
    settingsOpen ||
    resetOpen ||
    Boolean(pendingImport);
  const { armSiteClickSuppression, handlers: siteClickHandlers } = useSiteClickGuard();
  const groupSort = useGroupSorting({ groups, selection, reorderGroups, reorderGroupBlock,
    onStart: () => { clearArmedDelete(); cancelGroupManagementForSort(); },
  });
  const { beginGroupSort, finishGroupSort, detectGroupSortCollisions, updateKeyboardGroupSortIntent,
    handleGroupTabDragStart, handleGroupTabDragOver, handleGroupTabDragEnd } = groupSort;
  const { pendingDragId, activeDragId, overDragId, dragHoverGroupId, batchDragIds, originGroupId,
    activeDraggedSite, setPendingDragId, activeCollisionDetection: siteCollisionDetection,
    handleDragStart, handleDragOver, handleDragEnd, handleDragCancel,
  } = useSiteDragging({ sites: state.sites, groups: state.groups, renderedSites, workspaceGroupIds,
    activeGroupId, isGroupedView, canReorderSites, dragDisabled, selection, setActiveGroupId,
    setDragSitesPreview, commitSites, onStart: clearArmedDelete, armSiteClickSuppression });
  const activeCollisionDetection: CollisionDetection = args => args.active.data.current?.type === "group-row-sort"
    ? detectGroupSortCollisions(args, "vertical") : siteCollisionDetection(args);
  const activeDraggedGroup = activeDraggedSite ? groups.find(group => group.id === activeDraggedSite.groupId) : undefined;
  const activeGroupSortId = groupSort.view?.activeId ?? null;
  const activeGroupSortAxis = groupSort.view?.axis ?? null;
  const groupSortIntent = groupSort.view?.intent ?? null;
  const activeSortedGroup = activeGroupSortId
    ? groups.find((group) => group.id === activeGroupSortId)
    : undefined;
  const activeSortedGroupCount = activeSortedGroup
    ? state.sites.filter((site) => site.groupId === activeSortedGroup.id).length
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
    reorder: canReorderSites && !multiSelectMode, disabled: dragDisabled };
  const selectedSiteCount = selectedSiteIds.size;

  useEffect(() => {
    if (
      activeGroupId !== "all" &&
      !groups.some((group) => group.id === activeGroupId)
    ) {
      setActiveGroupId("all");
    }
  }, [activeGroupId, groups]);

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
      if (selectionArmed) {
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
  }, [armedDeleteSiteId, selectionArmed, cancelSelection]);

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
        showClickCount={sortMode === "heat"}
        workspaceLabel={
          isGlobalCollectionSearch
            ? getGroupWorkspace(group) === "github" ? "GitHub" : "收藏主页"
            : undefined
        }
        dragMode={siteDragMode}
        dragDisabledReason={isSearching ? "搜索时无法排序" : undefined}
        dragPending={pendingDragId === site.id}
        selectionMode={multiSelectMode}
        selectionEntryEnabled={isGroupedView && selectionArmed}
        linkInteractionDisabled={groupSelectionMode}
        actionsDisabled={selectionArmed}
        selected={selectedSiteIds.has(site.id)}
        selectedCount={selectedSiteCount}
        batchDragging={Boolean(activeDragId) && batchDragIds.includes(site.id)}
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
      groups.find((group) => group.id === groupId) ??
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
      collectionSearchOriginRef.current = null;
      setQuery("");
    }
    setActiveGroupId(groupId);
    cancelSelection();
  }

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
        const originGroups = getWorkspaceGroups(state.groups, origin.workspace);
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

  function openGroupManager(groupId?: string) {
    setAddMenuOpen(false);
    setManagedGroupId(groupId);
    cancelSelection();
    setGroupDialogOpen(true);
  }

  function handleGroupDelete(group: SiteGroup) {
    const siteCount = state.sites.filter(
      (site) => site.groupId === group.id,
    ).length;
    deleteGroup(group.id);
    if (activeGroupId === group.id) setActiveGroupId("all");
    setGroupDialogOpen(false);
    setManagedGroupId(undefined);
    setTransferNotice({
      kind: "success",
      message:
        siteCount > 0
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
    setNewGroupBeforeId(beforeGroupId);
    setNewGroupInsertionContext(insertionContext);
    setNewGroupDialogOpen(true);
  }

  function handleNewGroup(name: string, icon: GroupIconName) {
    const id = addGroup(name, icon, newGroupBeforeId, activeWorkspace);
    if (!newGroupInsertionContext) setActiveGroupId(id);
    setNewGroupBeforeId(undefined);
    setNewGroupInsertionContext(undefined);
  }

  async function performSearch(text: string) {
    const normalized = text.trim();
    if (!normalized) return;
    setHistoryOpen(false);
    void recordSearch(normalized).catch(() => {
      setTransferNotice({
        kind: "error",
        message: "搜索已发起，但这条历史记录未能保存。",
      });
    });
    try {
      await searchWeb(normalized);
    } catch {
      setTransferNotice({
        kind: "error",
        message: "无法调用浏览器搜索，请稍后重试。",
      });
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performSearch(query);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (query.trim() || !historyOpen || state.searchHistory.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHistoryIndex((current) =>
        Math.min(state.searchHistory.length - 1, current + 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHistoryIndex((current) => Math.max(-1, current - 1));
    } else if (event.key === "Escape") {
      setHistoryOpen(false);
      setHistoryIndex(-1);
    } else if (event.key === "Enter" && historyIndex >= 0) {
      event.preventDefault();
      const historyQuery = state.searchHistory[historyIndex]?.query;
      if (historyQuery) {
        setCollectionQuery(historyQuery);
        void performSearch(historyQuery);
      }
    }
  }

  function handleExport() {
    try {
      downloadExport(state);
      setTransferNotice({
        kind: "success",
        message: "收藏数据已导出为 JSON 文件。",
      });
    } catch {
      setTransferNotice({
        kind: "error",
        message: "导出失败，请检查浏览器的下载权限。",
      });
    }
  }

  function handleGroupExport(groupId: string) {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    try {
      downloadGroupExport(state, groupId);
      setTransferNotice({
        kind: "success",
        message: `“${group.name}”资源包已导出。`,
      });
    } catch {
      setTransferNotice({
        kind: "error",
        message: "分组资源导出失败，请检查浏览器的下载权限。",
      });
    }
  }

  function requestGroupImport(groupId: string) {
    groupImportTargetRef.current = groupId;
    groupImportInputRef.current?.click();
  }

  function openSettingsPanel(
    section: SettingsSection = "appearance",
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
    if (window.history.state?.siteHubLayer) {
      window.history.replaceState(
        { ...(window.history.state ?? {}), siteHubLayer: undefined },
        "",
        window.location.href,
      );
    }
    setBrowserHistoryOpen(false);
  }

  function openCollectionHome() {
    setHistoryPermissionError(null);
    setActiveWorkspace("main");
    setActiveGroupId("all");
    resetCollectionQuery();
    dismissBrowserHistoryLayer();
  }

  function openGithubWorkspace() {
    setHistoryPermissionError(null);
    dismissBrowserHistoryLayer();
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

  function openGithubRepositoryImport(profileUrl = "") {
    setAddMenuOpen(false);
    setGithubImportInitialUrl(profileUrl);
    setGithubImportPreview(null);
    setGithubImportError(null);
    setGithubImportOpen(true);
  }

  async function handleGithubRepositoryRead(input: string) {
    setGithubImportLoading(true);
    setGithubImportError(null);
    setGithubImportPreview(null);
    try {
      const result = await fetchGithubOwnerRepositories(input);
      if (result.repositories.length === 0) {
        setGithubImportError("这个作者或组织没有可导入的公开仓库。");
        return;
      }
      setGithubImportPreview(result);
    } catch (error) {
      setGithubImportError(formatGithubRepositoryError(error));
    } finally {
      setGithubImportLoading(false);
    }
  }

  function handleGithubRepositoryConfirm(selectedIds: Set<number>) {
    if (!githubImportPreview || selectedIds.size === 0) return;
    setGithubImportConfirming(true);
    try {
      const result = importGithubRepositories(
        githubImportPreview.owner,
        githubImportPreview.repositories,
        selectedIds,
      );
      setGithubImportOpen(false);
      setGithubImportPreview(null);
      setGithubImportError(null);
      setTransferNotice({
        kind: "success",
        message: result.added > 0
          ? `已将 ${result.added} 个仓库添加到“${result.group?.name ?? githubImportPreview.owner.login}”，跳过 ${result.skipped} 个重复项。`
          : `没有新增仓库，已跳过 ${result.skipped} 个重复项。`,
      });
      if (result.group) setActiveGroupId(result.group.id);
    } catch (error) {
      setGithubImportError(error instanceof Error ? error.message : "导入失败，请稍后重试。");
    } finally {
      setGithubImportConfirming(false);
    }
  }

  function closeGithubRepositoryImport(open: boolean) {
    setGithubImportOpen(open);
    if (!open) {
      setGithubImportPreview(null);
      setGithubImportError(null);
      setGithubImportInitialUrl("");
    }
  }

  function openGithubRefresh(group: SiteGroup) {
    const source = group.githubImportSource;
    if (!source) return;
    openGithubRepositoryImport(source.profileUrl);
  }

  async function handleGithubHomeRefresh() {
    if (githubBulkRefreshLoading) return;
    setGithubRefreshReport(null);
    const sources = state.groups
      .filter(
        (group) =>
          getGroupWorkspace(group) === "github" && group.githubImportSource,
      )
      .map((group) => group.githubImportSource!)
      .filter(
        (source, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.login.toLocaleLowerCase("en-US") ===
              source.login.toLocaleLowerCase("en-US"),
          ) === index,
      );

    if (sources.length === 0) {
      openGithubRepositoryImport();
      return;
    }

    setGithubBulkRefreshLoading(true);
    const imports: GithubRepositoryBatchImport[] = [];
    const failures: GithubRefreshReportEntry[] = [];
    try {
      for (const source of sources) {
        try {
          imports.push(await fetchGithubOwnerRepositories(source.profileUrl));
        } catch (error) {
          failures.push({
            owner: source,
            addedRepositories: [],
            skipped: 0,
            skippedActive: 0,
            skippedDeleted: 0,
            error: formatGithubRepositoryError(error),
          });
        }
      }

      if (imports.length === 0) {
        setGithubRefreshReport({
          refreshedAt: new Date().toISOString(),
          refreshedOwners: sources.length,
          added: 0,
          skipped: 0,
          failed: failures.length,
          entries: failures,
        });
        setTransferNotice({
          kind: "error",
          message: `全部 ${sources.length} 个作者仓库刷新失败。`,
        });
        return;
      }

      const result = importGithubRepositoryBatch(imports);
      const successfulByLogin = new Map(
        result.details.map((detail) => [
          detail.owner.login.toLocaleLowerCase("en-US"),
          detail,
        ]),
      );
      const failedByLogin = new Map(
        failures.map((detail) => [
          detail.owner.login.toLocaleLowerCase("en-US"),
          detail,
        ]),
      );
      const entries = sources
        .map(
          (source) =>
            successfulByLogin.get(source.login.toLocaleLowerCase("en-US")) ??
            failedByLogin.get(source.login.toLocaleLowerCase("en-US")),
        )
        .filter((entry): entry is GithubRefreshReportEntry => Boolean(entry));
      setGithubRefreshReport({
        refreshedAt: new Date().toISOString(),
        refreshedOwners: sources.length,
        added: result.added,
        skipped: result.skipped,
        failed: failures.length,
        entries,
      });
      const summary = `已刷新 ${imports.length} 个作者仓库，新增 ${result.added} 个，跳过 ${result.skipped} 个。`;
      setTransferNotice({
        kind: failures.length > 0 ? "error" : "success",
        message:
          failures.length > 0
            ? `${summary}失败 ${failures.length} 个。`
            : summary,
      });
    } finally {
      setGithubBulkRefreshLoading(false);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      const imported = routeGithubSitesInState(
        parseImportFile(await file.text()),
      ).state;
      setGroupDialogOpen(false);
      setSettingsOpen(false);
      setSettingsPreview(null);
      setTransferNotice(null);
      setPendingImport(imported);
    } catch (error) {
      setGroupDialogOpen(false);
      setSettingsOpen(false);
      setSettingsPreview(null);
      setTransferNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "无法读取这个收藏文件。",
      });
    }
  }

  async function handleGroupImportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    const targetGroupId = groupImportTargetRef.current;
    groupImportTargetRef.current = null;
    if (!file || !targetGroupId) return;

    try {
      const payload = parseGroupImportFile(await file.text());
      const preview = mergeGroupImportIntoState(state, targetGroupId, payload);
      setPendingGroupImport({
        targetGroupId,
        payload,
        added: preview.added,
        skipped: preview.skipped,
      });
    } catch (error) {
      setTransferNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "无法读取这个分组资源包。",
      });
    }
  }

  const collectionTitle =
    isGlobalCollectionSearch
      ? "全库搜索"
      : activeGroupId === "all"
      ? activeWorkspace === "github"
        ? "全部 GitHub"
        : "全部网站"
      : (activeGroup?.name ?? "网站");
  const appStyle = {
    "--font-scale": String(effectiveAppearance.fontScale / 100),
    "--ui-icon-scale": String(effectiveAppearance.uiIconScale / 100),
    "--control-scale": String(effectiveAppearance.controlScale / 100),
    "--radius-control": `${effectiveAppearance.controlRadius}px`,
    "--page-padding": `${effectiveAppearance.pagePadding}px`,
    "--brand-font-scale": String(
      Number(
        (
          (effectiveAppearance.fontScale / 100) *
          (effectiveAppearance.brandFontScale / 100)
        ).toFixed(4),
      ),
    ),
    "--card-font-scale": String(
      Number(
        (
          (effectiveAppearance.fontScale / 100) *
          (effectiveAppearance.cardFontScale / 100)
        ).toFixed(4),
      ),
    ),
    "--group-font-scale": String(
      Number(
        (
          (effectiveAppearance.fontScale / 100) *
          (effectiveAppearance.groupFontScale / 100)
        ).toFixed(4),
      ),
    ),
    "--brand-logo-size": `${effectiveAppearance.brandLogoSize}px`,
    "--brand-logo-scale": String(effectiveAppearance.brandLogoScale / 100),
    "--brand-logo-radius": `${effectiveAppearance.brandLogoRadius}px`,
    "--brand-gap": `${effectiveAppearance.brandGap}px`,
    "--topbar-height": `${effectiveAppearance.topbarHeight}px`,
    "--search-width": `${effectiveAppearance.searchWidth}px`,
    "--search-height": `${effectiveAppearance.searchHeight}px`,
    "--search-radius": `${effectiveAppearance.searchRadius}px`,
    "--group-tab-height": `${effectiveAppearance.groupTabHeight}px`,
    "--group-icon-size": `${effectiveAppearance.groupIconSize}px`,
    "--group-gap": `${effectiveAppearance.groupGap}px`,
    "--card-min-width": `${effectiveAppearance.cardWidth}px`,
    "--card-min-height": `${effectiveAppearance.cardHeight}px`,
    "--grid-gap": `${effectiveAppearance.gap}px`,
    "--content-max-width": `${effectiveAppearance.contentWidth}px`,
    "--radius-card": `${effectiveAppearance.radius}px`,
    "--card-padding": `${effectiveAppearance.cardPadding}px`,
    "--site-icon-size": `${effectiveAppearance.siteIconSize}px`,
    "--site-icon-scale": String(effectiveAppearance.siteIconScale / 100),
    "--wallpaper-fit": effectiveWallpaper.fit,
    "--wallpaper-position-x": `${effectiveWallpaper.positionX}%`,
    "--wallpaper-position-y": `${effectiveWallpaper.positionY}%`,
    "--wallpaper-zoom": String(effectiveWallpaper.zoom / 100),
    "--wallpaper-blur": `${effectiveWallpaper.blur}px`,
    "--wallpaper-overlay": String(effectiveWallpaper.overlay / 100),
    "--glass-opacity": `${100 - effectiveWallpaper.glassTransparency}%`,
    "--glass-control-opacity": `${100 - effectiveWallpaper.glassControlTransparency}%`,
    "--glass-panel-opacity": `${100 - effectiveWallpaper.glassPanelTransparency}%`,
    "--glass-popover-opacity": `${100 - effectiveWallpaper.glassPopoverTransparency}%`,
    "--glass-shadow-strength": String(effectiveWallpaper.glassShadow / 100),
    "--glass-highlight": String(effectiveWallpaper.glassHighlight / 100),
    "--glass-filter": `blur(${effectiveWallpaper.glassBlur}px) saturate(${effectiveWallpaper.glassSaturation}%)`,
    "--glass-card-filter": `blur(${effectiveWallpaper.glassBlur}px) saturate(${effectiveWallpaper.glassSaturation}%) url(#wallpaper-glass-lens)`,
    "--glass-wide-filter": `blur(${effectiveWallpaper.glassBlur}px) saturate(${effectiveWallpaper.glassSaturation}%) url(#wallpaper-glass-lens-wide)`,
    "--glass-search-filter": `blur(${effectiveWallpaper.glassBlur}px) saturate(${effectiveWallpaper.glassSaturation}%) url(#wallpaper-glass-lens-search)`,
    "--topbar-background": `color-mix(in srgb, var(--page) ${effectiveWallpaper.topbarOpacity}%, transparent)`,
    "--topbar-backdrop-blur": effectiveWallpaper.topbarBlurEnabled
      ? `${effectiveWallpaper.topbarBlur}px`
      : "0px",
  } as CSSProperties;

  useInsertionEffect(() => {
    const root = document.documentElement;
    // Publish shared CSS tokens before child layout effects measure cards and
    // lenses. Late tokens made border-color fall back to currentColor, then
    // animated that invalid first style into the saved glass material.
    for (const [property, value] of Object.entries(appStyle)) {
      root.style.setProperty(property, String(value));
    }
  }, [
    effectiveAppearance,
    effectiveWallpaper,
    wallpaperUrl,
  ]);

  useEffect(() => {
    document.title = `${effectiveBrand.name} · 网站收藏`;
  }, [effectiveBrand.name]);

  if (isLoading || waitingForWallpaper) {
    return <span className="visually-hidden" role="status">正在读取收藏</span>;
  }

  return (
    <div
      data-app-shell
      className={`app-shell min-h-[100dvh] ${
        activeDragId || pendingDragId ? "is-site-dragging" : ""
      } ${settingsOpen ? "settings-open" : ""} ${
        wallpaperUrl ? `has-wallpaper topbar-${effectiveWallpaper.topbarStyle} ${effectiveWallpaper.glassRefraction && supportsGlassRefraction ? "glass-refraction" : ""}` : ""
      }`}
      style={appStyle}
      {...siteClickHandlers}
    >
      {wallpaperUrl && effectiveWallpaper.glassRefraction && supportsGlassRefraction && <GlassRefraction strength={effectiveWallpaper.glassRefractionStrength} cardRadius={effectiveAppearance.radius} searchRadius={effectiveAppearance.searchRadius} />}
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
                !browserHistoryOpen && activeWorkspace === "main" ? "active" : ""
              }`}
              aria-label="打开收藏主页"
              aria-pressed={!browserHistoryOpen && activeWorkspace === "main"}
              onClick={openCollectionHome}
            >
              <House size={18} weight="regular" />
              <span>收藏主页</span>
            </button>
            <button
              type="button"
              className={`topbar-history-button topbar-github-button ${
                !browserHistoryOpen && activeWorkspace === "github" ? "active" : ""
              }`}
              aria-label="打开 GitHub 收藏"
              aria-pressed={!browserHistoryOpen && activeWorkspace === "github"}
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
            <button
              type="button"
              className="icon-button trash-button"
              onClick={() => openSettingsPanel("data", true)}
              aria-label="打开回收站"
              title="回收站"
            >
              <Trash size={19} weight="regular" />
            </button>
            <button
              type="button"
              className="icon-button settings-button"
              onClick={() => openSettingsPanel()}
              aria-label="打开设置"
              title="设置"
            >
              <GearSix size={19} weight="regular" />
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
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="page-container main-content">
          <BrowserHistoryView
            active={browserHistoryOpen}
            onBack={closeBrowserHistory}
            onRequestPermission={requestBrowserHistoryAccess}
            permissionError={historyPermissionError}
            permissionVersion={historyPermissionVersion}
          />
        {!browserHistoryOpen && (
          <>
        <WorkspaceSearch value={query} onChange={setCollectionQuery} label="搜索网页或筛选收藏" placeholder="搜索收藏，支持拼音、首字母缩写"
          onSubmit={handleSearchSubmit} inputProps={{ id: "site-search", onFocus: () => { setHistoryOpen(true); setHistoryIndex(-1); },
            onBlur: () => { window.setTimeout(() => setHistoryOpen(false), 120); }, onKeyDown: handleSearchKeyDown }}>
            {historyOpen && !query.trim() && state.searchHistory.length > 0 && (
              <div className="search-history" role="listbox" aria-label="最近搜索">
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
                      onClick={() => {
                        setCollectionQuery(entry.query);
                        void performSearch(entry.query);
                      }}
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
                  const count = state.sites.filter(
                    (site) => site.groupId === group.id,
                  ).length;
                  return (
                    <Fragment key={group.id}>
                      <GroupDropTab
                        group={group}
                        count={count}
                        selected={activeGroupId === group.id}
                        dragActive={
                          Boolean(activeDragId) &&
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
              <h2 id="collection-title">{collectionTitle}</h2>
              <p>
                {isSearching
                  ? `找到 ${visibleSites.length} 个结果`
                  : `${visibleSites.length} 个收藏`}
                </p>
            </div>
            <div className="collection-view-controls">
              <SelectMenu
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
              />
              {activeGroupId === "all" && !isSearching && (
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
                <CheckSquare size={16} />
                <span>
                  {multiSelectMode
                    ? selectedSiteCount > 0
                      ? `完成 ${selectedSiteCount}`
                      : "选择"
                    : "多选"}
                </span>
              </button>
              )}
            </div>
          </div>

          <div className="collection-grid-content">
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
                    <GroupedCollection sections={groupedSections} selection={{ ...selection,
                      toggleGroupSelection, toggleGroupedSiteSelection, enterGroupSelectionFromDoubleClick }}
                      drag={gridDrag} sorting={activeGroupSortAxis === "vertical"} sortDisabled={groupSortDisabled}
                      insertDisabled={Boolean(activeGroupSortId || activeDragId || isSearching || selectionArmed)}
                      onInsert={openNewGroupDialog} onManage={openGroupManager} onAdd={openAddDialog}
                      renderSite={renderCollectionCard} />
                  ) : (
                    <CollectionSiteGrid group={addCardGroup} sites={visibleSites} grouped={false} drag={gridDrag}
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
                    ) : activeDraggedSite && activeDraggedGroup ? (
                      <SiteCardDragPreview
                        site={activeDraggedSite}
                        group={activeDraggedGroup}
                        showClickCount={sortMode === "heat"}
                        overGroupTab={Boolean(dragHoverGroupId)}
                        batchCount={Math.max(1, batchDragIds.length)}
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
        onOpenChange={(open) => {
          if (!open) setGithubRefreshReport(null);
        }}
      />

      <NewGroupDialog
        open={newGroupDialogOpen}
        groups={groups}
        insertionContext={newGroupInsertionContext}
        onOpenChange={(open) => {
          setNewGroupDialogOpen(open);
          if (!open) {
            setNewGroupBeforeId(undefined);
            setNewGroupInsertionContext(undefined);
          }
        }}
        onSubmit={handleNewGroup}
      />

      <GroupDialog
        open={groupDialogOpen}
        initialGroupId={managedGroupId}
        groups={groups}
        sites={state.sites}
        onOpenChange={(open) => {
          setGroupDialogOpen(open);
          if (!open) setManagedGroupId(undefined);
        }}
        onUpdate={updateGroup}
        onReorder={reorderManagedGroups}
        onDelete={handleGroupDelete}
        onDeleteMany={(ids) => {
          const deleted = groups.filter(group => ids.includes(group.id) && !group.isProtected);
          const count = state.sites.filter(site => deleted.some(group => group.id === site.groupId)).length;
          deleteGroups(deleted.map(group => group.id));
          if (ids.includes(activeGroupId)) setActiveGroupId("all");
          setTransferNotice({ kind: "success", message: `已删除 ${deleted.length} 个分组，${count} 个链接已移入回收站。` });
        }}
        onExportGroup={handleGroupExport}
        onImportGroup={requestGroupImport}
      />

      {!settingsOpen && <TopbarResizeHandle value={effectiveAppearance.topbarHeight}
        onChange={(topbarHeight) => setSettingsPreview({ brand: state.brand, wallpaper: state.wallpaper,
          appearance: patchAppearance(state.appearance, { topbarHeight }) })}
        onCancel={() => setSettingsPreview(null)}
        onCommit={(topbarHeight) => {
          saveSettings(state.brand, patchAppearance(state.appearance, { topbarHeight }), state.wallpaper);
          setSettingsPreview(null);
        }} />}
      <SettingsPanel
        wallpaperPreviewUrl={wallpaperUrl}
        open={settingsOpen}
        state={state}
        initialSection={settingsInitialSection}
        initialTrashOpen={settingsInitialTrashOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) {
            setSettingsInitialSection("appearance");
            setSettingsInitialTrashOpen(false);
          }
        }}
        onPreview={setSettingsPreview}
        onSave={(draft) =>
          saveSettings(
            draft.brand,
            draft.appearance,
            draft.wallpaper,
          )
        }
        onExport={handleExport}
        onImport={() => importInputRef.current?.click()}
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

      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        accept=".json,application/json"
        aria-label="选择要导入的收藏文件"
        onChange={handleImportFile}
      />

      <input
        ref={groupImportInputRef}
        className="visually-hidden"
        type="file"
        accept=".json,application/json"
        aria-label="选择要导入的分组资源包"
        onChange={handleGroupImportFile}
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
          setActiveGroupId("all");
          setResetOpen(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingImport)}
        title="导入并替换收藏？"
        description={
          pendingImport
            ? `将导入 ${pendingImport.sites.length} 个网站和 ${pendingImport.groups.length} 个分组，当前收藏会被替换。`
            : ""
        }
        confirmLabel="确认导入"
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
        onConfirm={() => {
          if (pendingImport) {
            replaceState(pendingImport);
            resetCollectionQuery();
            setActiveGroupId("all");
            setTransferNotice({
              kind: "success",
              message: "收藏数据已成功导入。",
            });
          }
          setPendingImport(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingGroupImport)}
        title="导入分组资源？"
        description={
          pendingGroupImport
            ? (() => {
                const target = groups.find(
                  (group) => group.id === pendingGroupImport.targetGroupId,
                );
                return `来源分组“${pendingGroupImport.payload.group.name}”，将追加到“${
                  target?.name ?? "当前分组"
                }”。共 ${pendingGroupImport.payload.sites.length} 个网站，新增 ${
                  pendingGroupImport.added
                } 个，重复跳过 ${pendingGroupImport.skipped} 个。目标分组名称和图标保持不变。`;
              })()
            : ""
        }
        confirmLabel="确认导入"
        onOpenChange={(open) => {
          if (!open) setPendingGroupImport(null);
        }}
        onConfirm={() => {
          if (pendingGroupImport) {
            const result = importGroup(
              pendingGroupImport.targetGroupId,
              pendingGroupImport.payload,
            );
            setTransferNotice({
              kind: "success",
              message: `已导入 ${result.added} 个网站，跳过 ${result.skipped} 个重复链接。`,
            });
          }
          setPendingGroupImport(null);
        }}
      />
    </div>
  );
}
