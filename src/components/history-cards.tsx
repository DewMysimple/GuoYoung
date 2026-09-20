import { useDraggable } from "@dnd-kit/core";
import { ClockCounterClockwise, Trash } from "@phosphor-icons/react";
import type { HistorySiteGroup } from "../lib/browser-history";
import type { BrowserHistoryItem } from "../lib/browser-runtime";
import { CardContent, CardOpenAction, CardSelectionToggle, CardSurface } from "./card-primitives";
import { formatCompactHistoryTime, formatHistoryTime, formatHistoryTitle, HistoryFavicon, type HistoryDragData, type HistoryUrlItem } from "./history-card-content";

function HistoryCardMeta({ item }: { item: Pick<BrowserHistoryItem, "lastVisitTime" | "visitCount"> }) {
  return <div className="site-category history-card-meta" title={`最近访问 ${formatHistoryTime(item.lastVisitTime)} · 访问 ${item.visitCount || 1} 次`}>
    <ClockCounterClockwise size={15} aria-hidden="true" />
    <time aria-label={`最近访问 ${formatHistoryTime(item.lastVisitTime)}`}
      dateTime={item.lastVisitTime ? new Date(item.lastVisitTime).toISOString() : undefined}>{formatCompactHistoryTime(item.lastVisitTime)}</time>
    <span className="visually-hidden">访问 {item.visitCount || 1} 次</span>
  </div>;
}

function useHistoryCardDrag(id: string, item: HistoryUrlItem | undefined, disabled: boolean) {
  const drag = useDraggable({ id, disabled: disabled || !item,
    data: item ? { kind: "history-card", item } satisfies HistoryDragData : undefined });
  return { drag, bindings: {
    ref: drag.setNodeRef,
    style: { zIndex: drag.isDragging ? 10 : undefined },
    onMouseDown: (event: React.MouseEvent<HTMLElement>) => { if (!disabled) drag.listeners?.onMouseDown?.(event); },
    onTouchStart: (event: React.TouchEvent<HTMLElement>) => { if (!disabled) drag.listeners?.onTouchStart?.(event); },
    onDragStart: (event: React.DragEvent) => event.preventDefault(),
  } };
}

export function HistoryDragPreview({ item }: { item: HistoryUrlItem }) {
  return <CardSurface className="site-card-drag-preview history-drag-preview" aria-hidden="true" data-testid="history-card-drag-preview">
    <CardContent icon={<HistoryFavicon item={item} size="large" />} name={formatHistoryTitle(item)} domain={item.url}
      footer={<HistoryCardMeta item={item} />} />
  </CardSurface>;
}

export function HistoryUrlCard({ item, selectionMode, selected, busy, onToggleSelected, onDelete }: {
  item: HistoryUrlItem; selectionMode: boolean; selected: boolean; busy: boolean;
  onToggleSelected: (shiftKey?: boolean) => void; onDelete: () => void;
}) {
  const title = formatHistoryTitle(item);
  const disabled = selectionMode || busy;
  const { drag, bindings } = useHistoryCardDrag(`history-url:${item.id}`, item, disabled);
  return <CardSurface {...bindings} data-history-dnd-id={item.id} data-drag-disabled={disabled || undefined}
    className={`history-url-card ${drag.isDragging ? "is-dragging" : ""} ${selectionMode ? "is-selection-mode" : ""} ${selected ? "is-selected" : ""}`}>
    {selectionMode && <CardSelectionToggle className="history-selection-toggle" selected={selected} disabled={busy}
      label={`${selected ? "取消选择" : "选择"} ${title}`} onToggle={onToggleSelected} />}
    <CardOpenAction href={item.url} label={`打开历史记录 ${title}`} className="history-url-link" disabled={busy}
      title={`${title} · 最近访问 ${formatHistoryTime(item.lastVisitTime)} · 访问 ${item.visitCount || 1} 次`}
      onSelect={selectionMode ? onToggleSelected : undefined} />
    <CardContent icon={<HistoryFavicon item={item} size="large" />} name={title} domain={item.url} external
      actions={<div className="card-actions history-url-actions"><button type="button" className="icon-button card-action danger-action"
        aria-label={`删除历史记录 ${title}`} disabled={disabled}
        onMouseDown={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()} onClick={onDelete}><Trash size={17} /></button></div>}
      footer={<HistoryCardMeta item={item} />} />
  </CardSurface>;
}

export function HistorySiteCard({ group, selectionMode, selectedUrls, busy, onOpen, onToggleGroupSelected }: {
  group: HistorySiteGroup; selectionMode: boolean; selectedUrls: Set<string>; busy: boolean;
  onOpen: () => void; onToggleGroupSelected: (shiftKey?: boolean) => void;
}) {
  const urls = group.items.flatMap((item) => item.url ? [item.url] : []);
  const count = urls.filter((url) => selectedUrls.has(url)).length;
  const selected = urls.length > 0 && count === urls.length;
  const item = group.items[0];
  const disabled = selectionMode || busy || !item?.url;
  const { drag, bindings } = useHistoryCardDrag(`history-site:${group.key}`, item?.url ? item as HistoryUrlItem : undefined, disabled);
  return <CardSurface {...bindings} data-history-dnd-id={group.key} data-drag-disabled={disabled || undefined}
    data-testid={`history-site-card-${group.key}`} data-history-site-key={group.key}
    className={`history-site-card ${drag.isDragging ? "is-dragging" : ""} ${selectionMode ? "is-selection-mode" : ""} ${count > 0 ? "is-selected" : ""}`}>
    {selectionMode && <CardSelectionToggle className="history-selection-toggle" selected={selected} indeterminate={count > 0 && !selected} disabled={busy}
      label={`${selected ? "取消选择" : "选择"} ${group.label} 的全部历史记录`} onToggle={onToggleGroupSelected} />}
    <CardOpenAction label={`查看 ${group.label} 历史记录`} className="history-site-open" disabled={busy} selected={selected}
      title={`${group.label} · ${group.items.length} 个页面 · 访问 ${group.visitCount} 次 · 最近访问 ${formatHistoryTime(group.lastVisitTime)}`}
      onSelect={selectionMode ? onToggleGroupSelected : undefined} onOpen={onOpen} />
    <CardContent icon={item ? <HistoryFavicon item={item} size="large" /> : <span className="history-favicon-fallback">?</span>}
      name={group.label} domain={group.hostname}
      actions={<span className="history-site-summary-actions"><span className="history-site-url-count" title={`${group.items.length} 个页面 · 访问 ${group.visitCount} 次`}>{group.items.length} 个页面</span></span>}
      footer={<HistoryCardMeta item={group} />} />
  </CardSurface>;
}
