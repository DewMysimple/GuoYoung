import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DownloadSimple,
  DotsSixVertical,
  LockSimple,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { GROUP_ICON_OPTIONS } from "../data/group-icons";
import type { CategoryIcon, SiteGroup, SiteItem } from "../types";
import { CategoryIcon as GroupIcon } from "./category-icon";

interface GroupDialogProps {
  open: boolean;
  initialGroupId?: string;
  groups: SiteGroup[];
  sites: SiteItem[];
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, name: string, icon: CategoryIcon) => void;
  onReorder: (activeId: string, overId: string) => void;
  onDelete: (group: SiteGroup) => void;
  onExportGroup: (groupId: string) => void;
  onImportGroup: (groupId: string) => void;
}

interface GroupDraft {
  name: string;
  icon: CategoryIcon;
}

function SortableGroupItem({
  group,
  count,
  selected,
  onSelect,
}: {
  group: SiteGroup;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id, disabled: group.isProtected });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        willChange: isDragging ? "transform" : undefined,
      }}
      className={`group-list-item ${selected ? "selected" : ""} ${
        isDragging ? "is-dragging" : ""
      }`}
    >
      <button
        type="button"
        className="group-list-select"
        onClick={onSelect}
        aria-pressed={selected}
      >
        <span className="group-editor-icon">
          <GroupIcon name={group.icon} size={18} />
        </span>
        <span className="group-list-copy">
          <strong>{group.name}</strong>
          <small>{count} 个网站</small>
        </span>
      </button>
      <button
        type="button"
        className="group-drag-handle"
        ref={setActivatorNodeRef}
        disabled={group.isProtected}
        aria-label={
          group.isProtected ? "受保护分组不能移动" : `拖动 ${group.name}`
        }
        {...attributes}
        {...listeners}
      >
        {group.isProtected ? (
          <LockSimple size={16} />
        ) : (
          <DotsSixVertical size={18} weight="bold" />
        )}
      </button>
    </div>
  );
}

function GroupDragPreview({
  group,
  count,
}: {
  group: SiteGroup;
  count: number;
}) {
  return (
    <div className="group-list-item group-list-item-drag-preview">
      <div className="group-list-select" aria-hidden="true">
        <span className="group-editor-icon">
          <GroupIcon name={group.icon} size={18} />
        </span>
        <span className="group-list-copy">
          <strong>{group.name}</strong>
          <small>{count} 个网站</small>
        </span>
      </div>
      <span className="group-drag-handle" aria-hidden="true">
        <DotsSixVertical size={18} weight="bold" />
      </span>
    </div>
  );
}

