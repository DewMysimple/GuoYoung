import { useEffect, useId, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
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
  DotsSixVertical,
  LockSimple,
  Trash,
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
  onRequestDelete: (group: SiteGroup) => void;
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
      style={{ transform: CSS.Transform.toString(transform), transition }}
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

export function GroupDialog({
  open,
  initialGroupId,
  groups,
  sites,
  onOpenChange,
  onUpdate,
  onReorder,
  onRequestDelete,
}: GroupDialogProps) {
  const titleId = useId();
  const orderedGroups = useMemo(
    () => groups.slice().sort((a, b) => a.order - b.order),
    [groups],
  );
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, GroupDraft>>({});
  const [error, setError] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!open) return;
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
  }, [initialGroupId, open]);

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
              <div className="group-manager-list" aria-label="分组列表">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
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
                          sites.filter((site) => site.groupId === group.id).length
                        }
                        selected={selected?.id === group.id}
                        onSelect={() => {
                          setSelectedId(group.id);
                          setError("");
                        }}
                      />
                    ))}
                  </SortableContext>
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
                        {sites.filter((site) => site.groupId === selected.id).length}
                        {" "}个网站
                      </span>
                    </div>
                    {!selected.isProtected && (
                      <button
                        type="button"
                        className="button group-editor-delete"
                        onClick={() => onRequestDelete(selected)}
                      >
                        <Trash size={17} />删除这个分组
                      </button>
                    )}
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
