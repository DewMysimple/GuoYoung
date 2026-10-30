import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CategoryIcon } from "./category-icon";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SiteGroup } from "../types";
import { SiteGridLayout } from "./site-grid-layout";

import { groupZoneDropId, groupSortTabId } from "../lib/collection-drag-ids";

const GROUP_LONG_PRESS_DELAY = 450;
const GROUP_LONG_PRESS_MOVE_TOLERANCE = 8;

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
  const pointerReleaseClickRef = useRef(false);
  const pointerReleaseTaskRef = useRef<number | null>(null);
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
  }

  function clearClickSuppression() {
    suppressClickRef.current = false;
    pointerReleaseClickRef.current = false;
    if (pointerReleaseTaskRef.current !== null) {
      window.clearTimeout(pointerReleaseTaskRef.current);
      pointerReleaseTaskRef.current = null;
    }
  }

  function releasePointerGesture() {
    finishPointerGesture();
    if (!suppressClickRef.current) return;
    pointerReleaseClickRef.current = true;
    // A click dispatched with this release still belongs to the gesture, even
    // when it has no click count. Later count-zero assistive activation is
    // independent. The pointer-click latch itself has no time limit.
    if (pointerReleaseTaskRef.current !== null) window.clearTimeout(pointerReleaseTaskRef.current);
    pointerReleaseTaskRef.current = window.setTimeout(() => {
      pointerReleaseClickRef.current = false;
      pointerReleaseTaskRef.current = null;
    }, 0);
  }

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (pointerReleaseTaskRef.current !== null) {
        window.clearTimeout(pointerReleaseTaskRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const cancel = () => finishPointerGesture();
    const hidden = () => { if (document.visibilityState === "hidden") cancel(); };
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  useEffect(() => {
    onSortIntentRef.current = onSortIntent;
  }, [onSortIntent]);

  useEffect(() => {
    if (!sortable.isDragging) return;
    finishPointerGesture();
    suppressNextClick();
    onSortIntentRef.current();
  }, [sortable.isDragging]);

  const { onKeyDown: onSortKeyDown, ...sortListeners } = sortable.listeners ?? {};

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
        clearClickSuppression();
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
      onPointerUp={releasePointerGesture}
      onPointerCancel={finishPointerGesture}
      onLostPointerCapture={finishPointerGesture}
      onContextMenu={(event) => {
        if (longPressPending || suppressClickRef.current) {
          event.preventDefault();
        }
      }}
      onClick={(event) => {
        const belongsToGesture = sortable.isDragging || event.detail > 0 || pointerReleaseClickRef.current;
        if (suppressClickRef.current && belongsToGesture) {
          clearClickSuppression();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        clearClickSuppression();
        onSelect();
      }}
      {...sortListeners}
      onKeyDown={(event) => {
        if (!sortable.isDragging && (event.key === "Enter" || event.key === " ")) {
          clearClickSuppression();
        }
        onSortKeyDown?.(event);
      }}
    >
      <CategoryIcon name={group.icon} size={16} />
      {group.name}
      <span>{count}</span>
    </button>
  );
}

interface GroupDropGridProps {
  hasNotes?: boolean;
  groupId: string;
  dragActive: boolean;
  dragOver?: boolean;
  children: ReactNode;
  className: string;
}

export function GroupDropGrid({
  hasNotes,
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
  // A disabled droppable can retain the preceding collision for one render.
  // Never expose a drop hint outside an active drag session.
  const highlighted = dragActive && (isOver || dragOver);
  return (
    <SiteGridLayout
      hasNotes={hasNotes}
      ref={setNodeRef}
      className={`${className} ${
        highlighted ? "is-group-drag-over" : ""
      }`}
      data-group-zone-id={groupId}
      data-group-drop-target={(dragActive && isOver) || undefined}
    >
      {children}
    </SiteGridLayout>
  );
}
