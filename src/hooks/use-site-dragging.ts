import { useEffect, useMemo, useRef, useState } from "react";
import { closestCorners, pointerWithin, rectIntersection, type CollisionDetection, type DragStartEvent, type DragOverEvent, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { CollectionEntryId, SiteItem, SiteGroup } from "../types";
import { createFolderDragIds, readDropGroupId } from "../lib/collection-drag-ids";
import { captureStableDropGeometry as measureDropGeometry, pointInDropRect, distanceToDropRect, rectOverlapArea, readOverlappingGroupTab, type StableDropGeometry } from "../lib/collection-drag-geometry";
import { getGroupEntries } from "../lib/group-hierarchy";
import { moveSiteToGroupEnd, reorderSites, reorderSitesGlobally } from "../lib/site-utils";
import { getGroupWorkspace, isGithubHomeUrl } from "../lib/github-workspace";
import { useTabEdgeScroll } from "./use-tab-edge-scroll";
import { useDragWindowEvents } from "./use-drag-window-events";
import { useLatestEvent } from "./use-latest-event";

type SiteDropIntent =
  | { type: "site"; siteId: string; groupId: string }
  | { type: "entries"; entryIds: CollectionEntryId[]; groupId: string }
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
  setActiveGroupId: (id: string) => void;
  onCommitGroupNavigation?: (groupId: string) => void;
  setDragSitesPreview: (sites: SiteItem[] | null) => void;
  commitSites: (sites: SiteItem[]) => void;
  commitGroupEntries?: (groupId: string, entryIds: CollectionEntryId[]) => void;
  onStart: () => void;
  armSiteClickSuppression: () => void;
}