export function GroupDialog({
  open,
  initialGroupId,
  groups,
  sites,
  onOpenChange,
  onUpdate,
  onReorder,
  onDelete,
  onExportGroup,
  onImportGroup,
}: GroupDialogProps) {
  const titleId = useId();
  const orderedGroups = useMemo(
    () => groups.slice().sort((a, b) => a.order - b.order),
    [groups],
  );
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, GroupDraft>>({});
  const [error, setError] = useState("");
  const [armedDeleteGroupId, setArmedDeleteGroupId] = useState<string | null>(
    null,
  );
  const armedDeleteTimerRef = useRef<number | null>(null);
  const activeDragRef = useRef(false);
  const [activeDragGroupId, setActiveDragGroupId] = useState<string | null>(
    null,
  );
  const [dndContextKey, setDndContextKey] = useState(0);
  const groupListRef = useRef<HTMLDivElement | null>(null);
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const stopGroupListAutoScroll = () => {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    dragPointerRef.current = null;
  };

  const runGroupListAutoScroll = () => {
    autoScrollFrameRef.current = null;
    const list = groupListRef.current;
    const pointer = dragPointerRef.current;
    if (!activeDragRef.current || !list || !pointer) return;

    const rect = list.getBoundingClientRect();
    const edge = Math.min(72, Math.max(42, rect.height * 0.16));
    let direction = 0;
    let depth = 0;
    if (pointer.y <= rect.top + edge && list.scrollTop > 0) {
      direction = -1;
      depth = Math.min(1, (rect.top + edge - pointer.y) / edge);
    } else if (
      pointer.y >= rect.bottom - edge &&
      list.scrollTop < list.scrollHeight - list.clientHeight
    ) {
      direction = 1;
      depth = Math.min(1, (pointer.y - (rect.bottom - edge)) / edge);
    }

    if (direction !== 0) {
      const speed = 4 + Math.round(depth * 14);
      list.scrollTop += direction * speed;
      autoScrollFrameRef.current = window.requestAnimationFrame(
        runGroupListAutoScroll,
      );
    }
  };

  const scheduleGroupListAutoScroll = (event: PointerEvent) => {
    if (!activeDragRef.current) return;
    dragPointerRef.current = { x: event.clientX, y: event.clientY };
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = window.requestAnimationFrame(
        runGroupListAutoScroll,
      );
    }
  };

  const groupListCollisionDetection: CollisionDetection = (args) => {
    const collisions = closestCenter(args);
    const pointer = args.pointerCoordinates;
    const list = groupListRef.current;
    if (!pointer || !list || collisions.length === 0) return collisions;

    const listRect = list.getBoundingClientRect();
    const editorRect = list.parentElement
      ?.querySelector<HTMLElement>(".group-manager-editor")
      ?.getBoundingClientRect();
    if (
      editorRect &&
      pointer.x >= editorRect.left &&
      pointer.x <= editorRect.right &&
      pointer.y >= editorRect.top &&
      pointer.y <= editorRect.bottom
    ) {
      return [];
    }
    // The editor is beside the sortable list, but it is not a drop target.
    // closestCenter otherwise keeps returning the nearest row even when the
    // pointer has already crossed into the editor, which makes an apparent
    // drop on the form reorder a seemingly unrelated group. Keep a small
    // left-side boundary tolerance for the absolute-top path, while ending
    // the sortable corridor before the editor starts.
    if (
      pointer.x < listRect.left - 28 ||
      pointer.x > listRect.right + 8
    ) {
      return [];
    }
    const sortableGroups = orderedGroups.filter((group) => !group.isProtected);
    const firstId = sortableGroups[0]?.id;
    const lastId = sortableGroups[sortableGroups.length - 1]?.id;
    const firstRect = firstId ? args.droppableRects.get(firstId) : undefined;
    const lastRect = lastId ? args.droppableRects.get(lastId) : undefined;
    // Treat the first/last row midpoint as the live boundary.  The pointer
    // should not have to travel all the way into the page chrome before the
    // absolute edge becomes responsive; this also keeps the behavior stable
    // when the list itself shifts by a few pixels during a drag.
    const topBoundary = firstRect
      ? firstRect.top + firstRect.height / 2
      : listRect.top + 28;
    const bottomBoundary = lastRect
      ? lastRect.bottom - lastRect.height / 2
      : listRect.bottom - 28;
    const boundaryId =
      pointer.y <= topBoundary && firstId
        ? firstId
        : pointer.y >= bottomBoundary && lastId
          ? lastId
          : null;
    if (!boundaryId) return collisions;
    const boundaryCollision = collisions.find(
      (collision) => String(collision.id) === boundaryId,
    );
    return boundaryCollision
      ? [
          boundaryCollision,
          ...collisions.filter((collision) => collision !== boundaryCollision),
        ]
      : collisions;
  };

  const siteCountByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    sites.forEach((site) => {
      counts.set(site.groupId, (counts.get(site.groupId) ?? 0) + 1);
    });
    return counts;
  }, [sites]);

  useEffect(() => {
    if (!open) {
      activeDragRef.current = false;
      setActiveDragGroupId(null);
      setDndContextKey((current) => current + 1);
      stopGroupListAutoScroll();
      if (armedDeleteTimerRef.current !== null) {
        window.clearTimeout(armedDeleteTimerRef.current);
        armedDeleteTimerRef.current = null;
      }
      setArmedDeleteGroupId(null);
      return;
    }
    setSelectedId(
      orderedGroups.some((group) => group.id === initialGroupId)
        ? initialGroupId!
        : (orderedGroups[0]?.id ?? ""),
    );
    setDrafts(
      Object.fromEntries(
        orderedGroups.map((group) => [
          group.id,
          { name: group.name, icon: group.icon },
        ]),
      ),
    );
    setError("");
    setArmedDeleteGroupId(null);
  }, [initialGroupId, open]);

  function clearArmedDelete() {
    if (armedDeleteTimerRef.current !== null) {
      window.clearTimeout(armedDeleteTimerRef.current);
      armedDeleteTimerRef.current = null;
    }
    setArmedDeleteGroupId(null);
  }

  function requestDelete(group: SiteGroup) {
    if (armedDeleteGroupId === group.id) {
      clearArmedDelete();
      onDelete(group);
      return;
    }
    clearArmedDelete();
    setArmedDeleteGroupId(group.id);
    armedDeleteTimerRef.current = window.setTimeout(() => {
      armedDeleteTimerRef.current = null;
      setArmedDeleteGroupId(null);
    }, 2000);
  }

  useEffect(() => {
    if (!armedDeleteGroupId) return;
    const handlePointer = (event: PointerEvent) => {
      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-delete-group-id]")
          : null;
      if (button?.dataset.deleteGroupId !== armedDeleteGroupId) {
        clearArmedDelete();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearArmedDelete();
    };
    window.addEventListener("pointerdown", handlePointer, true);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointer, true);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, [armedDeleteGroupId]);

  useEffect(
    () => () => {
      if (armedDeleteTimerRef.current !== null) {
        window.clearTimeout(armedDeleteTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const cancelDragOnContextLoss = () => {
      if (!activeDragRef.current) return;
      activeDragRef.current = false;
      setActiveDragGroupId(null);
      setDndContextKey((current) => current + 1);
      stopGroupListAutoScroll();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") cancelDragOnContextLoss();
    };
    const handlePointerExit = (event: MouseEvent | PointerEvent) => {
      if (!activeDragRef.current || event.relatedTarget !== null) return;
      const outsideViewport =
        event.clientX < 0 ||
        event.clientY < 0 ||
        event.clientX > window.innerWidth ||
        event.clientY > window.innerHeight;
      if (outsideViewport) cancelDragOnContextLoss();
    };
    const handleWindowLeave = () => cancelDragOnContextLoss();
    window.addEventListener("blur", cancelDragOnContextLoss);
    window.addEventListener("pagehide", cancelDragOnContextLoss);
    window.addEventListener("pointercancel", cancelDragOnContextLoss, true);
    window.addEventListener("mouseout", handlePointerExit, true);
    window.addEventListener("pointerout", handlePointerExit, true);
    window.addEventListener("mouseleave", handleWindowLeave);
    window.addEventListener("pointerleave", handleWindowLeave);
    window.addEventListener("pointermove", scheduleGroupListAutoScroll, true);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", cancelDragOnContextLoss);
      window.removeEventListener("pagehide", cancelDragOnContextLoss);
      window.removeEventListener("pointercancel", cancelDragOnContextLoss, true);
      window.removeEventListener("mouseout", handlePointerExit, true);
      window.removeEventListener("pointerout", handlePointerExit, true);
      window.removeEventListener("mouseleave", handleWindowLeave);
      window.removeEventListener("pointerleave", handleWindowLeave);
      window.removeEventListener("pointermove", scheduleGroupListAutoScroll, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      stopGroupListAutoScroll();
    };
  }, [open]);

  const selected =
    orderedGroups.find((group) => group.id === selectedId) ?? orderedGroups[0];
  const selectedDraft = selected
    ? (drafts[selected.id] ?? { name: selected.name, icon: selected.icon })
    : undefined;

  function updateSelected(patch: Partial<GroupDraft>) {
    if (!selected || selected.isProtected) return;
    setDrafts((current) => ({
      ...current,
      [selected.id]: {
        ...(current[selected.id] ?? {
          name: selected.name,
          icon: selected.icon,
        }),
        ...patch,
      },
    }));
    setError("");
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    onReorder(String(event.active.id), String(event.over.id));
  }

  function saveAndClose() {
    const names = orderedGroups.map((group) =>
      (drafts[group.id]?.name ?? group.name)
        .trim()
        .toLocaleLowerCase("zh-CN"),
    );
    if (names.some((name) => !name)) {
      setError("分组名称不能为空");
      return;
    }
    if (new Set(names).size !== names.length) {
      setError("分组名称不能重复");
      return;
    }
    orderedGroups.forEach((group) => {
      if (group.isProtected) return;
      const draft = drafts[group.id] ?? {
        name: group.name,
        icon: group.icon,
      };
      onUpdate(group.id, draft.name.trim(), draft.icon);
    });
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay group-dialog-overlay" />
        <Dialog.Content
          className="dialog-content group-dialog-content"
          aria-labelledby={titleId}
        >
          <div className="dialog-header">
            <div>
              <Dialog.Title id={titleId} className="dialog-title">
                管理分组
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                选择分组后在右侧编辑；拖动左侧列表可调整顺序。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="关闭">
                <X size={19} />
              </button>
            </Dialog.Close>
          </div>

          <div className="group-dialog-scroll">
            <div className="group-manager-layout">
              <div
                ref={groupListRef}
                className="group-manager-list"
                aria-label="分组列表"
              >
                <DndContext
                  key={dndContextKey}
                  sensors={sensors}
                  collisionDetection={groupListCollisionDetection}
                  autoScroll={false}
                  onDragStart={({ active }) => {
                    activeDragRef.current = true;
                    setActiveDragGroupId(String(active.id));
                  }}
                  onDragCancel={() => {
                    activeDragRef.current = false;
                    setActiveDragGroupId(null);
                    stopGroupListAutoScroll();
                  }}
                  onDragEnd={(event) => {
                    activeDragRef.current = false;
                    setActiveDragGroupId(null);
                    stopGroupListAutoScroll();
                    handleDragEnd(event);
                  }}
                >
                  <SortableContext
                    items={orderedGroups.map((group) => group.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {orderedGroups.map((group) => (
                      <SortableGroupItem
                        key={group.id}
                        group={group}
                        count={
                          siteCountByGroup.get(group.id) ?? 0
                        }
                        selected={selected?.id === group.id}
                        onSelect={() => {
                          clearArmedDelete();
                          setSelectedId(group.id);
                          setError("");
                        }}
                      />
                    ))}
                  </SortableContext>
                  {createPortal(
                    <DragOverlay dropAnimation={null}>
                      {activeDragGroupId
                        ? (() => {
                            const activeGroup = orderedGroups.find(
                              (group) => group.id === activeDragGroupId,
                            );
                            return activeGroup ? (
                              <GroupDragPreview
                                group={activeGroup}
                                count={
                                  siteCountByGroup.get(activeGroup.id) ?? 0
                                }
                              />
                            ) : null;
                          })()
                        : null}
                    </DragOverlay>,
                    document.body,
                  )}
                </DndContext>
              </div>

              {selected && selectedDraft && (
                <div className="group-manager-editor">
                  <div className="group-editor-summary">
                    <span className="group-editor-icon large">
                      <GroupIcon name={selectedDraft.icon} size={22} />
                    </span>
                    <div>
                      <strong>{selectedDraft.name || "未命名分组"}</strong>
                      <span>
                        {siteCountByGroup.get(selected.id) ?? 0}
                        {" "}个网站
                      </span>
                    </div>
                    <div className="group-editor-summary-actions">
                      <button
                        type="button"
                        className="button secondary-button"
                        onClick={() => onImportGroup(selected.id)}
                        aria-label="导入资源"
                      >
                        <UploadSimple size={16} />
                        <span className="group-action-label">导入</span>
                      </button>
                      <button
                        type="button"
                        className="button secondary-button"
                        onClick={() => onExportGroup(selected.id)}
                        aria-label="导出资源"
                      >
                        <DownloadSimple size={16} />
                        <span className="group-action-label">导出</span>
                      </button>
                      {!selected.isProtected && (
                        <button
                          type="button"
                          className={`button group-editor-delete ${
                            armedDeleteGroupId === selected.id
                              ? "is-delete-armed"
                              : ""
                          }`}
                          data-delete-group-id={selected.id}
                          aria-pressed={armedDeleteGroupId === selected.id}
                          aria-label={
                            armedDeleteGroupId === selected.id
                              ? "再次点击删除这个分组"
                              : "删除这个分组"
                          }
                          onClick={() => requestDelete(selected)}
                        >
                          <Trash size={17} />
                          <span className="group-action-label">
                            {armedDeleteGroupId === selected.id
                              ? "确认删除"
                              : "删除"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  <label className="settings-field">
                    <span>分组名称</span>
                    <input
                      value={selectedDraft.name}
                      disabled={selected.isProtected}
                      onChange={(event) =>
                        updateSelected({ name: event.target.value })
                      }
                    />
                  </label>

                  <fieldset className="field-group">
                    <legend>分组图标</legend>
                    <div className="group-icon-choice-grid manager-icon-grid">
                      {GROUP_ICON_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={`group-icon-choice ${
                            selectedDraft.icon === option.value ? "selected" : ""
                          }`}
                          title={option.label}
                        >
                          <input
                            type="radio"
                            name={`manager-icon-${selected.id}`}
                            checked={selectedDraft.icon === option.value}
                            disabled={selected.isProtected}
                            onChange={() =>
                              updateSelected({ icon: option.value })
                            }
                          />
                          <GroupIcon name={option.value} size={20} />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {selected.isProtected && (
                    <p className="protected-note">
                      <LockSimple size={16} />
                      “其他”是系统保底分组，不能改名、移动或删除。
                    </p>
                  )}
                </div>
              )}
            </div>

            {error && (
              <p className="field-error group-dialog-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="dialog-footer">
            <Dialog.Close asChild>
              <button type="button" className="button secondary-button">
                取消
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="button primary-button"
              onClick={saveAndClose}
            >
              保存分组
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
