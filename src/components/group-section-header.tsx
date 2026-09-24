import { Check, CheckSquare, DotsSixVertical, DotsThree } from "@phosphor-icons/react";
import type { HTMLAttributes } from "react";
import type { SiteGroup } from "../types";
import type { CollectionSelection } from "../lib/collection-selection";
import { CategoryIcon } from "./category-icon";
import { CompactIconButton } from "./compact-icon-button";
import { GroupInsertControl } from "./group-insert-control";

export interface GroupSectionHeaderProps {
  group: SiteGroup;
  count: number;
  canSort: boolean;
  insertDisabled: boolean;
  actionsDisabled: boolean;
  onInsert: (position: "before" | "after") => void;
  onManage: () => void;
  groupSelected: boolean;
  selectionMode: CollectionSelection["mode"];
  onToggleGroupSelected: (shiftKey?: boolean) => void;
  onEnterGroupSelection: () => void;
  allSitesSelected: boolean;
  onToggleSiteSelectionMode: () => void;
  pointerListeners: Pick<HTMLAttributes<HTMLElement>, "onMouseDown" | "onTouchStart">;
}

export function GroupSectionHeader({
  group,
  count,
  canSort,
  insertDisabled,
  actionsDisabled,
  onInsert,
  onManage,
  groupSelected,
  selectionMode,
  onToggleGroupSelected,
  onEnterGroupSelection,
  allSitesSelected,
  onToggleSiteSelectionMode,
  pointerListeners,
}: GroupSectionHeaderProps) {
  const selectionActive = selectionMode !== "none";
  const selectionLabel = !selectionActive ? "多选"
    : allSitesSelected && selectionMode === "sites" ? "取消全选" : "全选";

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
            event.preventDefault();
            event.stopPropagation();
            onToggleGroupSelected(event.shiftKey);
          }}
          onDoubleClick={(event) => {
            if (selectionActive || group.isProtected) return;
            event.preventDefault();
            event.stopPropagation();
            onEnterGroupSelection();
          }}
          {...pointerListeners}
        >
          <span className="grouped-site-icon">
            <CategoryIcon name={group.icon} size={17} />
            {canSort && <span className="grouped-site-sort-grip" aria-hidden="true"><DotsSixVertical size={18} /></span>}
          </span>
          <h3 id={`group-row-${group.id}`} title={group.name}>{group.name}</h3>
          <span className="grouped-site-count" aria-label={`${count} 个网站`}>{count}</span>
        </div>
        {/* Actions are siblings of the drag surface: no nested pointer interception. */}
        <div className="grouped-site-actions" data-selection-surface="group-actions">
          {selectionActive ? (
            <CompactIconButton className={`group-selection-trigger ${groupSelected ? "is-selected" : ""}`}
              disabled={group.isProtected || actionsDisabled}
              aria-label={`${groupSelected ? "取消选择" : "选择"} ${group.name} 分组`}
              aria-pressed={groupSelected}
              onClick={event => { event.stopPropagation(); onToggleGroupSelected(event.shiftKey); }}>
              <span className="group-selection-mark">{groupSelected && <Check size={12} weight="bold" aria-hidden="true" />}</span>
            </CompactIconButton>
          ) : (
            <GroupInsertControl group={group} disabled={insertDisabled} onInsert={onInsert} />
          )}
          <CompactIconButton
            className="grouped-site-manage"
            disabled={selectionActive || actionsDisabled}
            aria-label={`管理 ${group.name} 分组`}
            title={`管理 ${group.name} 分组`}
            onClick={(event) => {
              event.stopPropagation();
              onManage();
            }}
          >
            <DotsThree size={18} aria-hidden="true" />
          </CompactIconButton>
        <button
          type="button"
          className={`grouped-site-multi-select ${selectionActive ? "active" : ""}`}
          data-selection-surface="selection-switch"
          aria-pressed={selectionActive}
          aria-label={`${selectionLabel} ${group.name} 网站`}
          title={`${selectionLabel}网站`}
          disabled={actionsDisabled}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSiteSelectionMode();
          }}
        >
          <CheckSquare size={16} aria-hidden="true" />
          <span>{selectionLabel}</span>
        </button>
        </div>
      </header>
  );
}
