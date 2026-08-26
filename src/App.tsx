import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  closestCorners,
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
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
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowBendDownLeft,
  ArrowsDownUp,
  CaretDown,
  Check,
  CheckSquare,
  ClockCounterClockwise,
  FolderOpen,
  FolderPlus,
  GearSix,
  MagnifyingGlass,
  LinkSimple,
  Plus,
  Rows,
  SquaresFour,
  Trash,
  X,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
import { AddSiteCard } from "./components/add-site-card";
import { BrandMark } from "./components/brand-mark";
import { BrowserHistoryView } from "./components/browser-history-view";
import { ConfirmDialog } from "./components/confirm-dialog";
import { GroupDialog } from "./components/group-dialog";
import {
  GroupDropGrid,
  GroupDropTab,
  groupSortRowId,
  groupSortTabId,
  readDropGroupId,
  readGroupSortId,
} from "./components/group-drop-target";
import { NewGroupDialog } from "./components/new-group-dialog";
import { GroupSortDragPreview } from "./components/group-sort-preview";
import { SortableGroupSection } from "./components/sortable-group-section";
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
import { useTheme } from "./hooks/use-theme";
import { useWallpaper } from "./hooks/use-wallpaper";
import { requestHistoryPermission } from "./lib/browser-history";
import { searchWeb } from "./lib/browser-search";
import type { DroppedSitePreview } from "./lib/external-link-drop";
import {
  groupSortIntentFromTargetIndex,
  resolveGroupSortIntent,
  type GroupSortAxis,
  type GroupSortIntent,
  type GroupSortRect,
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
  moveSiteToGroupEnd,
  moveSitesToGroupEnd,
  reorderSites,
  reorderSitesGlobally,
  sortSitesByHeat,
} from "./lib/site-utils";
import type {
  CategoryIcon as GroupIconName,
  SiteCollectionState,
  SiteFormValues,
  SiteGroup,
  SiteItem,
} from "./types";
import { mergeGroupImportIntoState } from "./lib/site-state";

type GroupFilter = "all" | string;
type SiteSortMode =
  | "manual"
  | "name-asc"
  | "name-desc"
  | "newest"
  | "oldest"
  | "heat";
type SelectionTarget = "sites" | "groups" | null;

