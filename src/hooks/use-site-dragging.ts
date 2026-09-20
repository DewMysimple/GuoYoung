import { useEffect, useRef, useState } from "react";
import { closestCorners, pointerWithin, rectIntersection, type CollisionDetection, type DragStartEvent, type DragOverEvent, type DragEndEvent } from "@dnd-kit/core";
import type { SiteItem, SiteGroup } from "../types";
import { readDropGroupId } from "../lib/collection-drag-ids";
import { captureStableDropGeometry as measureDropGeometry, pointInDropRect, distanceToDropRect, rectOverlapArea, readOverlappingGroupTab, type StableDropGeometry } from "../lib/collection-drag-geometry";
import { moveSiteToGroupEnd, moveSitesToGroupEnd, reorderSites, reorderSitesGlobally } from "../lib/site-utils";
import { getGroupWorkspace, isGithubHomeUrl } from "../lib/github-workspace";
import { useCollectionSelection } from "./use-collection-selection";
import { useTabEdgeScroll } from "./use-tab-edge-scroll";
import { useDragWindowEvents } from "./use-drag-window-events";
import { useLatestEvent } from "./use-latest-event";

type SiteDropIntent =
  | { type: "site"; siteId: string; groupId: string }
  | { type: "group-end"; groupId: string };

const DROP_TARGET_HYSTERESIS = 18;

interface Options {
  sites: SiteItem[];
  groups: SiteGroup[];
  renderedSites: SiteItem[];
  workspaceGroupIds: Set<string>;
  activeGroupId: string;
  isGroupedView: boolean;
  canReorderSites: boolean;
  dragDisabled: boolean;
  selection: ReturnType<typeof useCollectionSelection>;
  setActiveGroupId: (id: string) => void;
  setDragSitesPreview: (sites: SiteItem[] | null) => void;
  commitSites: (sites: SiteItem[]) => void;
  onStart: () => void;
  armSiteClickSuppression: () => void;
}

