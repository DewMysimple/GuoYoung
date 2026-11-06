import { HelpTip } from "./help-tip";
import { CardSelectionToggle } from "./card-primitives";
import { ConfirmDialog } from "./confirm-dialog";
import { useGroupManagerSelection } from "../hooks/use-group-manager-selection";
import { useSweepSelection } from "../hooks/use-sweep-selection";
import "./group-manager-selection.css";
import { DialogNavigation } from "./dialog-navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
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
  ArrowRight,
  CaretDown,
  DotsSixVertical,
  FolderSimplePlus,
  LockSimple,
} from "@phosphor-icons/react";
import { GROUP_ICON_OPTIONS } from "../data/group-icons";
import { canParentGroup, getChildGroups, getGroupSiteCounts, getGroupSubtreeIds, getRootGroups } from "../lib/group-hierarchy";
import { getGroupWorkspace } from "../lib/github-workspace";
import type { CategoryIcon, SiteGroup, SiteItem } from "../types";
import { CategoryIcon as GroupIcon } from "./category-icon";
import { GroupManagerActions } from "./group-manager-actions";
import { SelectMenu } from "./select-menu";

interface GroupDialogProps {
  open: boolean;
  initialGroupId?: string;
  groups: SiteGroup[];
  sites: SiteItem[];
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, name: string, icon: CategoryIcon, parentId?: string | null) => void;
  onReorder: (activeId: string, overId: string) => void;
  onDelete: (group: SiteGroup, mode?: "trash" | "keep") => void;
  onCreateChild: (parent: SiteGroup) => void;
  onOpenChild: (group: SiteGroup) => void;
  currentGroupId: string;
  onDeleteMany: (ids: string[]) => void;
  onExportGroup: (groupId: string) => void;
  onImportGroup: (groupId: string) => void;
}

interface GroupDraft {
  name: string;
  icon: CategoryIcon;
  parentId?: string | null;
}

interface GroupRowProps {
  group: SiteGroup;
  count: number;
  selected: boolean;
  onSelect: () => void;
  checked: boolean;
  onToggle: (shift: boolean) => void;
}