/** Owns one card drag transaction; the website snapshot sent upward is display-only. */
export function useSiteDragging({ sites, groups, renderedSites, workspaceGroupIds, activeGroupId,
  isGroupedView, canReorderSites, dragDisabled, setActiveGroupId, setDragSitesPreview,
  onCommitGroupNavigation, commitSites, commitGroupEntries, onStart, armSiteClickSuppression }: Options) {
  const [pendingDragId, setPendingDragId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overDragId, setOverDragId] = useState<string | null>(null);
  const [dragHoverGroupId, setDragHoverGroupId] = useState<string | null>(null);
  const folderDragIds = useMemo(() => createFolderDragIds(groups, sites), [groups, sites]);
  const foldersByDragId = useMemo(() => new Map(groups.flatMap(group => {
    const id = folderDragIds.get(group.id);
    return id ? [[id, group] as const] : [];
  })), [folderDragIds, groups]);
  const renderedSitesById = useMemo(() => new Map(renderedSites.map(site => [site.id, site])), [renderedSites]);
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
  const mixedOrderRef = useRef<{
    groupId: string;
    entryIds: CollectionEntryId[];
    dragIds: string[];
  } | null>(null);
  const lastValidCardTargetGroupRef = useRef<string | null>(null);
  const dragOriginGroupIdRef = useRef<string | null>(null);
  const dragStartedFromAllRef = useRef(true);
  const switchedDragGroupIdRef = useRef<string | null>(null);
  const groupHoverTimerRef = useRef<number | null>(null);
  const groupOverlapFrameRef = useRef<number | null>(null);
  const edgeScroll = useTabEdgeScroll(() => Boolean(activeDragIdRef.current), () => {
    const groupId = readOverlappingGroupTab();
    if (groupId) scheduleGroupTabSwitch(groupId);
  });
  function captureStableDropGeometry() { stableDropGeometryRef.current = measureDropGeometry(); }
  const activeCollisionDetection: CollisionDetection = (args) => {
      const activeId = String(args.active.id);
      const isFolderDrag = foldersByDragId.has(activeId);
      const originGroupId = dragOriginGroupIdRef.current;
      const cardGroupId = (id: string) =>
        foldersByDragId.get(id)?.parentId ?? renderedSitesById.get(id)?.groupId;
      const canTargetCard = (id: string) => {
        if (isFolderDrag) return cardGroupId(id) === originGroupId;
        if (foldersByDragId.has(id)) return mixedOrderRef.current?.dragIds.includes(id) ?? false;
        return renderedSitesById.has(id);
      };
      const pointerCollisions = pointerWithin(args);
      const groupTabCollision = pointerCollisions.find(({ id }) =>
        String(id).startsWith("group-tab:"),
      );
      if (groupTabCollision) return isFolderDrag ? [] : [groupTabCollision];

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
          if (isFolderDrag && groupEnd.groupId !== originGroupId) return [];
          const id = mixedEndOverId(groupEnd.groupId) ?? groupEnd.id;
          stableCollisionIdRef.current = id;
          return [{ id }];
        }

        const pointedGroup = geometry.groups.find((rect) =>
          pointInDropRect(rect, pointerX, pointerY),
        );
        if (isFolderDrag && pointedGroup?.groupId !== originGroupId) return [];
        const isGlobalFlatView = activeGroupId === "all" && !isGroupedView;
        const candidates = geometry.sites.filter(
          (rect) => (isGlobalFlatView || rect.groupId === pointedGroup?.groupId) &&
            ((!isFolderDrag && !foldersByDragId.has(rect.id)) || canTargetCard(rect.id)),
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

      const pointedSitesInActiveGroup = pointerCollisions.filter(({ id }) => {
        const target = String(id);
        return target !== activeId && canTargetCard(target) && cardGroupId(target) === cardGroupId(activeId);
      });
      if (pointedSitesInActiveGroup.length > 0) {
        return pointedSitesInActiveGroup;
      }

      const intersections = rectIntersection(args);
      const intersectedSites = intersections.filter(
        ({ id }) => String(id) !== activeId && canTargetCard(String(id)),
      );
      if (intersectedSites.length > 0) return intersectedSites;

      const nearest = closestCorners(args);
      const nearestSites = nearest.filter(
        ({ id }) => String(id) !== activeId && canTargetCard(String(id)),
      );
      if (nearestSites.length > 0) return nearestSites;

      if (isFolderDrag) return [];
      const otherTargets = (intersections.length > 0 ? intersections : nearest)
        .filter(({ id }) => !foldersByDragId.has(String(id)));
      return otherTargets;
    };

  function handleDragStart(event: DragStartEvent) {
    if (dragDisabled) return;
    onStart();
    sourceStateRef.current = { sites, groups };
    const preview = sites.map((site) => ({ ...site }));
    const activeId = String(event.active.id);
    activeDragIdRef.current = activeId;
    dragCanReorderRef.current = canReorderSites;
    siteDropIntentRef.current = null;
    dragBaseSitesRef.current = preview;
    dragSitesPreviewRef.current = preview;
    const folder = foldersByDragId.get(activeId);
    dragOriginGroupIdRef.current =
      folder?.parentId ?? preview.find((site) => site.id === activeId)?.groupId ?? null;
    dragStartedFromAllRef.current = activeGroupId === "all";
    const parent = groups.find(group => group.id === dragOriginGroupIdRef.current);
    if (canReorderSites && parent && (isGroupedView || !dragStartedFromAllRef.current)) {
      const directSites = preview.filter(site => site.groupId === parent.id).sort((a, b) => a.order - b.order);
      const entries = getGroupEntries(parent, groups, directSites, "manual");
      if (entries.some(entry => entry.kind === "folder")) {
        mixedOrderRef.current = {
          groupId: parent.id,
          entryIds: entries.map(entry => entry.id),
          dragIds: entries.map(entry => entry.kind === "site" ? entry.site.id : folderDragIds.get(entry.group.id)!),
        };
      }
    }
    switchedDragGroupIdRef.current = null;
    pointerGroupZoneRef.current = null;
    pointerAtGroupEndRef.current = false;
    stableCollisionIdRef.current = activeId;
    captureStableDropGeometry();
    lastValidCardTargetGroupRef.current = null;
    setDragSitesPreview(preview);
    setPendingDragId(null);
    setActiveDragId(activeId);
    setOverDragId(activeId);
    if (!folder) {
      startGroupOverlapTracking();
      edgeScroll.start();
    }
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
      lastValidCardTargetGroupRef.current = null;
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

  function mixedEndOverId(groupId: string) {
    const order = mixedOrderRef.current;
    return order?.groupId === groupId ? order.dragIds.at(-1) : undefined;
  }

  function previewMixedDrop(overId: string) {
    const order = mixedOrderRef.current;
    const activeId = activeDragIdRef.current;
    if (!order || !activeId) return false;
    const from = order.dragIds.indexOf(activeId);
    const to = order.dragIds.indexOf(overId);
    if (from < 0 || to < 0) return false;
    siteDropIntentRef.current = from === to ? null : {
      type: "entries",
      groupId: order.groupId,
      entryIds: arrayMove(order.entryIds, from, to),
    };
    lastValidCardTargetGroupRef.current = from === to ? null : order.groupId;
    setOverDragId(overId);
    return true;
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
      lastValidCardTargetGroupRef.current = null;
      if (activeId) setOverDragId(activeId);
      return;
    }

    siteDropIntentRef.current = { type: "group-end", groupId };
    lastValidCardTargetGroupRef.current = null;
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
    const site = calculationBase.find((candidate) => candidate.id === activeId);
    return Boolean(site && isGithubHomeUrl(site.url));
  }

  function isTransferTargetNoOp(groupId: string) {
    const calculationBase = dragBaseSitesRef.current;
    const activeId = activeDragIdRef.current;
    if (!calculationBase || !activeId) return true;
    return calculationBase.find((site) => site.id === activeId)?.groupId === groupId;
  }

  function previewGroupEndDrop(groupId: string) {
    const mixedEndId = mixedEndOverId(groupId);
    if (mixedEndId && previewMixedDrop(mixedEndId)) return;
    const activeId = activeDragIdRef.current;
    if (!activeId || foldersByDragId.has(activeId)) return;
    if (isGithubHomeDragBlocked(groupId)) {
      siteDropIntentRef.current = null;
      lastValidCardTargetGroupRef.current = null;
      setOverDragId(activeId);
      return;
    }
    if (!dragCanReorderRef.current) {
      targetTransferGroup(groupId);
      return;
    }

    const calculationBase = dragBaseSitesRef.current;
    if (!calculationBase) return;

    const currentIntent = siteDropIntentRef.current;
    const alreadyTargetingEnd =
      currentIntent?.type === "group-end" &&
      currentIntent.groupId === groupId;
    siteDropIntentRef.current = { type: "group-end", groupId };
    lastValidCardTargetGroupRef.current = null;
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
    if (foldersByDragId.has(activeId)) {
      if (!dragDisabled && overId && previewMixedDrop(overId)) return;
      siteDropIntentRef.current = null;
      lastValidCardTargetGroupRef.current = null;
      setOverDragId(activeId);
      return;
    }
    if (!overId || dragDisabled) {
      if (!dragCanReorderRef.current) {
        siteDropIntentRef.current = null;
        lastValidCardTargetGroupRef.current = null;
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
      lastValidCardTargetGroupRef.current = null;
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

    if (previewMixedDrop(overId)) {
      next = calculationBase;
    } else if (overSite && activeId !== overId) {
      siteDropIntentRef.current = {
        type: "site",
        siteId: overId,
        groupId: overSite.groupId,
      };
      lastValidCardTargetGroupRef.current = overSite.groupId;
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
      lastValidCardTargetGroupRef.current = null;
      setOverDragId(activeId);
      next = calculationBase;
    } else if (dropGroupId) {
      const activeSite = calculationBase.find((site) => site.id === activeId);
      const isTransientSameGroupZone =
        activeSite?.groupId === dropGroupId &&
        lastValidCardTargetGroupRef.current === dropGroupId &&
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

    if (dropIntent?.type === "entries") {
      const source = sourceStateRef.current;
      if (!dragDisabled && source?.groups === groups && source.sites === sites) {
        commitGroupEntries?.(dropIntent.groupId, dropIntent.entryIds);
      }
      clearDragState();
      return;
    }

    if (
      dropIntent &&
      isGithubHomeDragBlocked(
        dropIntent.groupId,
        calculationBase ?? undefined,
      )
    ) {
      restoreChildGroupPreview();
      clearDragState();
      return;
    }

    if (!dragCanReorderRef.current) {
      const targetGroupId = dropIntent?.groupId;
      const hasTransfer = Boolean(
        calculationBase &&
          targetGroupId &&
          calculationBase.find((site) => site.id === String(active.id))?.groupId !== targetGroupId,
      );
      if (calculationBase && targetGroupId && hasTransfer && !dragDisabled) {
        commitSites(
          moveSiteToGroupEnd(calculationBase, String(active.id), targetGroupId),
        );
        if (!dragStartedFromAllRef.current) {
          (onCommitGroupNavigation ?? setActiveGroupId)(targetGroupId);
        }
      } else {
        restoreChildGroupPreview();
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
      if (switchedDragGroupIdRef.current && !dragStartedFromAllRef.current) {
        (onCommitGroupNavigation ?? setActiveGroupId)(dropIntent.groupId);
      }
    } else {
      restoreChildGroupPreview();
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
    mixedOrderRef.current = null;
    lastValidCardTargetGroupRef.current = null;
    dragOriginGroupIdRef.current = null;
    dragStartedFromAllRef.current = true;
    switchedDragGroupIdRef.current = null;
    setDragSitesPreview(null);
    setPendingDragId(null);
    setActiveDragId(null);
    setOverDragId(null);
    edgeScroll.stop();
  }

  function handleDragCancel() {
    armSiteClickSuppression();
    restoreChildGroupPreview();
    clearDragState();
  }

  function restoreChildGroupPreview() {
    if (!switchedDragGroupIdRef.current) return;
    const origin = groups.find(group => group.id === dragOriginGroupIdRef.current);
    if (origin?.parentId) setActiveGroupId(origin.id);
  }

  const cancelSensor = useDragWindowEvents({
    isActive: () => Boolean(activeDragIdRef.current || pendingDragId),
    onMove: (x, y) => {
      if (activeDragIdRef.current && foldersByDragId.has(activeDragIdRef.current)) return;
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
  return { pendingDragId, activeDragId, overDragId, dragHoverGroupId,
    originGroupId: dragOriginGroupIdRef.current,
    folderDragIds,
    activeDraggedFolder: activeDragId ? foldersByDragId.get(activeDragId) : undefined,
    activeDraggedSite: activeDragId ? (dragSitesPreviewRef.current ?? renderedSites).find(site => site.id === activeDragId) : undefined,
    setPendingDragId, activeCollisionDetection, handleDragStart, handleDragOver, handleDragEnd, handleDragCancel };
}
