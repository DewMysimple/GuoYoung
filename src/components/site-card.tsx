import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowUpRight,
  Check,
  DotsSixVertical,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";
import { getHostname } from "../lib/site-utils";
import type { SiteGroup, SiteItem } from "../types";
import { CategoryIcon } from "./category-icon";
import { Favicon } from "./favicon";

export type SiteDragMode = "reorder" | "transfer" | "disabled";

interface SiteCardProps {
  site: SiteItem;
  group: SiteGroup;
  dragMode: SiteDragMode;
  dragDisabledReason?: string;
  dragPending: boolean;
  dropTarget: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  selectedCount?: number;
  batchDragging?: boolean;
  deleteArmed?: boolean;
  onToggleSelected?: (site: SiteItem) => void;
  onEdit: (site: SiteItem) => void;
  onDelete: (site: SiteItem) => void;
}

export function SiteCard(props: SiteCardProps) {
  return props.dragMode === "transfer" ? (
    <TransferableSiteCard {...props} />
  ) : (
    <SortableSiteCard {...props} />
  );
}

function SortableSiteCard(props: SiteCardProps) {
  const reduceMotion = useReducedMotion();
  const drag = useSortable({
    id: props.site.id,
    disabled: props.dragMode === "disabled",
    transition: {
      duration: reduceMotion ? 0 : 160,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(drag.transform),
    transition: drag.isDragging ? "none" : drag.transition,
    zIndex: drag.isDragging ? 10 : undefined,
  };

  return <SiteCardFrame {...props} drag={drag} style={style} />;
}

function TransferableSiteCard(props: SiteCardProps) {
  const drag = useDraggable({ id: props.site.id });
  const style: CSSProperties = {
    // DragOverlay follows the pointer. Keeping the source card fixed makes it
    // an honest origin marker and prevents transfer-only drags from looking
    // like a sortable rearrangement.
    zIndex: drag.isDragging ? 10 : undefined,
  };

  return <SiteCardFrame {...props} drag={drag} style={style} />;
}

type SiteCardDragBindings = Pick<
  ReturnType<typeof useSortable>,
  | "attributes"
  | "listeners"
  | "setNodeRef"
  | "setActivatorNodeRef"
  | "isDragging"
>;

interface SiteCardFrameProps extends SiteCardProps {
  drag: SiteCardDragBindings;
  style: CSSProperties;
}

function SiteCardFrame({
  site,
  group,
  dragMode,
  dragDisabledReason = "当前视图无法手动排序",
  dragPending,
  dropTarget,
  selectionMode = false,
  selected = false,
  selectedCount = 0,
  batchDragging = false,
  deleteArmed = false,
  onToggleSelected,
  onEdit,
  onDelete,
  drag,
  style,
}: SiteCardFrameProps) {
  const dragDisabled = dragMode === "disabled";
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = drag;
  const dragActionLabel = dragDisabled
    ? dragDisabledReason
    : dragMode === "transfer"
      ? selectedCount > 1 && selected
        ? `拖动 ${selectedCount} 个已选网站更换分组`
        : `拖动 ${site.name} 更换分组`
      : `拖动 ${site.name} 调整顺序`;
  const dragActionTitle = dragDisabled
    ? dragDisabledReason
    : dragMode === "transfer"
      ? "长按卡片后拖到其他分组区域或分组标签"
      : "长按卡片后拖动，也可以聚焦此按钮并按空格键排序";

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`site-card ${dragPending ? "is-drag-pending" : ""} ${
        isDragging ? "is-dragging" : ""
      } ${
        dropTarget && !isDragging ? "is-drop-target" : ""
      } ${selectionMode ? "is-selection-mode" : ""} ${
        selected ? "is-selected" : ""
      } ${batchDragging && selected ? "is-batch-source" : ""}`}
      data-testid={`site-card-${site.id}`}
      data-site-dnd-id={site.id}
      data-site-group-id={site.groupId}
      data-drag-mode={dragMode}
      data-drag-disabled={dragDisabled || undefined}
      onMouseDown={(event) => {
        if (!dragDisabled) listeners?.onMouseDown?.(event);
      }}
      onTouchStart={(event) => {
        if (!dragDisabled) listeners?.onTouchStart?.(event);
      }}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        if (!selectionMode || !onToggleSelected) return;
        if ((event.target as Element).closest("button")) return;
        event.preventDefault();
        event.stopPropagation();
        onToggleSelected(site);
      }}
    >
      <a
        className="site-card-full-link"
        href={selectionMode ? undefined : site.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`打开 ${site.name}`}
        draggable={false}
      />

      <div className="site-card-topline">
        {selectionMode && (
          <button
            type="button"
            className="site-selection-toggle"
            aria-label={`${selected ? "取消选择" : "选择"} ${site.name}`}
            aria-pressed={selected}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelected?.(site);
            }}
          >
            {selected && <Check size={14} weight="bold" />}
          </button>
        )}
        <Favicon site={site} size="large" />
        <div className="card-actions">
          <button
            type="button"
            className="icon-button card-action"
            aria-label={`编辑 ${site.name}`}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={() => onEdit(site)}
          >
            <PencilSimple size={17} weight="regular" />
          </button>
          <button
            type="button"
            className={`icon-button card-action danger-action ${
              deleteArmed ? "is-delete-armed" : ""
            }`}
            aria-label={
              deleteArmed ? `再次点击删除 ${site.name}` : `删除 ${site.name}`
            }
            title={deleteArmed ? "再次点击删除" : `删除 ${site.name}`}
            data-delete-site-id={site.id}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={() => onDelete(site)}
          >
            <Trash size={17} weight="regular" />
            {deleteArmed && (
              <span className="delete-confirm-hint" aria-hidden="true">
                再次点击删除
              </span>
            )}
          </button>
          <button
            type="button"
            className="icon-button drag-handle"
            aria-label={dragActionLabel}
            disabled={dragDisabled}
            ref={setActivatorNodeRef}
            title={dragActionTitle}
            {...attributes}
            onKeyDown={(event) => listeners?.onKeyDown?.(event)}
          >
            <DotsSixVertical size={19} weight="bold" />
          </button>
        </div>
      </div>

      <div className="site-card-link">
        <span className="site-name-row">
          <span className="site-name" title={site.name}>
            {site.name}
          </span>
          <ArrowUpRight className="open-arrow" size={18} weight="regular" />
        </span>
        <span className="site-domain">{getHostname(site.url)}</span>
      </div>

      <div className="site-category">
        <CategoryIcon name={group.icon} size={15} />
        <span>{group.name}</span>
      </div>
    </article>
  );
}

