import { CardSurface, CardContent, CardOpenAction, CardSelectionToggle } from "./card-primitives";
import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
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
  workspaceLabel?: string;
  showClickCount?: boolean;
  dragMode: SiteDragMode;
  dragDisabledReason?: string;
  dragPending: boolean;
  dropTarget: boolean;
  selectionMode?: boolean;
  selectionEntryEnabled?: boolean;
  linkInteractionDisabled?: boolean;
  actionsDisabled?: boolean;
  selected?: boolean;
  selectedCount?: number;
  batchDragging?: boolean;
  deleteArmed?: boolean;
  onToggleSelected?: (site: SiteItem, shiftKey?: boolean) => void;
  onVisit: (site: SiteItem) => void;
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
  workspaceLabel,
  showClickCount = false,
  dragMode,
  dragDisabledReason = "当前视图无法手动排序",
  dragPending,
  dropTarget,
  selectionMode = false,
  selectionEntryEnabled = false,
  linkInteractionDisabled = false,
  actionsDisabled = false,
  selected = false,
  selectedCount = 0,
  batchDragging = false,
  deleteArmed = false,
  onToggleSelected,
  onVisit,
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
    <CardSurface
      ref={setNodeRef}
      style={style}
      className={`${dragPending ? "is-drag-pending" : ""} ${
        isDragging ? "is-dragging" : ""
      } ${
        dropTarget && !isDragging ? "is-drop-target" : ""
      } ${selectionMode ? "is-selection-mode" : ""} ${
        selected ? "is-selected" : ""
      } ${batchDragging && selected ? "is-batch-source" : ""} ${
        linkInteractionDisabled ? "is-link-interaction-disabled" : ""
      } ${actionsDisabled ? "is-actions-disabled" : ""}
      `}
      data-testid={`site-card-${site.id}`}
      data-site-dnd-id={site.id}
      data-site-group-id={site.groupId}
      data-drag-mode={dragMode}
      data-drag-disabled={dragDisabled || undefined}
      data-selection-surface="site-card"
      onMouseDown={(event) => {
        if (!dragDisabled) listeners?.onMouseDown?.(event);
      }}
      onTouchStart={(event) => {
        if (!dragDisabled) listeners?.onTouchStart?.(event);
      }}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        if ((!selectionMode && !selectionEntryEnabled) || !onToggleSelected) {
          return;
        }
        if ((event.target as Element).closest("button")) return;
        event.preventDefault();
        event.stopPropagation();
        onToggleSelected(site, event.shiftKey);
      }}
    >
      <CardOpenAction href={site.url} label={`${linkInteractionDisabled && selectionEntryEnabled ? "选择" : "打开"} ${site.name}`}
        disabled={(linkInteractionDisabled && !selectionEntryEnabled) || (selectionMode && !selectionEntryEnabled)}
        onSelect={selectionEntryEnabled && onToggleSelected ? (shiftKey) => onToggleSelected(site, shiftKey) : undefined}
        onOpen={() => onVisit(site)} />
        {selectionMode && <CardSelectionToggle selected={selected} label={`${selected ? "取消选择" : "选择"} ${site.name}`}
          onToggle={(shiftKey) => onToggleSelected?.(site, shiftKey)} />}
      <CardContent icon={<Favicon site={site} size="large" />} actions={<div className="card-actions">
          <button
            type="button"
            className="icon-button card-action"
            aria-label={`编辑 ${site.name}`}
            disabled={selectionMode || linkInteractionDisabled || actionsDisabled}
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
            disabled={selectionMode || linkInteractionDisabled || actionsDisabled}
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
        </div>} name={site.name} domain={getHostname(site.url)} external
        detail={<>{showClickCount && (
          <span
            className="site-click-count"
            aria-label={`访问次数 ${site.clickCount}`}
            title={`访问次数 ${site.clickCount}`}
          >
            {site.clickCount}
          </span>
        )}</>} footer={<div className="site-category">
        <span className="site-category-group">
          <CategoryIcon name={group.icon} size={15} />
          <span>{group.name}</span>
        </span>
        {workspaceLabel && (
          <span className="site-workspace-label">{workspaceLabel}</span>
        )}
      </div>} />

    </CardSurface>
  );
}

interface SiteCardDragPreviewProps {
  site: SiteItem;
  group: SiteGroup;
  overGroupTab?: boolean;
  batchCount?: number;
  showClickCount?: boolean;
}

export function SiteCardDragPreview({
  site,
  group,
  overGroupTab = false,
  batchCount = 1,
  showClickCount = false,
}: SiteCardDragPreviewProps) {
  return (
    <CardSurface
      className={`site-card-drag-preview ${
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
      <CardContent icon={<Favicon site={site} size="large" />} actions={<span className="drag-preview-grip">
          <DotsSixVertical size={20} weight="bold" />
        </span>} name={site.name} domain={getHostname(site.url)} external
        detail={<>{showClickCount && (
          <span className="site-click-count" aria-label={`访问次数 ${site.clickCount}`}>
            {site.clickCount}
          </span>
        )}</>} footer={<div className="site-category">
        <span className="site-category-group">
          <CategoryIcon name={group.icon} size={15} />
          <span>{group.name}</span>
        </span>
      </div>} />

    </CardSurface>
  );
}
