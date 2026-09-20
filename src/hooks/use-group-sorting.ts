import type { CollisionDetection, DragStartEvent, DragOverEvent } from "@dnd-kit/core";
import { useEffect, useRef } from "react";
import { closestCenter } from "@dnd-kit/core";
import type { SiteGroup } from "../types";
import { groupSortRowId, groupSortTabId, readGroupSortId } from "../lib/collection-drag-ids";
import { groupSortIntentFromTargetIndex, resolveGroupSortIntent, type GroupSortAxis } from "../lib/group-sort";
import { readLiveGroupSortRects } from "../lib/collection-drag-geometry";
import { useGroupSortSession } from "./use-group-sort-session";
import { useCollectionSelection } from "./use-collection-selection";
import { useDragWindowEvents } from "./use-drag-window-events";
import { useTabEdgeScroll } from "./use-tab-edge-scroll";

interface Options {
  groups: SiteGroup[];
  selection: ReturnType<typeof useCollectionSelection>;
  onStart: () => void;
  reorderGroups: (id: string, beforeId: string | null) => void;
  reorderGroupBlock: (ids: string[], beforeId: string | null) => void;
}

export function useGroupSorting({ groups, selection, onStart, reorderGroups, reorderGroupBlock }: Options) {
  const groupSort = useGroupSortSession();
  const sourceGroups = useRef<SiteGroup[] | null>(null);
  const pendingGroupId = useRef<string | null>(null);
  const edgeScroll = useTabEdgeScroll(() => Boolean(groupSort.read()), () => {
    const session = groupSort.read();
    if (session?.axis === "horizontal" && session.pointer) {
      updateGroupSortIntentFromPointer(session.pointer.x, session.pointer.y);
    }
  });
  const cancelSensor = useDragWindowEvents({
    isActive: () => Boolean(groupSort.read() || pendingGroupId.current),
    onMove: (x, y) => { edgeScroll.track(x); updateGroupSortIntentFromPointer(x, y); },
    onCancel: () => finishGroupSort(false),
  });
  useEffect(() => {
    if (sourceGroups.current && sourceGroups.current !== groups) cancelSensor();
  }, [groups, cancelSensor]);
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

    const orderedGroupIds = (groupSort.read()?.order ?? []);
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
    const activeGroupId = groupSort.read()?.activeId;
    const axis = groupSort.read()?.axis;
    if (!activeGroupId || !axis || groupSort.read()?.keyboard) return;
    groupSort.trackPointer(x, y);
    const orderedRects = readLiveGroupSortRects(axis, groupSort.read()?.order ?? []);
    groupSort.preview(
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
    if (!groupSort.read()?.keyboard || !overId) return;
    const activeGroupId = groupSort.read()?.activeId;
    const axis = groupSort.read()?.axis;
    const overGroupId = readGroupSortId(overId);
    if (!activeGroupId || !axis || !overGroupId) return;
    groupSort.preview(
      groupSortIntentFromTargetIndex(
        axis,
        activeGroupId,
        (groupSort.read()?.order ?? []),
        (groupSort.read()?.order ?? []).indexOf(overGroupId),
      ),
    );
  }

  function beginGroupSort(
    groupId: string,
    axis: GroupSortAxis,
    activatorEvent: Event,
  ) {
    onStart();
    pendingGroupId.current = null;
    sourceGroups.current = groups;
    selection.prepareGroupDrag(groupId, axis === "vertical");
    const activeIds =
      axis === "vertical" && selection.selectedGroupIds.has(groupId)
        ? groups
            .filter(
              (group) =>
                !group.isProtected && selection.selectedGroupIds.has(group.id),
            )
            .map((group) => group.id)
        : [groupId];
    groupSort.begin(groupId, axis, groups.filter((group) => !group.isProtected).map((group) => group.id), activeIds, activatorEvent);
    if (axis === "horizontal") edgeScroll.start();
  }

  function finishGroupSort(commit = true) {
    sourceGroups.current = null;
    pendingGroupId.current = null;
    const hadGroupSelection = selection.selectedGroupIds.size > 0;
    const move = groupSort.finish(commit);
    if (move) {
      if (move.activeIds.length > 1) reorderGroupBlock(move.activeIds, move.beforeGroupId);
      else reorderGroups(move.activeIds[0], move.beforeGroupId);
      if (move.activeIds.length > 1 || hadGroupSelection) selection.cancelSelection();
    }
    edgeScroll.stop();
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


  function trackPendingGroup(id: string | null) {
    pendingGroupId.current = id;
    sourceGroups.current = id ? groups : null;
  }

  return { view: groupSort.view, read: groupSort.read, detectGroupSortCollisions, trackPendingGroup,
    beginGroupSort, finishGroupSort, updateKeyboardGroupSortIntent,
    handleGroupTabDragStart, handleGroupTabDragOver, handleGroupTabDragEnd };
}