interface SiteCardDragPreviewProps {
  site: SiteItem;
  group: SiteGroup;
  overGroupTab?: boolean;
  batchCount?: number;
}

export function SiteCardDragPreview({
  site,
  group,
  overGroupTab = false,
  batchCount = 1,
}: SiteCardDragPreviewProps) {
  return (
    <article
      className={`site-card site-card-drag-preview ${
        overGroupTab ? "is-over-group-tab" : ""
      } ${batchCount > 1 ? "is-batch-preview" : ""}`}
      aria-hidden="true"
      data-testid="site-card-drag-preview"
      data-batch-count={batchCount}
    >
      {batchCount > 1 && (
        <span className="batch-drag-count" aria-label={`${batchCount} 个网站`}>
          {batchCount}
        </span>
      )}
      <div className="site-card-topline">
        <Favicon site={site} size="large" />
        <span className="drag-preview-grip">
          <DotsSixVertical size={20} weight="bold" />
        </span>
      </div>

      <div className="site-card-link">
        <span className="site-name-row">
          <span className="site-name" title={site.name}>
            {site.name}
          </span>
          <ArrowUpRight className="open-arrow" size={18} weight="regular" />
        </span>
        <span className="site-domain">{getHostname(site.url)}</span>
      </div>

      <div className="site-category">
        <CategoryIcon name={group.icon} size={15} />
        <span>{group.name}</span>
      </div>
    </article>
  );
}
