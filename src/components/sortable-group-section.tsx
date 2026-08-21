import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVertical, DotsThree, Plus } from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type { SiteGroup } from "../types";
import { CategoryIcon } from "./category-icon";
import { groupSortRowId } from "./group-drop-target";

interface SortableGroupSectionProps {
  group: SiteGroup;
  count: number;
  disabled: boolean;
  insertDisabled: boolean;
  onInsert: (position: "before" | "after") => void;
  onManage: () => void;
  children: ReactNode;
}

export function SortableGroupSection({
  group,
  count,
  disabled,
  insertDisabled,
  onInsert,
  onManage,
  children,
}: SortableGroupSectionProps) {
  const sortable = useSortable({
    id: groupSortRowId(group.id),
    disabled: disabled || group.isProtected,
    data: { type: "group-row-sort", groupId: group.id },
    transition: { duration: 160, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  });
  const canSort = !disabled && !group.isProtected;
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const insertControlRef = useRef<HTMLDivElement>(null);
  const pointerListeners: Pick<
    HTMLAttributes<HTMLElement>,
    "onMouseDown" | "onTouchStart"
  > = canSort
    ? {
        onMouseDown: sortable.listeners?.onMouseDown as
          | HTMLAttributes<HTMLElement>["onMouseDown"]
          | undefined,
        onTouchStart: sortable.listeners?.onTouchStart as
          | HTMLAttributes<HTMLElement>["onTouchStart"]
          | undefined,
      }
    : {};

  useEffect(() => {
    if (!insertMenuOpen) return;
    const closeOutside = (event: globalThis.PointerEvent) => {
      if (!insertControlRef.current?.contains(event.target as Node)) {
        setInsertMenuOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setInsertMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [insertMenuOpen]);

  useEffect(() => {
    if (insertDisabled) setInsertMenuOpen(false);
  }, [insertDisabled]);

  const stopSortPointer = (
    event: React.PointerEvent | React.MouseEvent | React.TouchEvent,
  ) => event.stopPropagation();

  return (
    <section
      ref={sortable.setNodeRef}
      className={`grouped-site-section ${
        sortable.isDragging ? "is-group-sorting" : ""
      }`}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.isDragging ? "none" : sortable.transition,
      }}
      aria-labelledby={`group-row-${group.id}`}
      data-group-sort-section-id={group.id}
    >
      <header
        className={`grouped-site-header ${canSort ? "is-sortable" : ""}`}
        data-group-sort-handle={canSort ? "true" : undefined}
        aria-label={canSort ? `拖动 ${group.name} 分组调整顺序` : undefined}
        {...pointerListeners}
      >
        <div className="group-add-control" ref={insertControlRef}>
          <button
            type="button"
            className="group-add-trigger"
            disabled={insertDisabled}
            aria-label={`在 ${group.name} 附近添加分组`}
            aria-haspopup="menu"
            aria-expanded={insertMenuOpen}
            onPointerDown={stopSortPointer}
            onMouseDown={stopSortPointer}
            onTouchStart={stopSortPointer}
            onClick={(event) => {
              event.stopPropagation();
              setInsertMenuOpen((current) => !current);
            }}
          >
            <Plus size={15} weight="bold" aria-hidden="true" />
          </button>
          {insertMenuOpen && (
            <div
              className="group-add-menu"
              role="menu"
              aria-label={`添加到 ${group.name} 附近`}
              onPointerDown={stopSortPointer}
              onMouseDown={stopSortPointer}
              onTouchStart={stopSortPointer}
            >
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setInsertMenuOpen(false);
                  onInsert("before");
                }}
              >
                在“{group.name}”前添加
              </button>
              {!group.isProtected && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setInsertMenuOpen(false);
                    onInsert("after");
                  }}
                >
                  在“{group.name}”后添加
                </button>
              )}
            </div>
          )}
        </div>
        <span className="grouped-site-icon">
          <CategoryIcon name={group.icon} size={17} />
        </span>
        <h3 id={`group-row-${group.id}`}>{group.name}</h3>
        <span className="grouped-site-count">{count}</span>
        {canSort && (
          <span className="grouped-site-sort-grip" aria-hidden="true">
            <DotsSixVertical size={17} weight="bold" />
          </span>
        )}
        <button
          type="button"
          className="grouped-site-manage"
          aria-label={`管理 ${group.name} 分组`}
          title={`管理 ${group.name} 分组`}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onManage();
          }}
        >
          <DotsThree size={18} weight="bold" />
        </button>
      </header>
      {children}
    </section>
  );
}