/** Owns one website drag transaction; the snapshot sent upward is display-only. */
export function useSiteDragging({ sites, groups, renderedSites, workspaceGroupIds, activeGroupId,
  isGroupedView, canReorderSites, dragDisabled, selection, setActiveGroupId, setDragSitesPreview,
  commitSites, onStart, armSiteClickSuppression }: Options) {
  const [pendingDragId, setPendingDragId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overDragId, setOverDragId] = useState<string | null>(null);
  const [dragHoverGroupId, setDragHoverGroupId] = useState<string | null>(null);
  const [batchDragIds, setBatchDragIds] = useState<string[]>([]);
  const dragSitesPreviewRef = useRef<SiteItem[] | null>(null);
  const dragBaseSitesRef = useRef<SiteItem[] | null>(null);
  const sourceStateRef = useRef<{ sites: SiteItem[]; groups: SiteGroup[] } | null>(null);
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
  const { selectedSiteIds, cancelSelection } = selection;
  const multiSelectMode = selection.selectionMode === "sites";
  const edgeScroll = useTabEdgeScroll(() => Boolean(activeDragIdRef.current), () => {
    const groupId = readOverlappingGroupTab();
    if (groupId) scheduleGroupTabSwitch(groupId);
  });
  function captureStableDropGeometry() { stableDropGeometryRef.current = measureDropGeometry(); }
  const activeCollisionDetection: CollisionDetection = (args) => {
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
    };

  function handleDragStart(event: DragStartEvent) {
    onStart();
    sourceStateRef.current = { sites, groups };
    const preview = sites.map((site) => ({ ...site }));
    const activeId = String(event.active.id);
    selection.prepareSiteDrag(activeId);
    let nextBatchIds = [activeId];
    if (multiSelectMode) {
      const selectedForDrag = selectedSiteIds.has(activeId)
        ? new Set(selectedSiteIds)
        : new Set([activeId]);
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
    edgeScroll.start();
  }

  function clearGroupHoverTimer() {
    if (groupHoverTimerRef.current !== null) {
      window.clearTimeout(groupHoverTimerRef.current);
      groupHoverTimerRef.current = null;
    }
    hoveredGroupTabRef.current = null;
    setDragHoverGroupId(null);
  }

  function stopGroupOverlapTracking() {
    if (groupOverlapFrameRef.current !== null) {
      window.cancelAnimationFrame(groupOverlapFrameRef.current);
      groupOverlapFrameRef.current = null;
    }
  }

  function startGroupOverlapTracking() {
    stopGroupOverlapTracking();
    const trackOverlap = trackGroupOverlap;
    groupOverlapFrameRef.current = window.requestAnimationFrame(trackOverlap);
  }

  const trackGroupOverlap = useLatestEvent(() => {
      if (!activeDragIdRef.current) {
        groupOverlapFrameRef.current = null;
        return;
      }
      const overlappingGroupId = readOverlappingGroupTab();
      if (overlappingGroupId) scheduleGroupTabSwitch(overlappingGroupId);
      else if (hoveredGroupTabRef.current) clearGroupHoverTimer();
      groupOverlapFrameRef.current = window.requestAnimationFrame(trackGroupOverlap);
  });

  const scheduleGroupTabSwitch = useLatestEvent((groupId: string) => {
    if (isGithubHomeDragBlocked(groupId)) {
      clearGroupHoverTimer();
      setDragHoverGroupId(null);
      siteDropIntentRef.current = null;
      lastValidSiteTargetRef.current = null;
      if (activeDragIdRef.current) setOverDragId(activeDragIdRef.current);
      return;
    }
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
      const snapshot = dragBaseSitesRef.current;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!snapshot || dragBaseSitesRef.current !== snapshot) return;
          captureStableDropGeometry();
          stableCollisionIdRef.current = `group-zone:${groupId}`;
        });
      });
    }, 450);
  });

  function updateDragPreview(next: SiteItem[]) {
    dragSitesPreviewRef.current = next;
  }

  function targetTransferGroup(groupId: string) {
    const activeId = activeDragIdRef.current;
    if (
      !activeId ||
      !groupId ||
      isGithubHomeDragBlocked(groupId) ||
      isTransferTargetNoOp(groupId)
    ) {
      siteDropIntentRef.current = null;
      lastValidSiteTargetRef.current = null;
      if (activeId) setOverDragId(activeId);
      return;
    }

    siteDropIntentRef.current = { type: "group-end", groupId };
    lastValidSiteTargetRef.current = null;
    setOverDragId(`group-zone:${groupId}`);
  }

  function isGithubHomeDragBlocked(
    groupId: string | undefined,
    calculationBase = dragBaseSitesRef.current,
  ) {
    if (!groupId || !calculationBase) return false;
    const targetGroup = groups.find((group) => group.id === groupId);
    if (!targetGroup || getGroupWorkspace(targetGroup) !== "github") {
      return false;
    }
    const activeId = activeDragIdRef.current;
    if (!activeId) return false;
    const draggedIds =
      batchDragIdsRef.current.length > 0
        ? batchDragIdsRef.current
        : [activeId];
    return draggedIds.some((id) => {
      const site = calculationBase.find((candidate) => candidate.id === id);
      return Boolean(site && isGithubHomeUrl(site.url));
    });
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
    if (isGithubHomeDragBlocked(groupId)) {
      siteDropIntentRef.current = null;
      lastValidSiteTargetRef.current = null;
      if (activeDragIdRef.current) setOverDragId(activeDragIdRef.current);
      return;
    }
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
    const overGroupId = dropGroupId ?? overSite?.groupId;
    if (isGithubHomeDragBlocked(overGroupId, calculationBase)) {
      siteDropIntentRef.current = null;
      lastValidSiteTargetRef.current = null;
      setOverDragId(activeId);
      clearGroupHoverTimer();
      return;
    }
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
        next = reorderSitesGlobally(
          calculationBase,
          activeId,
          overId,
          workspaceGroupIds,
        );
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

    if (
      dropIntent &&
      isGithubHomeDragBlocked(
        dropIntent.groupId,
        calculationBase ?? undefined,
      )
    ) {
      clearDragState();
      return;
    }

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
          cancelSelection();
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
                workspaceGroupIds,
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
    sourceStateRef.current = null;
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
    edgeScroll.stop();
  }

  function handleDragCancel() {
    armSiteClickSuppression();
    clearDragState();
  }


  const cancelSensor = useDragWindowEvents({
    isActive: () => Boolean(activeDragIdRef.current || pendingDragId),
    onMove: (x, y) => {
      edgeScroll.track(x);
      if (!dragSitesPreviewRef.current) return;
      const element = document.elementFromPoint(x, y);
      pointerGroupZoneRef.current = element?.closest<HTMLElement>("[data-group-zone-id]")?.dataset.groupZoneId ?? null;
      const end = element?.closest<HTMLElement>("[data-add-site-group-id]");
      pointerAtGroupEndRef.current = Boolean(end);
      if (end?.dataset.addSiteGroupId) previewGroupEndDrop(end.dataset.addSiteGroupId);
      const groupId = element?.closest<HTMLElement>("[data-group-drop-id]")?.dataset.groupDropId;
      if (groupId) scheduleGroupTabSwitch(groupId);
    },
    onCancel: handleDragCancel,
  });
  useEffect(() => {
    const source = sourceStateRef.current;
    // External saves/deletes invalidate the frozen transaction. Never overwrite newer data.
    if (source && (source.sites !== sites || source.groups !== groups)) cancelSensor();
  }, [sites, groups, cancelSensor]);
  useEffect(() => () => {
    stopGroupOverlapTracking();
    if (groupHoverTimerRef.current !== null) window.clearTimeout(groupHoverTimerRef.current);
    // Invalidate delayed recapture work without publishing state during unmount.
    dragBaseSitesRef.current = null;
  }, []);
  return { pendingDragId, activeDragId, overDragId, dragHoverGroupId, batchDragIds,
    originGroupId: dragOriginGroupIdRef.current,
    activeDraggedSite: activeDragId ? (dragSitesPreviewRef.current ?? renderedSites).find(site => site.id === activeDragId) : undefined,
    setPendingDragId, activeCollisionDetection, handleDragStart, handleDragOver, handleDragEnd, handleDragCancel };
}
