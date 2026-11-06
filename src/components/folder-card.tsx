import { DotsSixVertical, FolderSimple, CaretRight, DotsThree } from "@phosphor-icons/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useReducedMotion } from "framer-motion";
import { useContext, type CSSProperties, type ReactNode } from "react";
import { cardLayoutVariables } from "../lib/layout";
import type { SiteGroup } from "../types";
import { CardContent, CardOpenAction, CardSurface } from "./card-primitives";
import { CategoryIcon } from "./category-icon";
import { LayoutSettingsContext } from "./site-grid-layout";
import "./folder-card.css";

interface FolderDisplay {
  group: SiteGroup;
  count: number;
  parent?: SiteGroup;
}

interface FolderCardProps extends FolderDisplay {
  dragId: string;
  sortable: boolean;
  dragPending: boolean;
  dropTarget: boolean;
  interactionDisabled: boolean;
  onOpen: (group: SiteGroup) => void;
  onManage: (group: SiteGroup) => void;
}

export function FolderCard({ group, count, parent, dragId, sortable, dragPending, dropTarget,
  interactionDisabled, onOpen, onManage }: FolderCardProps) {
  const reduceMotion = useReducedMotion();
  const drag = useSortable({
    id: dragId,
    disabled: { draggable: !sortable, droppable: !sortable },
    data: { type: "folder-card", groupId: group.parentId, folderId: group.id },
    transition: { duration: reduceMotion ? 0 : 160, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  });
  return (
    <CardSurface
      ref={drag.setNodeRef}
      className={`folder-card ${dragPending ? "is-drag-pending" : ""} ${drag.isDragging ? "is-dragging" : ""} ${dropTarget && !drag.isDragging ? "is-drop-target" : ""}`}
      style={{
        transform: CSS.Transform.toString(drag.transform),
        transition: drag.isDragging ? "none" : drag.transition,
      }}
      data-testid={`folder-card-${group.id}`}
      data-folder-dnd-id={sortable ? dragId : undefined}
      data-folder-parent-id={group.parentId}
      data-drag-disabled={!sortable || undefined}
      data-selection-surface="folder-card"
      onMouseDown={event => { if (sortable) drag.listeners?.onMouseDown?.(event); }}
      onTouchStart={event => { if (sortable) drag.listeners?.onTouchStart?.(event); }}
      onDragStart={event => event.preventDefault()}
    >
      <CardOpenAction label={`打开子分组 ${group.name}，${count} 个网站`}
        disabled={interactionDisabled} onOpen={() => onOpen(group)} />
      <FolderContent group={group} count={count} parent={parent} actions={
        <div className="card-actions">
          <button type="button" className="icon-button card-action"
            aria-label={`管理 ${group.name}`} title="管理子分组" aria-haspopup="dialog"
            disabled={interactionDisabled}
            onMouseDown={event => event.stopPropagation()}
            onTouchStart={event => event.stopPropagation()}
            onClick={() => onManage(group)}>
            <DotsThree size={19} weight="bold" />
          </button>
          {sortable && <button type="button" className="icon-button drag-handle"
            {...drag.attributes} ref={drag.setActivatorNodeRef}
            aria-label={`拖动 ${group.name} 调整顺序`}
            onKeyDown={event => drag.listeners?.onKeyDown?.(event)}>
            <DotsSixVertical size={19} weight="bold" />
          </button>}
        </div>
      } />
    </CardSurface>
  );
}

function FolderContent({ group, count, parent, actions }: FolderDisplay & { actions: ReactNode }) {
  return (
    <CardContent
      icon={<span className="favicon-frame favicon-large folder-card-icon" aria-hidden="true">
        <CategoryIcon name={group.icon} size={24} />
      </span>}
      actions={actions}
      name={group.name}
      domain={`${count} 个网站`}
      footer={<div className="site-category folder-card-footer">
        <span className="site-category-group">
          <FolderSimple size={15} aria-hidden="true" />
          <span>{parent?.name ?? "子分组"}</span>
        </span>
        <CaretRight size={15} aria-hidden="true" className="folder-card-arrow" />
      </div>}
    />
  );
}

export function FolderCardDragPreview({ group, count }: FolderDisplay) {
  const appearance = useContext(LayoutSettingsContext);
  return <CardSurface className="folder-card site-card-drag-preview" aria-hidden="true"
    data-testid="folder-card-drag-preview"
    style={appearance.cardShape === "square" ? {
      ...cardLayoutVariables(appearance),
      "--drag-preview-grip-size": "var(--card-action-size)",
    } as CSSProperties : undefined}>
    <FolderContent group={group} count={count} actions={<span className="drag-preview-grip">
      <DotsSixVertical size={20} weight="bold" />
    </span>} />
  </CardSurface>;
}
