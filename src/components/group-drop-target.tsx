import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CategoryIcon } from "./category-icon";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SiteGroup } from "../types";

const GROUP_LONG_PRESS_DELAY = 450;
const GROUP_LONG_PRESS_MOVE_TOLERANCE = 8;

export const groupTabDropId = (groupId: string) => `group-tab:${groupId}`;
export const groupZoneDropId = (groupId: string) => `group-zone:${groupId}`;
export const groupSortTabId = (groupId: string) => `group-sort-tab:${groupId}`;
export const groupSortRowId = (groupId: string) => `group-sort-row:${groupId}`;

export function readGroupSortId(id: string): string | undefined {
  if (id.startsWith("group-sort-tab:")) {
    return id.slice("group-sort-tab:".length);
  }
  if (id.startsWith("group-sort-row:")) {
    return id.slice("group-sort-row:".length);
  }
  return undefined;
}

export function readDropGroupId(id: string): string | undefined {
  if (id.startsWith("group-tab:")) return id.slice("group-tab:".length);
  if (id.startsWith("group-zone:")) return id.slice("group-zone:".length);
  return undefined;
}

interface GroupDropTabProps {
  group: SiteGroup;
  count: number;
  selected: boolean;
  dragActive: boolean;
  dragOver: boolean;
  sortDisabled: boolean;
  managementDisabled?: boolean;
  onSelect: () => void;
  onManage: () => void;
  onSortIntent: () => void;
}

export function GroupDropTab({
  group,
  count,
  selected,
  dragActive,
  dragOver,
  sortDisabled,
  managementDisabled = false,
  onSelect,
  onManage,
  onSortIntent,
}: GroupDropTabProps) {
  const sortable = useSortable({
    id: groupSortTabId(group.id),
    disabled: sortDisabled || group.isProtected,
    data: { type: "group-tab-sort", groupId: group.id },
    transition: { duration: 160, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  });
  const [longPressPending, setLongPressPending] = useState(false);
  const timerRef = useRef<number | null>(null);
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);
  const onSortIntentRef = useRef(onSortIntent);

  function clearLongPressTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setLongPressPending(false);
  }

  function finishPointerGesture() {
    clearLongPressTimer();
    gestureRef.current = null;
  }

  function suppressNextClick() {
    suppressClickRef.current = true;
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
    }
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 700);
  }

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    onSortIntentRef.current = onSortIntent;
  }, [onSortIntent]);

  useEffect(() => {
    if (!sortable.isDragging) return;
    finishPointerGesture();
    suppressNextClick();
    onSortIntentRef.current();
  }, [sortable.isDragging]);

  return (
    <button
      ref={sortable.setNodeRef}
      {...sortable.attributes}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.isDragging ? "none" : sortable.transition,
      }}
      type="button"
      role="tab"
      aria-disabled={undefined}
      className={`category-tab ${selected ? "active" : ""} ${
        dragOver ? "is-drag-over" : ""
      } ${longPressPending ? "is-long-press-pending" : ""} ${
        sortable.isDragging ? "is-group-sorting" : ""
      }`}
      aria-selected={selected}
      data-group-drop-id={group.id}
      data-group-sort-tab-id={group.id}
      data-drag-target={dragOver || undefined}
      data-drag-active={dragActive || undefined}
      data-group-sort-handle={!sortDisabled && !group.isProtected ? "true" : undefined}
      title={`${group.name}：点击查看，长按管理`}
      onPointerDown={(event) => {
        if (event.button !== 0 || dragActive || managementDisabled) return;
        finishPointerGesture();
        gestureRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
        };
        setLongPressPending(true);
        timerRef.current = window.setTimeout(() => {
          if (!gestureRef.current) return;
          timerRef.current = null;
          suppressNextClick();
          setLongPressPending(false);
          onManage();
        }, GROUP_LONG_PRESS_DELAY);
      }}
      onPointerMove={(event) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (
          Math.hypot(
            event.clientX - gesture.startX,
            event.clientY - gesture.startY,
        ) > GROUP_LONG_PRESS_MOVE_TOLERANCE
        ) {
          finishPointerGesture();
          if (!group.isProtected) {
            suppressNextClick();
            onSortIntent();
          }
        }
      }}
      onPointerUp={finishPointerGesture}
      onPointerCancel={finishPointerGesture}
      onLostPointerCapture={finishPointerGesture}
      onContextMenu={(event) => {
        if (longPressPending || suppressClickRef.current) {
          event.preventDefault();
        }
      }}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          if (suppressClickTimerRef.current !== null) {
            window.clearTimeout(suppressClickTimerRef.current);
            suppressClickTimerRef.current = null;
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onSelect();
      }}
      {...sortable.listeners}
    >
      <CategoryIcon name={group.icon} size={16} />
      {group.name}
      <span>{count}</span>
    </button>
  );
}

interface GroupDropGridProps {
  groupId: string;
  dragActive: boolean;
  dragOver?: boolean;
  children: ReactNode;
  className: string;
}

export function GroupDropGrid({
  groupId,
  dragActive,
  dragOver = false,
  children,
  className,
}: GroupDropGridProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: groupZoneDropId(groupId),
    disabled: !dragActive,
    data: { type: "group-zone", groupId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${
        isOver || dragOver ? "is-group-drag-over" : ""
      }`}
      data-group-zone-id={groupId}
      data-group-drop-target={isOver || undefined}
    >
      {children}
    </div>
  );
}