interface StableDropRect {
  id: string;
  groupId: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

interface StableDropGeometry {
  sites: StableDropRect[];
  groups: StableDropRect[];
  groupEnds: StableDropRect[];
}

interface RectEdges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

type SiteDropIntent =
  | { type: "site"; siteId: string; groupId: string }
  | { type: "group-end"; groupId: string };

const DROP_TARGET_HYSTERESIS = 18;
const GROUP_SORT_ACTIVATION_DISTANCE = 8;
const SITE_DRAG_ACTIVATION_DISTANCE = 50;
const TAB_EDGE_SCROLL_ZONE = 56;
const TAB_EDGE_SCROLL_MIN_SPEED = 4;
const TAB_EDGE_SCROLL_MAX_SPEED = 18;
class CollectionMouseSensor extends MouseSensor {
  constructor(props: ConstructorParameters<typeof MouseSensor>[0]) {
    const target = props.event.target;
    const groupSortGesture =
      target instanceof Element && Boolean(target.closest("[data-group-sort-handle]"));
    super({
      ...props,
      options: {
        ...props.options,
        activationConstraint: {
          distance: groupSortGesture
            ? GROUP_SORT_ACTIVATION_DISTANCE
            : SITE_DRAG_ACTIVATION_DISTANCE,
        },
      },
    });
  }
}

class CollectionTouchSensor extends TouchSensor {
  constructor(props: ConstructorParameters<typeof TouchSensor>[0]) {
    const target = props.event.target;
    const groupSortGesture =
      target instanceof Element && Boolean(target.closest("[data-group-sort-handle]"));
    super({
      ...props,
      options: {
        ...props.options,
        activationConstraint: {
          distance: groupSortGesture
            ? GROUP_SORT_ACTIVATION_DISTANCE
            : SITE_DRAG_ACTIVATION_DISTANCE,
        },
      },
    });
  }
}

function pointInDropRect(rect: StableDropRect, x: number, y: number) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function distanceToDropRect(rect: StableDropRect, x: number, y: number) {
  return Math.hypot(x - rect.centerX, y - rect.centerY);
}

function rectOverlapArea(first: RectEdges, second: RectEdges) {
  const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  return width > 0 && height > 0 ? width * height : 0;
}

const SORT_OPTIONS: Array<{ value: SiteSortMode; label: string }> = [
  { value: "manual", label: "手动排列" },
  { value: "name-asc", label: "名称 A–Z" },
  { value: "name-desc", label: "名称 Z–A" },
  { value: "newest", label: "最近添加" },
  { value: "oldest", label: "最早添加" },
  { value: "heat", label: "热量排列" },
];

export function App() {
  const {
    state,
    isLoading,
    recovered,
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
    importGroup,
    reset,
    replaceState,
    saveSettings,
    recordSearch,
    deleteSearchHistory,
    clearSearchHistory,
    setDisplayMode,
  } = useSiteHub();
  const [settingsPreview, setSettingsPreview] =
    useState<SettingsDraft | null>(null);
  const effectiveTheme =
    settingsPreview?.themePreference ?? state.themePreference;
  const effectiveBrand = settingsPreview?.brand ?? state.brand;
  const effectiveAppearance =
    settingsPreview?.appearance ?? state.appearance;
  const effectiveWallpaper =
    settingsPreview?.wallpaper ?? state.wallpaper;
  const resolvedTheme = useTheme(effectiveTheme);
  const { imageUrl: wallpaperUrl, error: wallpaperError } =
    useWallpaper(effectiveWallpaper);
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<GroupFilter>("all");
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [dialogGroupId, setDialogGroupId] = useState<string>();
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
  const [pendingDragId, setPendingDragId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overDragId, setOverDragId] = useState<string | null>(null);
  const [dragSitesPreview, setDragSitesPreview] = useState<SiteItem[] | null>(
    null,
  );
  const [dragHoverGroupId, setDragHoverGroupId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [browserHistoryOpen, setBrowserHistoryOpen] = useState(false);
  const [historyPermissionVersion, setHistoryPermissionVersion] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sortMode, setSortMode] = useState<SiteSortMode>("manual");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectionArmed, setSelectionArmed] = useState(false);
  const [selectionTarget, setSelectionTarget] =
    useState<SelectionTarget>(null);
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [batchDragIds, setBatchDragIds] = useState<string[]>([]);
  const [activeGroupSortId, setActiveGroupSortId] = useState<string | null>(null);
  const [activeGroupSortAxis, setActiveGroupSortAxis] =
    useState<GroupSortAxis | null>(null);
  const [groupSortIntent, setGroupSortIntent] =
    useState<GroupSortIntent | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const groupImportInputRef = useRef<HTMLInputElement>(null);
  const groupImportTargetRef = useRef<string | null>(null);
  const viewControlsRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const dragSitesPreviewRef = useRef<SiteItem[] | null>(null);
  const dragBaseSitesRef = useRef<SiteItem[] | null>(null);
  const suppressSiteClickRef = useRef(false);
  const suppressSiteClickTimerRef = useRef<number | null>(null);
  const suppressedSiteLinkRef = useRef<{
    element: HTMLAnchorElement;
    href: string;
  } | null>(null);
  const sitePointerGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    crossedDragThreshold: boolean;
    link: HTMLAnchorElement;
  } | null>(null);
  const hoveredGroupTabRef = useRef<string | null>(null);
  const pointerGroupZoneRef = useRef<string | null>(null);
  const pointerAtGroupEndRef = useRef(false);
  const stableDropGeometryRef = useRef<StableDropGeometry | null>(null);
  const stableCollisionIdRef = useRef<string | null>(null);
  const activeDragIdRef = useRef<string | null>(null);
  const dragCanReorderRef = useRef(true);
  const siteDropIntentRef = useRef<SiteDropIntent | null>(null);
  const lastValidSiteTargetRef = useRef<{
    siteId: string;
    groupId: string;
  } | null>(null);
  const dragOriginGroupIdRef = useRef<string | null>(null);
  const dragStartedFromAllRef = useRef(true);
  const switchedDragGroupIdRef = useRef<string | null>(null);
  const groupHoverTimerRef = useRef<number | null>(null);
  const groupOverlapFrameRef = useRef<number | null>(null);
  const batchDragIdsRef = useRef<string[]>([]);
  const armedDeleteTimerRef = useRef<number | null>(null);
  const activeGroupSortIdRef = useRef<string | null>(null);
  const activeGroupSortIdsRef = useRef<string[]>([]);
  const activeGroupSortAxisRef = useRef<GroupSortAxis | null>(null);
  const groupSortIntentRef = useRef<GroupSortIntent | null>(null);
  const groupSortOrderRef = useRef<string[]>([]);
  const groupSortKeyboardRef = useRef(false);
  const groupSortPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerXRef = useRef<number | null>(null);
  const tabsAutoScrollFrameRef = useRef<number | null>(null);

  const groups = useMemo(
    () => state.groups.slice().sort((a, b) => a.order - b.order),
    [state.groups],
  );
  const defaultGroup =
    groups.find((group) => !group.isProtected) ??
    groups.find((group) => group.id === OTHER_GROUP_ID) ??
    groups[0];
  const activeGroup =
    activeGroupId === "all"
      ? undefined
      : groups.find((group) => group.id === activeGroupId);
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
  const renderedSites = dragSitesPreview ?? state.sites;
  const scopedSites = useMemo(
    () => filterSites(renderedSites, query, groups, activeGroupId),
    [renderedSites, query, groups, activeGroupId],
  );
  const visibleSites = useMemo(() => {
    if (sortMode === "manual") return scopedSites;
    if (sortMode === "heat") return sortSitesByHeat(scopedSites, activeGroupId);
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
  }, [activeGroupId, scopedSites, sortMode]);
  const isSearching = Boolean(query.trim());
  const isGroupedView =
    activeGroupId === "all" && state.displayMode === "grouped";
  const groupSelectionActive = selectedGroupIds.size > 0;
  const groupSelectionMode =
    isGroupedView &&
    selectionArmed &&
    !multiSelectMode &&
    selectionTarget === "groups";
  const groupedSelectionPending =
    isGroupedView &&
    selectionArmed &&
    selectedGroupIds.size === 0 &&
    selectedSiteIds.size === 0;
  const groupedSiteSelectionEntryEnabled =
    isGroupedView &&
    selectionArmed &&
    !multiSelectMode &&
    (selectionTarget === null || selectionTarget === "sites");
  const groupedGroupSelectionEntryEnabled =
    isGroupedView &&
    selectionArmed &&
    !multiSelectMode &&
    (selectionTarget === null || selectionTarget === "groups");
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
    settingsOpen ||
    resetOpen ||
    Boolean(pendingImport);
  const groupSortDisabled =
    isSearching ||
    multiSelectMode ||
    (groupSelectionMode && !groupSelectionActive) ||
    Boolean(activeDragId) ||
    anyModalOpen;
  const addCardGroup = activeGroup ?? defaultGroup;
  const groupedSections = useMemo(
    () =>
      groups
        .map((group) => {
          const sites = visibleSites
            .filter((site) => site.groupId === group.id)
            .sort((a, b) =>
              sortMode === "manual"
                ? a.order - b.order
                : sortMode === "heat"
                  ? b.clickCount - a.clickCount || a.order - b.order
                  : 0,
            );
          return { group, sites };
        })
        .filter(({ sites }) => !isSearching || sites.length > 0),
    [groups, isSearching, sortMode, visibleSites],
  );
  const activeDraggedSite = activeDragId
    ? (dragSitesPreviewRef.current ?? renderedSites).find(
        (site) => site.id === activeDragId,
      )
    : undefined;
  const activeDraggedGroup = activeDraggedSite
    ? groups.find((group) => group.id === activeDraggedSite.groupId)
    : undefined;
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
    setSelectedSiteIds((current) => {
      const validIds = new Set(state.sites.map((site) => site.id));
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [state.sites]);

  useEffect(() => {
    if (!isSearching) return;
    setMultiSelectMode(false);
    setSelectedSiteIds(new Set());
    setSelectionArmed(false);
    setSelectionTarget(null);
  }, [isSearching]);

  useEffect(() => {
    if (isGroupedView && !isSearching) return;
    setSelectedGroupIds(new Set());
    if (!isGroupedView) {
      setSelectionArmed(false);
      setSelectionTarget(null);
    }
  }, [isGroupedView, isSearching]);

  useEffect(() => {
    function handleOutsidePointer(event: PointerEvent) {
      if (!viewControlsRef.current?.contains(event.target as Node)) {
        setSortMenuOpen(false);
        setDisplayMenuOpen(false);
      }
      if (!addMenuRef.current?.contains(event.target as Node)) {
        setAddMenuOpen(false);
      }
      const deleteButton = (event.target as Element).closest<HTMLElement>(
        "[data-delete-site-id]",
      );
      if (
        armedDeleteSiteId &&
        deleteButton?.dataset.deleteSiteId !== armedDeleteSiteId
      ) {
        clearArmedDelete();
      }
      if (selectionArmed) {
        const selectionSurface = (event.target as Element).closest(
          "[data-selection-surface]",
        );
        if (!selectionSurface) {
          setSelectionArmed(false);
          setSelectionTarget(null);
          setSelectedGroupIds(new Set());
          setSelectedSiteIds(new Set());
          setMultiSelectMode(false);
        }
      }
    }
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setAddMenuOpen(false);
      clearArmedDelete();
      setSelectionArmed(false);
      setSelectionTarget(null);
      setSelectedSiteIds(new Set());
      setSelectedGroupIds(new Set());
      setMultiSelectMode(false);
    }
    window.addEventListener("pointerdown", handleOutsidePointer);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [armedDeleteSiteId, selectionArmed]);

  useEffect(() => {
    if (!transferNotice) return;
    const timer = window.setTimeout(() => setTransferNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [transferNotice]);

  function captureStableDropGeometry() {
    const readRect = (
      element: HTMLElement,
      id: string,
      groupId: string,
    ): StableDropRect => {
      const rect = element.getBoundingClientRect();
      const left = rect.left + window.scrollX;
      const top = rect.top + window.scrollY;
      return {
        id,
        groupId,
        left,
        right: left + rect.width,
        top,
        bottom: top + rect.height,
        centerX: left + rect.width / 2,
        centerY: top + rect.height / 2,
      };
    };

    const sites = Array.from(
      document.querySelectorAll<HTMLElement>("[data-site-dnd-id]"),
    ).map((element) =>
      readRect(
        element,
        element.dataset.siteDndId!,
        element.dataset.siteGroupId!,
      ),
    );
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>("[data-group-zone-id]"),
    ).map((element) =>
      readRect(
        element,
        `group-zone:${element.dataset.groupZoneId!}`,
        element.dataset.groupZoneId!,
      ),
    );
    const groupEnds = Array.from(
      document.querySelectorAll<HTMLElement>("[data-add-site-group-id]"),
    ).map((element) =>
      readRect(
        element,
        `group-zone:${element.dataset.addSiteGroupId!}`,
        element.dataset.addSiteGroupId!,
      ),
    );

    stableDropGeometryRef.current = { sites, groups, groupEnds };
  }

  const activeCollisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      if (args.active.data.current?.type === "group-row-sort") {
        return detectGroupSortCollisions(args, "vertical");
      }
      const siteIds = new Set(renderedSites.map((site) => site.id));
      const activeId = String(args.active.id);
      const pointerCollisions = pointerWithin(args);
      const groupTabCollision = pointerCollisions.find(({ id }) =>
        String(id).startsWith("group-tab:"),
      );
      if (groupTabCollision) return [groupTabCollision];

      const geometry = stableDropGeometryRef.current;
      const pointer = args.pointerCoordinates;
      if (!dragCanReorderRef.current) {
        if (geometry && pointer) {
          const pointerX = pointer.x + window.scrollX;
          const pointerY = pointer.y + window.scrollY;
          const pointedGroup = geometry.groups.find(
            (rect) =>
              !isTransferTargetNoOp(rect.groupId) &&
              pointInDropRect(rect, pointerX, pointerY),
          );
          if (pointedGroup) return [{ id: pointedGroup.id }];
        }

        const pointedGroupZone = pointerCollisions.find(({ id }) => {
          const groupId = readDropGroupId(String(id));
          return groupId && !isTransferTargetNoOp(groupId);
        });
        return pointedGroupZone ? [pointedGroupZone] : [];
      }

      if (geometry && pointer) {
        const pointerX = pointer.x + window.scrollX;
        const pointerY = pointer.y + window.scrollY;
        const groupEnd = geometry.groupEnds.find((rect) =>
          pointInDropRect(rect, pointerX, pointerY),
        );
        if (groupEnd) {
          stableCollisionIdRef.current = groupEnd.id;
          return [{ id: groupEnd.id }];
        }

        const pointedGroup = geometry.groups.find((rect) =>
          pointInDropRect(rect, pointerX, pointerY),
        );
        const isGlobalFlatView = activeGroupId === "all" && !isGroupedView;
        const candidates = geometry.sites.filter(
          (rect) => isGlobalFlatView || rect.groupId === pointedGroup?.groupId,
        );

        if (candidates.length > 0 && (pointedGroup || isGlobalFlatView)) {
          const collisionRect = {
            left: args.collisionRect.left + window.scrollX,
            right: args.collisionRect.right + window.scrollX,
            top: args.collisionRect.top + window.scrollY,
            bottom: args.collisionRect.bottom + window.scrollY,
          };
          const collisionCenterX =
            (collisionRect.left + collisionRect.right) / 2;
          const collisionCenterY =
            (collisionRect.top + collisionRect.bottom) / 2;
          const overlappingCandidates = candidates
            .map((rect) => ({
              rect,
              area: rectOverlapArea(collisionRect, rect),
            }))
            .filter(({ area }) => area > 0);
          const candidate =
            overlappingCandidates.length > 0
              ? overlappingCandidates.reduce((best, current) =>
                  current.area > best.area ? current : best,
                ).rect
              : candidates.reduce((nearest, rect) =>
                  distanceToDropRect(
                    rect,
                    collisionCenterX,
                    collisionCenterY,
                  ) <
                  distanceToDropRect(
                    nearest,
                    collisionCenterX,
                    collisionCenterY,
                  )
                    ? rect
                    : nearest,
                );
          const previous = candidates.find(
            (rect) => rect.id === stableCollisionIdRef.current,
          );
          const shouldKeepPrevious =
            previous &&
            previous.id !== candidate.id &&
            distanceToDropRect(
              candidate,
              collisionCenterX,
              collisionCenterY,
            ) +
              DROP_TARGET_HYSTERESIS >=
              distanceToDropRect(
                previous,
                collisionCenterX,
                collisionCenterY,
              );
          const stableTarget = shouldKeepPrevious ? previous : candidate;
          stableCollisionIdRef.current = stableTarget.id;
          return [{ id: stableTarget.id }];
        }

        if (pointedGroup) {
          stableCollisionIdRef.current = pointedGroup.id;
          return [{ id: pointedGroup.id }];
        }

        const previousId = stableCollisionIdRef.current;
        if (previousId) return [{ id: previousId }];
      }

      const activeSite = renderedSites.find((site) => site.id === activeId);
      const pointedSitesInActiveGroup = pointerCollisions.filter(({ id }) => {
        const pointedSite = renderedSites.find(
          (site) => site.id === String(id),
        );
        return (
          pointedSite &&
          pointedSite.id !== activeId &&
          pointedSite.groupId === activeSite?.groupId
        );
      });
      if (pointedSitesInActiveGroup.length > 0) {
        return pointedSitesInActiveGroup;
      }

      const intersections = rectIntersection(args);
      const intersectedSites = intersections.filter(
        ({ id }) => String(id) !== activeId && siteIds.has(String(id)),
      );
      if (intersectedSites.length > 0) return intersectedSites;

      const nearest = closestCorners(args);
      const nearestSites = nearest.filter(
        ({ id }) => String(id) !== activeId && siteIds.has(String(id)),
      );
      if (nearestSites.length > 0) return nearestSites;

      return intersections.length > 0
        ? intersections
        : nearest;
    },
    [activeGroupId, isGroupedView, renderedSites],
  );

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

  function handleDragStart(event: DragStartEvent) {
    clearArmedDelete();
    if (
      selectionArmed &&
      selectedSiteIds.size === 0 &&
      selectedGroupIds.size === 0
    ) {
      setSelectionArmed(false);
      setSelectionTarget(null);
    }
    const preview = state.sites.map((site) => ({ ...site }));
    const activeId = String(event.active.id);
    let nextBatchIds = [activeId];
    if (multiSelectMode) {
      const selectedForDrag = selectedSiteIds.has(activeId)
        ? new Set(selectedSiteIds)
        : new Set([activeId]);
      if (!selectedSiteIds.has(activeId)) setSelectedSiteIds(selectedForDrag);
      const domOrder = Array.from(
        document.querySelectorAll<HTMLElement>("[data-site-dnd-id]"),
      ).map((element) => element.dataset.siteDndId!);
      nextBatchIds = domOrder.filter((id) => selectedForDrag.has(id));
      for (const id of selectedForDrag) {
        if (!nextBatchIds.includes(id)) nextBatchIds.push(id);
      }
    }
    batchDragIdsRef.current = nextBatchIds;
    setBatchDragIds(nextBatchIds);
    activeDragIdRef.current = activeId;
    dragCanReorderRef.current = canReorderSites && !multiSelectMode;
    siteDropIntentRef.current = null;
    dragBaseSitesRef.current = preview;
    dragSitesPreviewRef.current = preview;
    dragOriginGroupIdRef.current =
      preview.find((site) => site.id === activeId)?.groupId ??
      null;
    dragStartedFromAllRef.current = activeGroupId === "all";
    switchedDragGroupIdRef.current = null;
    pointerGroupZoneRef.current = null;
    pointerAtGroupEndRef.current = false;
    stableCollisionIdRef.current = activeId;
    captureStableDropGeometry();
    lastValidSiteTargetRef.current = null;
    setDragSitesPreview(preview);
    setPendingDragId(null);
    setActiveDragId(activeId);
    setOverDragId(activeId);
    startGroupOverlapTracking();
    startTabsAutoScroll();
  }

  function armSiteClickSuppression() {
    suppressSiteClickRef.current = true;
    if (suppressSiteClickTimerRef.current !== null) {
      window.clearTimeout(suppressSiteClickTimerRef.current);
    }
    suppressSiteClickTimerRef.current = window.setTimeout(() => {
      clearSiteClickSuppression();
    }, 700);
  }

  function disableGestureSiteLink(link: HTMLAnchorElement) {
    if (suppressedSiteLinkRef.current?.element === link) return;
    const href = link.getAttribute("href");
    if (!href) return;
    suppressedSiteLinkRef.current = { element: link, href };
    link.removeAttribute("href");
  }

  function clearSiteClickSuppression() {
    suppressSiteClickRef.current = false;
    if (suppressSiteClickTimerRef.current !== null) {
      window.clearTimeout(suppressSiteClickTimerRef.current);
      suppressSiteClickTimerRef.current = null;
    }
    const suppressedLink = suppressedSiteLinkRef.current;
    if (suppressedLink?.element.isConnected) {
      suppressedLink.element.setAttribute("href", suppressedLink.href);
    }
    suppressedSiteLinkRef.current = null;
  }

  function clearGroupHoverTimer() {
    if (groupHoverTimerRef.current !== null) {
      window.clearTimeout(groupHoverTimerRef.current);
      groupHoverTimerRef.current = null;
    }
    hoveredGroupTabRef.current = null;
    setDragHoverGroupId(null);
  }

  function readOverlappingGroupTab() {
    const preview = document.querySelector<HTMLElement>(
      '[data-testid="site-card-drag-preview"]',
    );
    const tabsViewport = document.querySelector<HTMLElement>(".category-tabs");
    if (!preview || !tabsViewport) return null;

    const previewRect = preview.getBoundingClientRect();
    const viewportRect = tabsViewport.getBoundingClientRect();
    let bestMatch: { groupId: string; area: number } | null = null;

    const tabs = Array.from(
      document.querySelectorAll<HTMLElement>("[data-group-drop-id]"),
    );
    for (const tab of tabs) {
      if (tab.dataset.dragActive !== "true") continue;
      const tabRect = tab.getBoundingClientRect();
      const visibleTabRect = {
        left: Math.max(tabRect.left, viewportRect.left, 0),
        right: Math.min(tabRect.right, viewportRect.right, window.innerWidth),
        top: Math.max(tabRect.top, viewportRect.top, 0),
        bottom: Math.min(tabRect.bottom, viewportRect.bottom, window.innerHeight),
      };
      const area = rectOverlapArea(previewRect, visibleTabRect);
      const groupId = tab.dataset.groupDropId;
      if (groupId && area > 0 && (!bestMatch || area > bestMatch.area)) {
        bestMatch = { groupId, area };
      }
    }

    return bestMatch?.groupId ?? null;
  }

  function stopGroupOverlapTracking() {
    if (groupOverlapFrameRef.current !== null) {
      window.cancelAnimationFrame(groupOverlapFrameRef.current);
      groupOverlapFrameRef.current = null;
    }
  }

  function startGroupOverlapTracking() {
    stopGroupOverlapTracking();
    const trackOverlap = () => {
      if (!activeDragIdRef.current) {
        groupOverlapFrameRef.current = null;
        return;
      }
      const overlappingGroupId = readOverlappingGroupTab();
      if (overlappingGroupId) scheduleGroupTabSwitch(overlappingGroupId);
      else if (hoveredGroupTabRef.current) clearGroupHoverTimer();
      groupOverlapFrameRef.current = window.requestAnimationFrame(trackOverlap);
    };
    groupOverlapFrameRef.current = window.requestAnimationFrame(trackOverlap);
  }

  function setNextGroupSortIntent(intent: GroupSortIntent | null) {
    const current = groupSortIntentRef.current;
    if (
      current?.axis === intent?.axis &&
      current?.activeGroupId === intent?.activeGroupId &&
      current?.beforeGroupId === intent?.beforeGroupId
    ) {
      return;
    }
    groupSortIntentRef.current = intent;
    setGroupSortIntent(intent);
  }

  function readLiveGroupSortRects(axis: GroupSortAxis): GroupSortRect[] {
    const selector =
      axis === "horizontal"
        ? "[data-group-sort-tab-id]"
        : "[data-group-sort-section-id]";
    const elementsByGroupId = new Map(
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
        (element) => [
          axis === "horizontal"
            ? element.dataset.groupSortTabId!
            : element.dataset.groupSortSectionId!,
          element,
        ],
      ),
    );

    return groupSortOrderRef.current.flatMap((groupId) => {
      const element = elementsByGroupId.get(groupId);
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      const computedTransform = window.getComputedStyle(element).transform;
      let translateX = 0;
      let translateY = 0;
      if (computedTransform && computedTransform !== "none") {
        const matrix = new DOMMatrixReadOnly(computedTransform);
        translateX = matrix.m41;
        translateY = matrix.m42;
      }
      return [
        {
          groupId,
          start:
            axis === "horizontal"
              ? rect.left - translateX
              : rect.top - translateY,
          end:
            axis === "horizontal"
              ? rect.right - translateX
              : rect.bottom - translateY,
          crossStart:
            axis === "horizontal"
              ? rect.top - translateY
              : rect.left - translateX,
          crossEnd:
            axis === "horizontal"
              ? rect.bottom - translateY
              : rect.right - translateX,
        },
      ];
    });
  }

  function detectGroupSortCollisions(
    args: Parameters<CollisionDetection>[0],
    axis: GroupSortAxis,
  ): ReturnType<CollisionDetection> {
    const activeGroupId = readGroupSortId(String(args.active.id));
    if (!activeGroupId) return [];

    const idForGroup = axis === "horizontal" ? groupSortTabId : groupSortRowId;
    const groupContainers = args.droppableContainers.filter(({ id }) =>
      String(id).startsWith(
        axis === "horizontal" ? "group-sort-tab:" : "group-sort-row:",
      ),
    );
    if (!args.pointerCoordinates) {
      return closestCenter({
        ...args,
        droppableContainers: groupContainers,
      });
    }

    const orderedGroupIds = groupSortOrderRef.current;
    const orderedRects = orderedGroupIds.flatMap((groupId) => {
      const rect = args.droppableRects.get(idForGroup(groupId));
      if (!rect) return [];
      return [
        {
          groupId,
          start: axis === "horizontal" ? rect.left : rect.top,
          end: axis === "horizontal" ? rect.right : rect.bottom,
          crossStart: axis === "horizontal" ? rect.top : rect.left,
          crossEnd: axis === "horizontal" ? rect.bottom : rect.right,
        },
      ];
    });
    const intent = resolveGroupSortIntent({
      axis,
      activeGroupId,
      pointerPrimary:
        axis === "horizontal"
          ? args.pointerCoordinates.x
          : args.pointerCoordinates.y,
      pointerCross:
        axis === "horizontal"
          ? args.pointerCoordinates.y
          : args.pointerCoordinates.x,
      orderedRects,
    });
    const activeIndex = orderedGroupIds.indexOf(activeGroupId);
    const remainingGroupIds = orderedGroupIds.filter(
      (groupId) => groupId !== activeGroupId,
    );
    const targetIndex = intent
      ? intent.beforeGroupId === null
        ? orderedGroupIds.length - 1
        : remainingGroupIds.indexOf(intent.beforeGroupId)
      : activeIndex;
    const targetGroupId = orderedGroupIds[targetIndex] ?? activeGroupId;
    return [{ id: idForGroup(targetGroupId) }];
  }

  function updateGroupSortIntentFromPointer(x: number, y: number) {
    const activeGroupId = activeGroupSortIdRef.current;
    const axis = activeGroupSortAxisRef.current;
    if (!activeGroupId || !axis || groupSortKeyboardRef.current) return;
    groupSortPointerRef.current = { x, y };
    const orderedRects = readLiveGroupSortRects(axis);
    setNextGroupSortIntent(
      resolveGroupSortIntent({
        axis,
        activeGroupId,
        pointerPrimary: axis === "horizontal" ? x : y,
        pointerCross: axis === "horizontal" ? y : x,
        orderedRects,
      }),
    );
  }

  function updateKeyboardGroupSortIntent(overId?: string) {
    if (!groupSortKeyboardRef.current || !overId) return;
    const activeGroupId = activeGroupSortIdRef.current;
    const axis = activeGroupSortAxisRef.current;
    const overGroupId = readGroupSortId(overId);
    if (!activeGroupId || !axis || !overGroupId) return;
    setNextGroupSortIntent(
      groupSortIntentFromTargetIndex(
        axis,
        activeGroupId,
        groupSortOrderRef.current,
        groupSortOrderRef.current.indexOf(overGroupId),
      ),
    );
  }

  function stopTabsAutoScroll() {
    if (tabsAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(tabsAutoScrollFrameRef.current);
      tabsAutoScrollFrameRef.current = null;
    }
    dragPointerXRef.current = null;
  }

  function startTabsAutoScroll() {
    if (tabsAutoScrollFrameRef.current !== null) return;
    const tick = () => {
      if (!activeDragIdRef.current && !activeGroupSortIdRef.current) {
        tabsAutoScrollFrameRef.current = null;
        return;
      }
      const viewport = document.querySelector<HTMLElement>(".category-tabs");
      const pointerX = dragPointerXRef.current;
      if (viewport && pointerX !== null) {
        const rect = viewport.getBoundingClientRect();
        let direction = 0;
        let depth = 0;
        if (pointerX >= rect.left && pointerX < rect.left + TAB_EDGE_SCROLL_ZONE) {
          direction = -1;
          depth = (rect.left + TAB_EDGE_SCROLL_ZONE - pointerX) / TAB_EDGE_SCROLL_ZONE;
        } else if (
          pointerX <= rect.right &&
          pointerX > rect.right - TAB_EDGE_SCROLL_ZONE
        ) {
          direction = 1;
          depth = (pointerX - (rect.right - TAB_EDGE_SCROLL_ZONE)) / TAB_EDGE_SCROLL_ZONE;
        }
        if (direction !== 0) {
          const speed =
            TAB_EDGE_SCROLL_MIN_SPEED +
            (TAB_EDGE_SCROLL_MAX_SPEED - TAB_EDGE_SCROLL_MIN_SPEED) *
              Math.min(1, Math.max(0, depth));
          const before = viewport.scrollLeft;
          viewport.scrollLeft += direction * speed;
          if (viewport.scrollLeft !== before) {
            if (activeDragIdRef.current) {
              const overlappingGroupId = readOverlappingGroupTab();
              if (overlappingGroupId) scheduleGroupTabSwitch(overlappingGroupId);
            } else if (
              activeGroupSortAxisRef.current === "horizontal" &&
              groupSortPointerRef.current
            ) {
              updateGroupSortIntentFromPointer(
                groupSortPointerRef.current.x,
                groupSortPointerRef.current.y,
              );
            }
          }
        }
      }
      tabsAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };
    tabsAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  function scheduleGroupTabSwitch(groupId: string) {
    if (!dragCanReorderRef.current) {
      const previewGroupId =
        switchedDragGroupIdRef.current ?? dragOriginGroupIdRef.current;
      if (hoveredGroupTabRef.current !== groupId) {
        clearGroupHoverTimer();
        hoveredGroupTabRef.current = groupId;
        if (
          !dragStartedFromAllRef.current &&
          groupId !== previewGroupId
        ) {
          groupHoverTimerRef.current = window.setTimeout(() => {
            if (hoveredGroupTabRef.current !== groupId) return;
            switchedDragGroupIdRef.current = groupId;
            setActiveGroupId(groupId);
            groupHoverTimerRef.current = null;
          }, 450);
        }
      }
      setDragHoverGroupId(groupId);
      targetTransferGroup(groupId);
      return;
    }

    if (hoveredGroupTabRef.current === groupId) {
      setDragHoverGroupId(groupId);
      return;
    }
    clearGroupHoverTimer();
    hoveredGroupTabRef.current = groupId;
    setDragHoverGroupId(groupId);
    groupHoverTimerRef.current = window.setTimeout(() => {
      switchedDragGroupIdRef.current = groupId;
      stableCollisionIdRef.current = `group-zone:${groupId}`;
      previewGroupEndDrop(groupId);
      setActiveGroupId(groupId);
      groupHoverTimerRef.current = null;

      // Switching tabs replaces the visible grid. Rebuild the frozen drop
      // slots from the new group before interpreting another pointer move.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!dragSitesPreviewRef.current) return;
          captureStableDropGeometry();
          stableCollisionIdRef.current = `group-zone:${groupId}`;
        });
      });
    }, 450);
  }

  function updateDragPreview(next: SiteItem[]) {
    dragSitesPreviewRef.current = next;
  }

  function targetTransferGroup(groupId: string) {
    const activeId = activeDragIdRef.current;
    if (!activeId || !groupId || isTransferTargetNoOp(groupId)) {
      siteDropIntentRef.current = null;
      lastValidSiteTargetRef.current = null;
      if (activeId) setOverDragId(activeId);
      return;
    }

    siteDropIntentRef.current = { type: "group-end", groupId };
    lastValidSiteTargetRef.current = null;
    setOverDragId(`group-zone:${groupId}`);
  }

  function isTransferTargetNoOp(groupId: string) {
    const calculationBase = dragBaseSitesRef.current;
    const activeId = activeDragIdRef.current;
    if (!calculationBase || !activeId) return true;
    const draggedIds =
      batchDragIdsRef.current.length > 0
        ? batchDragIdsRef.current
        : [activeId];
    return draggedIds.every(
      (id) => calculationBase.find((site) => site.id === id)?.groupId === groupId,
    );
  }

  function previewGroupEndDrop(groupId: string) {
    if (!dragCanReorderRef.current) {
      targetTransferGroup(groupId);
      return;
    }

    const activeId = activeDragIdRef.current;
    const calculationBase = dragBaseSitesRef.current;
    if (!activeId || !calculationBase) return;

    const currentIntent = siteDropIntentRef.current;
    const alreadyTargetingEnd =
      currentIntent?.type === "group-end" &&
      currentIntent.groupId === groupId;
    siteDropIntentRef.current = { type: "group-end", groupId };
    lastValidSiteTargetRef.current = null;
    if (!alreadyTargetingEnd) {
      updateDragPreview(
        moveSiteToGroupEnd(calculationBase, activeId, groupId),
      );
      setOverDragId(`group-zone:${groupId}`);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : undefined;
    if (!overId || dragDisabled) {
      if (!dragCanReorderRef.current) {
        siteDropIntentRef.current = null;
        lastValidSiteTargetRef.current = null;
        setOverDragId(activeId);
      }
      clearGroupHoverTimer();
      return;
    }

    const current = dragSitesPreviewRef.current;
    if (!current) return;
    const calculationBase = dragBaseSitesRef.current ?? current;
    const overSite = calculationBase.find((site) => site.id === overId);
    const dropGroupId = readDropGroupId(overId);
    let next = current;

    if (!dragCanReorderRef.current) {
      const targetGroupId =
        dropGroupId ?? overSite?.groupId ?? pointerGroupZoneRef.current;
      if (targetGroupId) targetTransferGroup(targetGroupId);
      else targetTransferGroup(dragOriginGroupIdRef.current ?? "");

      if (overId.startsWith("group-tab:") && dropGroupId) {
        scheduleGroupTabSwitch(dropGroupId);
      } else {
        const overlappingGroupId = readOverlappingGroupTab();
        if (overlappingGroupId) scheduleGroupTabSwitch(overlappingGroupId);
        else clearGroupHoverTimer();
      }
      return;
    }

    if (overSite && activeId !== overId) {
      siteDropIntentRef.current = {
        type: "site",
        siteId: overId,
        groupId: overSite.groupId,
      };
      lastValidSiteTargetRef.current = {
        siteId: overId,
        groupId: overSite.groupId,
      };
      setOverDragId(overId);
      if (activeGroupId === "all" && !isGroupedView) {
        next = reorderSitesGlobally(calculationBase, activeId, overId);
      } else {
        next = reorderSites(calculationBase, activeId, overId);
      }
    } else if (overId === activeId && !pointerAtGroupEndRef.current) {
      siteDropIntentRef.current = null;
      lastValidSiteTargetRef.current = null;
      setOverDragId(activeId);
      next = calculationBase;
    } else if (dropGroupId) {
      const activeSite = calculationBase.find((site) => site.id === activeId);
      const lastTarget = lastValidSiteTargetRef.current;
      const isTransientSameGroupZone =
        activeSite?.groupId === dropGroupId &&
        lastTarget?.groupId === dropGroupId &&
        !pointerAtGroupEndRef.current;

      // Cards move out from under the pointer while making room. During that
      // transition dnd-kit can briefly report the parent group as the target.
      // Keep the last concrete card target unless the pointer is deliberately
      // over the add-card/end area.
      if (!isTransientSameGroupZone) {
        previewGroupEndDrop(dropGroupId);
        next = dragSitesPreviewRef.current ?? current;
      }
    }

    if (next !== current) updateDragPreview(next);
    if (overId.startsWith("group-tab:") && dropGroupId) {
      scheduleGroupTabSwitch(dropGroupId);
    } else {
      const overlappingGroupId = readOverlappingGroupTab();
      if (overlappingGroupId) scheduleGroupTabSwitch(overlappingGroupId);
      else clearGroupHoverTimer();
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    armSiteClickSuppression();
    stopGroupOverlapTracking();
    const { active } = event;
    const dropIntent = siteDropIntentRef.current;
    const calculationBase = dragBaseSitesRef.current;

    if (!dragCanReorderRef.current) {
      const targetGroupId = dropIntent?.groupId;
      const draggedIds =
        batchDragIdsRef.current.length > 0
          ? batchDragIdsRef.current
          : [String(active.id)];
      const hasTransfer = Boolean(
        calculationBase &&
          targetGroupId &&
          draggedIds.some(
            (id) =>
              calculationBase.find((site) => site.id === id)?.groupId !==
              targetGroupId,
          ),
      );
      if (calculationBase && targetGroupId && hasTransfer) {
        commitSites(
          moveSitesToGroupEnd(
            calculationBase,
            draggedIds,
            targetGroupId,
            draggedIds,
          ),
        );
        if (!dragStartedFromAllRef.current) {
          setActiveGroupId(targetGroupId);
        }
        if (multiSelectMode) {
          setMultiSelectMode(false);
          setSelectedSiteIds(new Set());
        }
      }
      clearDragState();
      return;
    }

    if (dropIntent && calculationBase && !dragDisabled) {
      const finalSites =
        dropIntent.type === "site"
          ? activeGroupId === "all" && !isGroupedView
            ? reorderSitesGlobally(
                calculationBase,
                String(active.id),
                dropIntent.siteId,
              )
            : reorderSites(
                calculationBase,
                String(active.id),
                dropIntent.siteId,
              )
          : moveSiteToGroupEnd(
              calculationBase,
              String(active.id),
              dropIntent.groupId,
            );
      commitSites(finalSites);
    }
    clearDragState();
  }

  function clearDragState() {
    stopGroupOverlapTracking();
    clearGroupHoverTimer();
    dragSitesPreviewRef.current = null;
    dragBaseSitesRef.current = null;
    pointerGroupZoneRef.current = null;
    pointerAtGroupEndRef.current = false;
    stableDropGeometryRef.current = null;
    stableCollisionIdRef.current = null;
    activeDragIdRef.current = null;
    dragCanReorderRef.current = true;
    siteDropIntentRef.current = null;
    lastValidSiteTargetRef.current = null;
    dragOriginGroupIdRef.current = null;
    dragStartedFromAllRef.current = true;
    switchedDragGroupIdRef.current = null;
    setDragSitesPreview(null);
    setPendingDragId(null);
    setActiveDragId(null);
    setOverDragId(null);
    batchDragIdsRef.current = [];
    setBatchDragIds([]);
    stopTabsAutoScroll();
  }

  function handleDragCancel() {
    armSiteClickSuppression();
    clearDragState();
  }

  useEffect(() => clearGroupHoverTimer, []);

  useEffect(
    () => () => {
      clearSiteClickSuppression();
      if (armedDeleteTimerRef.current !== null) {
        window.clearTimeout(armedDeleteTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const releaseDndPointer = () => {
      // MouseSensor/TouchSensor keep their own active state outside React.
      // Releasing a synthetic pointer event lets dnd-kit finish its sensor
      // cleanup after our refs have already been reset without committing a
      // stale drop intent.
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      document.dispatchEvent(new Event("touchcancel", { bubbles: true }));
    };
    const cancelDragOnWindowLoss = () => {
      if (activeGroupSortIdRef.current) {
        // dnd-kit may not receive the pointer-up once the browser window loses
        // focus. Clear the preview and intent immediately instead of leaving
        // the floating group card behind until the next in-page event.
        finishGroupSort(false);
        releaseDndPointer();
        return;
      }
      if (activeDragIdRef.current) {
        handleDragCancel();
        releaseDndPointer();
      }
    };
    const handlePointerMove = (event: PointerEvent | MouseEvent) => {
      if (activeDragIdRef.current || activeGroupSortIdRef.current) {
        dragPointerXRef.current = event.clientX;
      }
      if (activeGroupSortIdRef.current) {
        updateGroupSortIntentFromPointer(event.clientX, event.clientY);
      }
      if (!dragSitesPreviewRef.current) return;
      const element = document.elementFromPoint(event.clientX, event.clientY);
      pointerGroupZoneRef.current =
        element?.closest<HTMLElement>("[data-group-zone-id]")?.dataset
          .groupZoneId ?? null;
      const addSiteTarget = element?.closest<HTMLElement>(
        "[data-add-site-group-id]",
      );
      pointerAtGroupEndRef.current = Boolean(addSiteTarget);
      const addSiteGroupId = addSiteTarget?.dataset.addSiteGroupId;
      if (addSiteGroupId) previewGroupEndDrop(addSiteGroupId);
      const tab = element?.closest<HTMLElement>("[data-group-drop-id]");
      const pointerGroupId = tab?.dataset.groupDropId;
      if (pointerGroupId) scheduleGroupTabSwitch(pointerGroupId);
    };
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch && (activeDragIdRef.current || activeGroupSortIdRef.current)) {
        dragPointerXRef.current = touch.clientX;
      }
      if (touch && activeGroupSortIdRef.current) {
        updateGroupSortIntentFromPointer(touch.clientX, touch.clientY);
      }
    };
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("mousemove", handlePointerMove, true);
    window.addEventListener("touchmove", handleTouchMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener("blur", cancelDragOnWindowLoss);
    document.addEventListener("visibilitychange", cancelDragOnWindowLoss);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("mousemove", handlePointerMove, true);
      window.removeEventListener("touchmove", handleTouchMove, true);
      window.removeEventListener("blur", cancelDragOnWindowLoss);
      document.removeEventListener("visibilitychange", cancelDragOnWindowLoss);
      stopGroupOverlapTracking();
      stopTabsAutoScroll();
    };
  }, []);

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
      setSelectedSiteIds((current) => {
        if (!current.has(site.id)) return current;
        const next = new Set(current);
        next.delete(site.id);
        return next;
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

  function toggleSiteSelection(site: SiteItem) {
    clearArmedDelete();
    const next = new Set(selectedSiteIds);
    if (next.has(site.id)) next.delete(site.id);
    else next.add(site.id);
    setSelectedSiteIds(next);
    if (!isGroupedView) return;
    if (next.size > 0) {
      setSelectionArmed(true);
      setSelectionTarget("sites");
      setMultiSelectMode(true);
      return;
    }
    // Keep the link-selection intent armed after the last selected link is
    // toggled off. This returns to the discoverable link-selection state
    // instead of unexpectedly exiting multi-select altogether.
    setSelectionArmed(true);
    setSelectionTarget("sites");
    setMultiSelectMode(false);
  }

  function cancelSelection() {
    setSelectionArmed(false);
    setSelectionTarget(null);
    setSelectedSiteIds(new Set());
    setSelectedGroupIds(new Set());
    setMultiSelectMode(false);
  }

  function toggleMultiSelectMode() {
    clearArmedDelete();
    if (isGroupedView) {
      if (groupSelectionActive) {
        setSelectedGroupIds(new Set());
        setSelectedSiteIds(new Set());
        setMultiSelectMode(false);
        setSelectionArmed(true);
        setSelectionTarget("sites");
        return;
      }
      if (multiSelectMode && selectedSiteIds.size > 0) {
        setSelectedSiteIds(new Set());
        setMultiSelectMode(false);
        setSelectionArmed(true);
        setSelectionTarget("groups");
        return;
      }
      if (selectionArmed) {
        cancelSelection();
        return;
      }
      setSelectionArmed(true);
      setSelectionTarget(null);
      return;
    }

    setSelectedGroupIds(new Set());
    setMultiSelectMode((current) => {
      if (current) setSelectedSiteIds(new Set());
      return !current;
    });
  }

  function toggleGroupSelection(groupId: string) {
    clearArmedDelete();
    if (
      !isGroupedView ||
      multiSelectMode ||
      !selectionArmed ||
      (selectionTarget !== null && selectionTarget !== "groups")
    ) {
      return;
    }
    setSelectedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      if (next.size > 0) {
        setSelectionArmed(true);
        setSelectionTarget("groups");
      } else {
        // Keep the group-selection mode active after deselecting the last
        // group so another title click can select it again without leaving
        // the mode. Blank space, Esc, or the switch button still cancels it.
        setSelectionArmed(true);
        setSelectionTarget("groups");
      }
      return next;
    });
  }

  function enterGroupSelectionFromDoubleClick(groupId: string) {
    clearArmedDelete();
    if (
      !isGroupedView ||
      multiSelectMode ||
      selectedSiteIds.size > 0 ||
      groups.find((group) => group.id === groupId)?.isProtected
    ) {
      return;
    }
    setSelectedSiteIds(new Set());
    setSelectionArmed(true);
    setSelectionTarget("groups");
    setMultiSelectMode(false);
    setSelectedGroupIds((current) => {
      const next = new Set(current);
      next.add(groupId);
      return next;
    });
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

  function beginGroupSort(
    groupId: string,
    axis: GroupSortAxis,
    activatorEvent: Event,
  ) {
    clearArmedDelete();
    setGroupDialogOpen(false);
    setManagedGroupId(undefined);
    if (selectedGroupIds.size === 0) {
      setSelectionArmed(false);
      setSelectionTarget(null);
    }
    const activeIds =
      axis === "vertical" && selectedGroupIds.has(groupId)
        ? groups
            .filter(
              (group) =>
                !group.isProtected && selectedGroupIds.has(group.id),
            )
            .map((group) => group.id)
        : [groupId];
    if (axis === "vertical" && !selectedGroupIds.has(groupId)) {
      setSelectedGroupIds(new Set());
    }
    activeGroupSortIdRef.current = groupId;
    activeGroupSortIdsRef.current = activeIds;
    activeGroupSortAxisRef.current = axis;
    groupSortOrderRef.current = groups
      .filter((group) => !group.isProtected)
      .map((group) => group.id);
    groupSortKeyboardRef.current = activatorEvent.type.startsWith("key");
    groupSortPointerRef.current =
      "clientX" in activatorEvent && "clientY" in activatorEvent
        ? {
            x: Number(activatorEvent.clientX),
            y: Number(activatorEvent.clientY),
          }
        : null;
    setNextGroupSortIntent(null);
    setActiveGroupSortId(groupId);
    setActiveGroupSortAxis(axis);
    if (axis === "horizontal") startTabsAutoScroll();
  }

  function finishGroupSort(commit = true) {
    const hadGroupSelection = selectedGroupIds.size > 0;
    const intent = groupSortIntentRef.current;
    if (
      commit &&
      intent &&
      intent.activeGroupId === activeGroupSortIdRef.current
    ) {
      const activeIds = activeGroupSortIdsRef.current.length
        ? activeGroupSortIdsRef.current
        : [intent.activeGroupId];
      const activeSet = new Set(activeIds);
      let beforeGroupId = intent.beforeGroupId;
      if (beforeGroupId && activeSet.has(beforeGroupId)) {
        const targetIndex = groupSortOrderRef.current.indexOf(beforeGroupId);
        beforeGroupId =
          groupSortOrderRef.current.find(
            (groupId, index) => index > targetIndex && !activeSet.has(groupId),
          ) ?? null;
      }
      if (activeIds.length > 1) {
        reorderGroupBlock(activeIds, beforeGroupId);
      } else {
        reorderGroups(intent.activeGroupId, beforeGroupId);
      }
    }
    const wasBatch = activeGroupSortIdsRef.current.length > 1;
    activeGroupSortIdRef.current = null;
    activeGroupSortIdsRef.current = [];
    activeGroupSortAxisRef.current = null;
    groupSortOrderRef.current = [];
    groupSortKeyboardRef.current = false;
    groupSortPointerRef.current = null;
    groupSortIntentRef.current = null;
    setActiveGroupSortId(null);
    setActiveGroupSortAxis(null);
    setGroupSortIntent(null);
    if (wasBatch || hadGroupSelection) {
      cancelSelection();
    }
    stopTabsAutoScroll();
  }

  function handleGroupTabDragStart(event: DragStartEvent) {
    const groupId = readGroupSortId(String(event.active.id));
    if (groupId) beginGroupSort(groupId, "horizontal", event.activatorEvent);
  }

  function handleGroupTabDragOver(event: DragOverEvent) {
    updateKeyboardGroupSortIntent(
      event.over ? String(event.over.id) : undefined,
    );
  }

  function handleGroupTabDragEnd() {
    finishGroupSort(true);
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
    if (activeGroupSortIdRef.current) {
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
    setSiteDialogPrefill(prefill);
    setDialogGroupId(targetGroup.id);
    setSiteDialogOpen(true);
  }

  function selectGroup(groupId: GroupFilter) {
    clearArmedDelete();
    setActiveGroupId(groupId);
    cancelSelection();
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
    setSiteDialogPrefill(undefined);
    setDialogGroupId(site.groupId);
    setSiteDialogOpen(true);
  }

  function handleSiteSubmit(
    values: SiteFormValues & { url: string; customIconUrl?: string },
    replaceExistingId?: string,
  ) {
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
    const id = addGroup(name, icon, newGroupBeforeId);
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
    if (!historyOpen || state.searchHistory.length === 0) return;
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
        setQuery(historyQuery);
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

  async function requestBrowserHistoryAccess() {
    const granted = await requestHistoryPermission();
    if (granted) {
      setHistoryPermissionVersion((current) => current + 1);
    }
    return granted;
  }

  function openBrowserHistory() {
    setBrowserHistoryOpen(true);
    void requestBrowserHistoryAccess();
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      const imported = parseImportFile(await file.text());
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
    activeGroupId === "all" ? "全部网站" : (activeGroup?.name ?? "网站");
  const appStyle = {
    "--accent": effectiveAppearance.accentColor,
    "--accent-strong": `color-mix(in srgb, ${effectiveAppearance.accentColor} 84%, black)`,
    "--accent-soft": `color-mix(in srgb, ${effectiveAppearance.accentColor} 14%, var(--surface))`,
    "--accent-text":
      resolvedTheme === "dark"
        ? `color-mix(in srgb, ${effectiveAppearance.accentColor} 52%, white)`
        : effectiveAppearance.accentColor,
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
    "--topbar-background": `color-mix(in srgb, var(--page) ${effectiveWallpaper.topbarOpacity}%, transparent)`,
    "--topbar-backdrop-blur": effectiveWallpaper.topbarBlurEnabled
      ? `${effectiveWallpaper.topbarBlur}px`
      : "0px",
  } as CSSProperties;

  useEffect(() => {
    const root = document.documentElement;
    for (const [property, value] of Object.entries(appStyle)) {
      root.style.setProperty(property, String(value));
    }
  }, [
    effectiveAppearance,
    effectiveWallpaper,
    resolvedTheme,
  ]);

  useEffect(() => {
    document.title = `${effectiveBrand.name} · 网站收藏`;
  }, [effectiveBrand.name]);

  if (isLoading) {
    return (
      <div className="app-shell app-loading min-h-[100dvh]" role="status">
        <span className="brand-mark loading-mark">
          <SquaresFour size={22} weight="fill" />
        </span>
        <span>正在加载收藏…</span>
      </div>
    );
  }

  return (
    <div
      data-app-shell
      className={`app-shell min-h-[100dvh] ${
        activeDragId || pendingDragId ? "is-site-dragging" : ""
      } ${settingsOpen ? "settings-open" : ""} ${
        wallpaperUrl ? "has-wallpaper" : ""
      }`}
      style={appStyle}
      onPointerDownCapture={(event) => {
        const target = event.target as Element;
        const card = target.closest<HTMLElement>(".site-card");
        const isCardAction = Boolean(target.closest(".card-actions"));
        const link = card?.querySelector<HTMLAnchorElement>(
          ".site-card-full-link",
        );
        if (!card || !link || isCardAction) {
          sitePointerGestureRef.current = null;
          return;
        }
        clearSiteClickSuppression();
        sitePointerGestureRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          crossedDragThreshold: false,
          link,
        };
      }}
      onPointerMoveCapture={(event) => {
        const gesture = sitePointerGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (gesture.crossedDragThreshold) return;
        const distance = Math.hypot(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY,
        );
        if (distance > 50) {
          gesture.crossedDragThreshold = true;
          suppressSiteClickRef.current = true;
          disableGestureSiteLink(gesture.link);
        }
      }}
      onPointerUpCapture={(event) => {
        const gesture = sitePointerGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (gesture.crossedDragThreshold) armSiteClickSuppression();
        sitePointerGestureRef.current = null;
      }}
      onPointerCancelCapture={(event) => {
        const gesture = sitePointerGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (gesture.crossedDragThreshold) armSiteClickSuppression();
        sitePointerGestureRef.current = null;
      }}
      onClickCapture={(event) => {
        if (!suppressSiteClickRef.current) return;
        if (!(event.target as Element).closest(".site-card")) return;
        event.preventDefault();
        event.stopPropagation();
        clearSiteClickSuppression();
      }}
    >
      {wallpaperUrl && (
        <div className="wallpaper-layer" aria-hidden="true">
          <img src={wallpaperUrl} alt="" />
          <span />
        </div>
      )}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-navigation">
            {(effectiveBrand.showLogo || effectiveBrand.showName) && (
              <a
                className="brand"
                href="/"
                aria-label={`${effectiveBrand.name} 首页`}
                onClick={() => setBrowserHistoryOpen(false)}
              >
                {effectiveBrand.showLogo && <BrandMark brand={effectiveBrand} />}
                {effectiveBrand.showName && (
                  <span className="brand-name">{effectiveBrand.name}</span>
                )}
              </a>
            )}
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
              className="icon-button theme-button"
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
        {browserHistoryOpen ? (
          <BrowserHistoryView
            onBack={() => setBrowserHistoryOpen(false)}
            onRequestPermission={requestBrowserHistoryAccess}
            permissionVersion={historyPermissionVersion}
          />
        ) : (
          <>
        <motion.section
          className="workspace-intro"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="search-panel">
            <form
              className="search-input"
              role="search"
              onSubmit={handleSearchSubmit}
            >
              <MagnifyingGlass size={21} aria-hidden="true" />
              <input
                id="site-search"
                type="search"
                aria-label="搜索网页或筛选收藏"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  setHistoryOpen(true);
                  setHistoryIndex(-1);
                }}
                onBlur={() =>
                  window.setTimeout(() => setHistoryOpen(false), 120)
                }
                onKeyDown={handleSearchKeyDown}
                placeholder="搜索网页或筛选收藏"
                autoComplete="off"
              />
              <div className="search-trailing-actions">
                {query && (
                  <button
                    type="button"
                    className="clear-search"
                    aria-label="清空搜索"
                    onClick={() => setQuery("")}
                  >
                    <X size={17} />
                  </button>
                )}
                <button
                  type="submit"
                  className="search-submit"
                  disabled={!query.trim()}
                  aria-label="使用默认搜索引擎搜索"
                  title="使用默认搜索引擎搜索"
                >
                  <ArrowBendDownLeft size={15} weight="bold" />
                  <span>Enter</span>
                </button>
              </div>
            </form>
            {historyOpen && state.searchHistory.length > 0 && (
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
                        setQuery(entry.query);
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
          </div>
        </motion.section>

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
                  <span>{state.sites.length}</span>
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
            <div className="collection-view-controls" ref={viewControlsRef}>
              <div className="view-control">
                <button
                  type="button"
                  className={`view-control-button ${
                    sortMode !== "manual" ? "active" : ""
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={sortMenuOpen}
                  onClick={() => {
                    setSortMenuOpen((current) => !current);
                    setDisplayMenuOpen(false);
                  }}
                >
                  <ArrowsDownUp size={16} />
                  <span>
                    {SORT_OPTIONS.find((option) => option.value === sortMode)
                      ?.label ?? "排列"}
                  </span>
                  <CaretDown size={13} />
                </button>
                {sortMenuOpen && (
                  <div className="view-popover sort-popover" role="menu">
                    <span className="view-popover-label">排列方式</span>
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={sortMode === option.value}
                        className={sortMode === option.value ? "active" : ""}
                        onClick={() => {
                          setSortMode(option.value);
                          setSortMenuOpen(false);
                        }}
                      >
                        <span>{option.label}</span>
                        {sortMode === option.value && (
                          <Check size={15} weight="bold" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {activeGroupId === "all" && (
                <div className="view-control">
                  <button
                    type="button"
                    className={`view-control-button ${
                      state.displayMode === "grouped" ? "active" : ""
                    }`}
                    aria-haspopup="menu"
                    aria-expanded={displayMenuOpen}
                    onClick={() => {
                      setDisplayMenuOpen((current) => !current);
                      setSortMenuOpen(false);
                    }}
                  >
                    {state.displayMode === "grouped" ? (
                      <Rows size={16} />
                    ) : (
                      <SquaresFour size={16} />
                    )}
                    <span>显示</span>
                    <CaretDown size={13} />
                  </button>
                  {displayMenuOpen && (
                    <div
                      className="view-popover display-popover"
                      role="menu"
                      aria-label="网站显示方式"
                    >
                      <span className="view-popover-label">显示方式</span>
                      {([
                        { value: "flat" as const, label: "全部平铺", icon: SquaresFour },
                        { value: "grouped" as const, label: "按分组显示", icon: Rows },
                      ]).map((option) => {
                        const Icon = option.icon;
                        return (
                        <button
                          key={option.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={state.displayMode === option.value}
                          className={state.displayMode === option.value ? "active" : ""}
                           onClick={() => {
                             if (multiSelectMode) {
                               setMultiSelectMode(false);
                               setSelectedSiteIds(new Set());
                             }
                             setDisplayMode(option.value);
                            setDisplayMenuOpen(false);
                          }}
                        >
                          <Icon size={16} />
                          <span>{option.label}</span>
                          {state.displayMode === option.value && (
                            <Check size={15} weight="bold" />
                          )}
                        </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {!isGroupedView && (
              <button
                type="button"
                className={`view-control-button multi-select-button ${
                  multiSelectMode ? "active" : ""
                }`}
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

          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
          >
              {addCardGroup && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={activeCollisionDetection}
                  autoScroll={false}
                  measuring={{
                    droppable: { strategy: MeasuringStrategy.Always },
                  }}
                  onDragPending={(event) => {
                    if (!String(event.id).startsWith("group-sort-row:")) {
                      setPendingDragId(String(event.id));
                    }
                  }}
                  onDragAbort={() => setPendingDragId(null)}
                  onDragStart={handleCollectionDragStart}
                  onDragOver={handleCollectionDragOver}
                  onDragEnd={handleCollectionDragEnd}
                  onDragCancel={handleCollectionDragCancel}
                >
                  {isGroupedView ? (
                  <SortableContext
                      items={groupedSections.map(({ group }) =>
                        groupSortRowId(group.id),
                      )}
                      strategy={verticalListSortingStrategy}
                    >
                      <div
                        className={`grouped-site-sections ${
                          activeGroupSortAxis === "vertical"
                            ? "is-group-sort-active"
                            : ""
                        }`}
                      >
                      {groupedSections.map(({ group, sites }, groupIndex) => (
                        <Fragment key={group.id}>
                          <SortableGroupSection
                            group={group}
                            count={sites.length}
                            disabled={groupSortDisabled}
                            insertDisabled={Boolean(
                              activeGroupSortId ||
                                activeDragId ||
                                isSearching ||
                                groupSelectionMode,
                            )}
                            onInsert={(position) => {
                              const beforeGroupId =
                                position === "before"
                                  ? group.id
                                  : groupedSections[groupIndex + 1]?.group.id;
                              openNewGroupDialog(beforeGroupId, {
                                groupName: group.name,
                                position,
                              });
                            }}
                            onManage={() => {
                              if (!selectionArmed && !multiSelectMode) {
                                openGroupManager(group.id);
                              }
                            }}
                            groupSelected={selectedGroupIds.has(group.id)}
                            groupSelectionMode={groupSelectionMode}
                            groupSelectionEntryEnabled={
                              !group.isProtected &&
                              groupedGroupSelectionEntryEnabled
                            }
                            onToggleGroupSelected={() =>
                              toggleGroupSelection(group.id)
                            }
                            onEnterGroupSelection={() =>
                              enterGroupSelectionFromDoubleClick(group.id)
                            }
                            siteSelectionMode={multiSelectMode}
                            groupSelectionActive={groupSelectionActive}
                            selectionPending={groupedSelectionPending}
                            onToggleSiteSelectionMode={toggleMultiSelectMode}
                          >
                          <SortableContext
                            items={
                              canReorderSites && !multiSelectMode
                                ? sites.map((site) => site.id)
                                : []
                            }
                            strategy={rectSortingStrategy}
                          >
                            <GroupDropGrid
                              groupId={group.id}
                              dragActive={
                                Boolean(activeDragId) &&
                                !dragDisabled
                              }
                              dragOver={
                                overDragId === `group-zone:${group.id}`
                              }
                              className="grouped-site-track"
                            >
                              {sites.map((site) => (
                                <Fragment key={site.id}>
                                  {canReorderSites &&
                                    !multiSelectMode &&
                                    Boolean(activeDragId) &&
                                    dragOriginGroupIdRef.current !== group.id &&
                                    overDragId === site.id && (
                                      <div
                                        className="site-card site-card-drop-placeholder"
                                        aria-hidden="true"
                                      />
                                    )}
                                  <SiteCard
                                  site={site}
                                  group={group}
                                  dragMode={siteDragMode}
                                  dragDisabledReason={
                                    isSearching
                                      ? "搜索时无法排序"
                                      : undefined
                                  }
                                  dragPending={pendingDragId === site.id}
                                  selectionMode={multiSelectMode}
                                  selectionEntryEnabled={
                                    groupedSiteSelectionEntryEnabled
                                  }
                                  linkInteractionDisabled={groupSelectionMode}
                                  actionsDisabled={
                                    isGroupedView && selectionArmed
                                  }
                                  selected={selectedSiteIds.has(site.id)}
                                  selectedCount={selectedSiteCount}
                                  batchDragging={
                                    Boolean(activeDragId) &&
                                    batchDragIds.includes(site.id)
                                  }
                                  deleteArmed={armedDeleteSiteId === site.id}
                                  dropTarget={
                                    canReorderSites &&
                                    !multiSelectMode &&
                                    Boolean(activeDragId) &&
                                    overDragId === site.id &&
                                    activeDragId !== site.id
                                  }
                                  onEdit={openEditDialog}
                                  onDelete={requestSiteDelete}
                                  onVisit={(site) => recordSiteClick(site.id)}
                                  onToggleSelected={toggleSiteSelection}
                                  />
                                </Fragment>
                              ))}
                              {canReorderSites &&
                                !multiSelectMode &&
                                Boolean(activeDragId) &&
                                dragOriginGroupIdRef.current !== group.id &&
                                overDragId === `group-zone:${group.id}` && (
                                  <div
                                    className="site-card site-card-drop-placeholder"
                                    aria-hidden="true"
                                  />
                                )}
                              {!isSearching && (
                                <AddSiteCard
                                  group={group}
                                  onClick={openAddDialog}
                                  onDropSite={openAddDialog}
                                />
                              )}
                            </GroupDropGrid>
                          </SortableContext>
                          </SortableGroupSection>
                        </Fragment>
                      ))}
                      </div>
                    </SortableContext>
                  ) : (
                    <SortableContext
                      items={
                        canReorderSites && !multiSelectMode
                          ? visibleSites.map((site) => site.id)
                          : []
                      }
                      strategy={rectSortingStrategy}
                    >
                      <GroupDropGrid
                        groupId={addCardGroup.id}
                        dragActive={
                          Boolean(activeDragId) &&
                          !dragDisabled &&
                          canReorderSites &&
                          activeGroupId !== "all"
                        }
                        dragOver={
                          overDragId === `group-zone:${addCardGroup.id}`
                        }
                        className="site-grid"
                      >
                        {visibleSites.map((site) => {
                          const group =
                            groups.find((item) => item.id === site.groupId) ??
                            addCardGroup;
                          return (
                            <SiteCard
                              key={site.id}
                              site={site}
                              group={group}
                              dragMode={siteDragMode}
                              dragDisabledReason={
                                isSearching
                                  ? "搜索时无法排序"
                                  : undefined
                              }
                              dragPending={pendingDragId === site.id}
                              selectionMode={multiSelectMode}
                              selectionEntryEnabled={false}
                              actionsDisabled={selectionArmed}
                              selected={selectedSiteIds.has(site.id)}
                              selectedCount={selectedSiteCount}
                              batchDragging={
                                Boolean(activeDragId) &&
                                batchDragIds.includes(site.id)
                              }
                              deleteArmed={armedDeleteSiteId === site.id}
                              dropTarget={
                                canReorderSites &&
                                !multiSelectMode &&
                                Boolean(activeDragId) &&
                                overDragId === site.id &&
                                activeDragId !== site.id
                              }
                              onEdit={openEditDialog}
                              onDelete={requestSiteDelete}
                              onVisit={(site) => recordSiteClick(site.id)}
                              onToggleSelected={toggleSiteSelection}
                            />
                          );
                        })}
                        <AddSiteCard
                          group={addCardGroup}
                          onClick={openAddDialog}
                          onDropSite={openAddDialog}
                        />
                      </GroupDropGrid>
                    </SortableContext>
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
                        group={activeSortedGroup}
                        count={activeSortedGroupCount}
                        batchCount={activeGroupSortIdsRef.current.length || 1}
                      />
                    ) : activeDraggedSite && activeDraggedGroup ? (
                        <SiteCardDragPreview
                        site={activeDraggedSite}
                        group={activeDraggedGroup}
                          overGroupTab={Boolean(dragHoverGroupId)}
                          batchCount={Math.max(1, batchDragIds.length)}
                      />
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}
          </motion.div>
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
              ? `扩展本地保存 · ${state.sites.length} 个网站`
              : `浏览器本地保存 · ${state.sites.length} 个网站`}
          </span>
        </footer>
      ) : null}

      <SiteDialog
        open={siteDialogOpen}
        sites={state.sites}
        groups={groups}
        initialGroupId={dialogGroupId}
        editingSite={editingSite}
        prefill={siteDialogPrefill}
        onOpenChange={setSiteDialogOpen}
        onSubmit={handleSiteSubmit}
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
        onExportGroup={handleGroupExport}
        onImportGroup={requestGroupImport}
      />

      <SettingsPanel
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
            draft.themePreference,
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
          setQuery("");
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
            setQuery("");
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
