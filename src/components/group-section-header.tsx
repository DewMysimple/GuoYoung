import { CheckSquare, DotsSixVertical, DotsThree } from "@phosphor-icons/react";
import type { HTMLAttributes } from "react";
import type { SiteGroup } from "../types";
import { CategoryIcon } from "./category-icon";
import { CompactIconButton } from "./compact-icon-button";
import { GroupInsertControl, stopGroupSortPointer } from "./group-insert-control";

export interface GroupSectionHeaderProps {
  group: SiteGroup;
  count: number;
  canSort: boolean;
  insertDisabled: boolean;
  onInsert: (position: "before" | "after") => void;
  onManage: () => void;
  groupSelected: boolean;
  selectionActive: boolean;
  onToggleGroupSelected: (shiftKey?: boolean) => void;
  onEnterGroupSelection: () => void;
  siteSelectionMode: boolean;
  allSitesSelected: boolean;
  onToggleSiteSelectionMode: () => void;
  pointerListeners: Pick<HTMLAttributes<HTMLElement>, "onMouseDown" | "onTouchStart">;
}

export function GroupSectionHeader({
  group,
  count,
  canSort,
  insertDisabled,
  onInsert,
  onManage,
  groupSelected,
  selectionActive,
  onToggleGroupSelected,
  onEnterGroupSelection,
  siteSelectionMode,
  allSitesSelected,
  onToggleSiteSelectionMode,
  pointerListeners,
}: GroupSectionHeaderProps) {
  return (
      <header className="grouped-site-header">
        <div
          className={`grouped-site-header-main ${canSort ? "is-sortable" : ""}`}
          data-group-sort-handle={canSort ? "true" : undefined}
          data-selection-surface="group-header"
          aria-label={
            canSort ? `拖动 ${group.name} 分组调整顺序` : undefined
          }
          onClick={(event) => {
            if (!selectionActive || group.isProtected) return;
            if ((event.target as Element).closest("button")) return;
            event.preventDefault();
            event.stopPropagation();
            onToggleGroupSelected(event.shiftKey);
          }}
          onDoubleClick={(event) => {
            if (selectionActive || (event.target as Element).closest("button")) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onEnterGroupSelection();
          }}
          {...pointerListeners}
        >
          <span className="grouped-site-icon">
            <CategoryIcon name={group.icon} size={17} />
          </span>
          <h3 id={`group-row-${group.id}`} title={group.name}>{group.name}</h3>
          <span className="grouped-site-count" aria-label={`${count} 个网站`}>{count}</span>
          {canSort && (
            <span className="grouped-site-sort-grip" aria-hidden="true">
              <DotsSixVertical size={16} />
            </span>
          )}
          <CompactIconButton
            className="grouped-site-manage"
            disabled={selectionActive}
            aria-disabled={selectionActive || undefined}
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
            <DotsThree size={18} aria-hidden="true" />
          </CompactIconButton>
          <GroupInsertControl group={group} disabled={insertDisabled} selectionActive={selectionActive}
            selected={groupSelected} onToggleSelected={onToggleGroupSelected} onInsert={onInsert} />
        </div>
        <button
          type="button"
          className={`grouped-site-multi-select ${selectionActive ? "active" : ""}`}
          data-selection-surface="selection-switch"
          aria-pressed={selectionActive}
          aria-label={
            !selectionActive
              ? `多选 ${group.name} 网站`
              : allSitesSelected && siteSelectionMode
                ? `取消全选 ${group.name} 网站`
                : `全选 ${group.name} 网站`
          }
          onPointerDown={stopGroupSortPointer}
          onMouseDown={stopGroupSortPointer}
          onTouchStart={stopGroupSortPointer}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSiteSelectionMode();
          }}
        >
          <CheckSquare size={15} />
          <span>
            {!selectionActive
              ? "多选"
              : allSitesSelected && siteSelectionMode
                ? "取消全选"
                : "全选"}
          </span>
        </button>
      </header>
  );
}