function SortableGroupBranch({ children, ...props }: GroupRowProps & { children: ReactNode }) {
  const { group } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: group.id,
    disabled: group.isProtected,
  });

  return (
    <li
      ref={setNodeRef}
      className={`group-manager-branch ${isDragging ? "is-dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        willChange: isDragging ? "transform" : undefined,
      }}
    >
      <GroupManagerRow {...props} isDragging={isDragging} dragHandle={{ attributes, listeners, setActivatorNodeRef }} />
      {children}
    </li>
  );
}

function GroupManagerRow({ group, count, checked, onToggle, selected, onSelect, isDragging, dragHandle }:
  GroupRowProps & {
    isDragging?: boolean;
    dragHandle?: Pick<ReturnType<typeof useSortable>, "attributes" | "listeners" | "setActivatorNodeRef">;
  }
) {
  return (
    <div
      className={`group-list-item has-selection ${group.parentId ? "is-child-group" : ""} ${checked ? "is-checked" : ""} ${selected ? "selected" : ""} ${
        isDragging ? "is-dragging" : ""
      }`}
    >
      <CardSelectionToggle selected={checked} label={`${checked ? "取消选择" : "选择"} ${group.name} 分组`}
        disabled={group.isProtected} onToggle={onToggle} className="group-manager-check" selectionId={group.id} />
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
          <small>{group.parentId && "子分组 · "}{count} 个网站</small>
        </span>
      </button>
      {dragHandle && <button
        type="button"
        className="group-drag-handle"
        ref={dragHandle.setActivatorNodeRef}
        disabled={group.isProtected}
        aria-label={group.isProtected ? "受保护分组不能移动" : `拖动 ${group.name}`}
        {...dragHandle.attributes}
        {...dragHandle.listeners}
      >
        {group.isProtected ? (
          <LockSimple size={16} />
        ) : (
          <DotsSixVertical size={18} weight="bold" />
        )}
      </button>}
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

const COMMON_GROUP_ICON_COUNT = 12;

function GroupIconPicker({ groupId, selected, onChange }: {
  groupId: string;
  selected: CategoryIcon;
  onChange: (icon: CategoryIcon) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const gridId = useId();
  const common = GROUP_ICON_OPTIONS.slice(0, COMMON_GROUP_ICON_COUNT);
  const selectedOption = GROUP_ICON_OPTIONS.find(option => option.value === selected);
  const visible = expanded ? GROUP_ICON_OPTIONS
    : selectedOption && !common.includes(selectedOption) ? [...common.slice(0, -1), selectedOption] : common;

  return (
    <fieldset className="field-group manager-icon-picker">
      <legend>分组图标</legend>
      <div id={gridId} className="group-icon-choice-grid manager-icon-grid">
        {visible.map((option) => (
          <label key={option.value}
            className={`group-icon-choice ${selected === option.value ? "selected" : ""}`}
            title={option.label}
          >
            <input type="radio" name={`manager-icon-${groupId}`} checked={selected === option.value}
              onChange={() => onChange(option.value)} />
            <GroupIcon name={option.value} size={18} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <button type="button" className="view-control-button group-icon-expand"
        aria-expanded={expanded} aria-controls={gridId} onClick={() => setExpanded(value => !value)}
      >
        <CaretDown size={13} aria-hidden="true" />
        {expanded ? "收起图标" : "展开全部图标"}
      </button>
    </fieldset>
  );
}

function HierarchyDeletion({ group, groups, count, confirmTrash, onClose, onRequestTrash, onDelete }: {
  group?: SiteGroup;
  groups: SiteGroup[];
  count: number;
  confirmTrash: boolean;
  onClose: () => void;
  onRequestTrash: (id: string) => void;
  onDelete: GroupDialogProps["onDelete"];
}) {
  if (!group) return null;
  const parent = groups.find(candidate => candidate.id === group.parentId);
  if (confirmTrash) {
    return <ConfirmDialog key="trash" open title={`确认删除“${group.name}”？`}
      description={`${parent ? "子分组" : "该分组及其子分组"}将删除，${count} 个网站会移入回收站。`}
      confirmLabel={parent ? "连同网站删除" : "连同子分组删除"} destructive
      onOpenChange={open => { if (!open) onClose(); }} onConfirm={() => onDelete(group, "trash")} />;
  }
  return <ConfirmDialog key="keep" open title={`如何删除“${group.name}”？`}
    description={parent
      ? `其中有 ${count} 个网站。保留网站时，它们会移到“${parent.name}”。`
      : `该分组下共有 ${count} 个网站。解散后，子分组提升为一级，直属网站移至当前工作区的“其他”。`}
    confirmLabel={parent ? "保留网站并删除文件夹" : "解散分组"}
    alternateAction={{ label: parent ? "连同网站删除…" : "连同子分组删除…", onClick: () => onRequestTrash(group.id) }}
    onOpenChange={open => { if (!open) onClose(); }} onConfirm={() => onDelete(group, "keep")} />;
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
  onCreateChild,
  onOpenChild,
  currentGroupId,
  onDeleteMany,
  onExportGroup,
  onImportGroup,
}: GroupDialogProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const roots = useMemo(() => getRootGroups(groups).sort((a, b) => a.order - b.order), [groups]);
  const branches = useMemo(
    () => roots.map(group => ({ group, children: getChildGroups(groups, group.id) })),
    [groups, roots],
  );
  const orderedGroups = useMemo(() => branches.flatMap(({ group, children }) => [group, ...children]), [branches]);
  const selection = useGroupManagerSelection(open, orderedGroups);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [hierarchyDeleteId, setHierarchyDeleteId] = useState<string>();
  const [trashHierarchyId, setTrashHierarchyId] = useState<string>();
  const selectedSubtree = getGroupSubtreeIds(groups, selection.selectedIds);
  const selectedSiteCount = sites.filter(site => selectedSubtree.has(site.groupId)).length;
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, GroupDraft>>({});
  const [pendingTransfer, setPendingTransfer] = useState<"import" | "export" | null>(null);
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
  const { containerRef: groupListRef, handlers: sweepHandlers } = useSweepSelection({
    enabled: open && !activeDragGroupId && !deleteRequested && !pendingTransfer && !hierarchyDeleteId && !trashHierarchyId,
    itemSelector: ".group-manager-check:not(:disabled)", idAttribute: "data-selection-id",
    onToggle: ids => { clearArmedDelete(); selection.toggleMany(ids); },
  });
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
    const sortableGroups = roots.filter(group => !group.isProtected);
    const sortableIds = new Set(sortableGroups.map(group => group.id));
    const collisions = closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(container => sortableIds.has(String(container.id))),
    });
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

  const siteCountByGroup = useMemo(() => getGroupSiteCounts(groups, sites), [groups, sites]);

  useEffect(() => {
    if (!open) {
      setDeleteRequested(false);
      setHierarchyDeleteId(undefined);
      setTrashHierarchyId(undefined);
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
    if (group.parentId || getChildGroups(groups, group.id).length > 0) {
      setHierarchyDeleteId(group.id);
      return false;
    }
    if (armedDeleteGroupId === group.id) {
      clearArmedDelete();
      onDelete(group);
      return false;
    }
    clearArmedDelete();
    setArmedDeleteGroupId(group.id);
    armedDeleteTimerRef.current = window.setTimeout(() => {
      armedDeleteTimerRef.current = null;
      setArmedDeleteGroupId(null);
    }, 2000);
    return true;
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
  const possibleParents = selected && !selected.isProtected && !selected.githubImportSource &&
    !getChildGroups(groups, selected.id).length
    ? roots.filter(group => group.id !== selected.id && canParentGroup(group, getGroupWorkspace(selected)))
    : [];

  function rowProps(group: SiteGroup): GroupRowProps {
    return {
      group,
      count: siteCountByGroup.get(group.id) ?? 0,
      checked: selection.selectedIds.includes(group.id),
      selected: selected?.id === group.id,
      onToggle: shift => {
        clearArmedDelete();
        selection.toggle(group.id, shift);
      },
      onSelect: () => {
        clearArmedDelete();
        setSelectedId(group.id);
        setError("");
      },
    };
  }

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

  function requestTransfer(mode: "import" | "export") {
    if (!selected) return;
    const dirty = orderedGroups.some(group => {
      const draft = drafts[group.id];
      return draft && (draft.name !== group.name || draft.icon !== group.icon ||
        (draft.parentId !== undefined && draft.parentId !== (group.parentId ?? null)));
    });
    if (dirty) setPendingTransfer(mode);
    else (mode === "import" ? onImportGroup : onExportGroup)(selected.id);
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
      onUpdate(group.id, draft.name.trim(), draft.icon, draft.parentId);
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
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus({ preventScroll: true });
          }}
        >
          <div className="dialog-header">
            <div>
              <div className="dialog-heading-with-help"><Dialog.Title ref={titleRef} id={titleId} className="dialog-title" tabIndex={-1}>管理分组</Dialog.Title>
                <HelpTip label="管理分组说明">点击名称编辑，点击或按住划过圆圈选择，回划可取消选择；拖动手柄调整顺序。</HelpTip>
              </div>
              <Dialog.Description className="visually-hidden">
                点击名称编辑，点击或按住划过圆圈选择，回划可取消选择；拖动手柄调整顺序。
              </Dialog.Description>
            </div>
            <DialogNavigation />
          </div>

          <div className="group-dialog-scroll">
            <div className="group-manager-batchbar">
              <CardSelectionToggle selected={selection.allSelected} indeterminate={selection.selectedIds.length > 0 && !selection.allSelected}
                disabled={Boolean(activeDragGroupId)} label={selection.allSelected ? "取消全选分组" : "全选可删除分组"}
                onToggle={() => selection.allSelected ? selection.clear() : selection.selectAll()} className="group-manager-check" />
              <span role="status" aria-label="分组选择数量">{selection.selectedIds.length ? `已选 ${selection.selectedIds.length} 个分组 · ${selectedSiteCount} 个网站` : "选择分组"}</span>
              <button type="button" className="button secondary-button" onClick={selection.invert} disabled={Boolean(activeDragGroupId)}>反选</button>
              <button type="button" className="button destructive-button" disabled={!selection.selectedIds.length || Boolean(activeDragGroupId)}
                onClick={() => { clearArmedDelete(); setDeleteRequested(true); }}>删除所选</button>
            </div>
            <div className="group-manager-layout">
              <div
                ref={groupListRef}
                {...sweepHandlers}
                className="group-manager-list"
                aria-label="分组列表"
              >
                <h3 className="group-manager-directory-title">分组目录</h3>
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
                    items={roots.map((group) => group.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="group-manager-tree" role="list" aria-label="分组目录">
                      {branches.map(({ group, children }) => (
                        <SortableGroupBranch key={group.id} {...rowProps(group)}>
                          {children.length > 0 && (
                            <ul className="group-manager-tree-children" role="list" aria-label={`${group.name}的子分组`}>
                              {children.map(child => <li key={child.id}><GroupManagerRow {...rowProps(child)} /></li>)}
                            </ul>
                          )}
                        </SortableGroupBranch>
                      ))}
                    </ul>
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
                    <div className="group-editor-summary-copy">
                      <strong>{selectedDraft.name || "未命名分组"}</strong>
                      <span>
                        {selected.parentId ? "子分组 · " : "一级分组 · "}
                        {siteCountByGroup.get(selected.id) ?? 0}
                        {" "}个网站
                      </span>
                    </div>
                    <GroupManagerActions key={selected.id} groupId={selected.id}
                      onImport={() => requestTransfer("import")} onExport={() => requestTransfer("export")}
                      onDelete={selected.isProtected ? undefined : () => requestDelete(selected)}
                      deleteArmed={armedDeleteGroupId === selected.id} clearDelete={clearArmedDelete} />
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

                  {possibleParents.length > 0 && (
                    <div className="settings-field">
                      <span>所属一级分组</span>
                      <SelectMenu key={selected.id} className="group-editor-parent-select"
                        ariaLabel="所属一级分组" menuLabel="所属一级分组" containEscape
                        value={selectedDraft.parentId === null ? "" : selectedDraft.parentId ?? selected.parentId ?? ""}
                        options={[
                          { value: "", label: selected.parentId ? "提升为一级分组" : "一级分组" },
                          ...possibleParents.map(group => ({ value: group.id, label: group.name })),
                        ]}
                        onChange={parentId => updateSelected({ parentId: parentId || null })}
                      />
                    </div>
                  )}

                  {!selected.isProtected && <GroupIconPicker key={selected.id} groupId={selected.id}
                    selected={selectedDraft.icon} onChange={icon => updateSelected({ icon })} />}

                  {selected.isProtected && (
                    <p className="protected-note">
                      <LockSimple size={16} />
                      “其他”是系统保底分组，不能改名、移动或删除。
                    </p>
                  )}

                  {selected.parentId && selected.id !== currentGroupId && (
                    <div className="group-editor-footer">
                      <button type="button" className="view-control-button" onClick={() => onOpenChild(selected)}>
                        打开此分组 <ArrowRight size={15} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  {canParentGroup(selected, getGroupWorkspace(selected)) && (
                    <div className="group-editor-footer">
                      <button type="button" className="view-control-button" onClick={() => onCreateChild(selected)}>
                        <FolderSimplePlus size={16} aria-hidden="true" />创建子分组
                      </button>
                    </div>
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
          <ConfirmDialog open={Boolean(pendingTransfer)} title="放弃未保存的分组修改？"
            description="进入数据页面会使用已保存的分组信息。你也可以取消，先保存分组。"
            confirmLabel="放弃并继续" cancelLabel="继续编辑" onOpenChange={(open) => { if (!open) setPendingTransfer(null); }}
            onConfirm={() => { if (selected && pendingTransfer) (pendingTransfer === "import" ? onImportGroup : onExportGroup)(selected.id); setPendingTransfer(null); }} />
          <ConfirmDialog open={deleteRequested && selection.selectedIds.length > 0} onOpenChange={setDeleteRequested}
            title={`删除 ${selection.selectedIds.length} 个分组？`}
            description={`所选分组及其子分组将删除，其中 ${selectedSiteCount} 个网站移入回收站，可在回收站恢复网站。受保护分组不受影响。`}
            confirmLabel="删除所选分组" destructive onConfirm={() => {
              onDeleteMany(selection.selectedIds); selection.clear(); setDeleteRequested(false);
            }} />
          <HierarchyDeletion
            group={groups.find(group => group.id === (hierarchyDeleteId ?? trashHierarchyId))}
            groups={groups}
            count={siteCountByGroup.get(hierarchyDeleteId ?? trashHierarchyId ?? "") ?? 0}
            confirmTrash={Boolean(trashHierarchyId)}
            onClose={trashHierarchyId ? () => setTrashHierarchyId(undefined) : () => setHierarchyDeleteId(undefined)}
            onRequestTrash={id => { setHierarchyDeleteId(undefined); setTrashHierarchyId(id); }}
            onDelete={onDelete}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
