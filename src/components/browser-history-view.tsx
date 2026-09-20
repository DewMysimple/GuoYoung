import { useBrowserHistoryData } from "../hooks/use-browser-history-data";
import { HistoryRangeControl } from "./history-range-control";
import { HistoryDragPreview, HistoryUrlCard, HistorySiteCard } from "./history-cards";
import { HistoryFavicon, formatHistoryTime, readHistoryDragData, type HistoryUrlItem } from "./history-card-content";
import { CardSelectionToggle as HistorySelectionToggle } from "./card-primitives";
import { WorkspaceSearch } from "./workspace-search";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowLeft,
  CheckSquare,
  ClockCounterClockwise,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  groupBrowserHistoryItems,
  type BrowserHistoryPermissionResult,
  type HistorySiteGroup,
  type HistoryTimeRange,
} from "../lib/browser-history";
import {
  getChromiumExtensionApi,
  type BrowserHistoryItem,
  type ChromiumExtensionApi,
} from "../lib/browser-runtime";
import { getInclusiveSelectionRange } from "../lib/selection-range";

interface BrowserHistoryViewProps {
  onBack: () => void;
  onRequestPermission: () =>
    | Promise<BrowserHistoryPermissionResult>
    | BrowserHistoryPermissionResult
    | void;
  permissionError?: string | null;
  permissionVersion?: number;
  api?: ChromiumExtensionApi;
}

const INITIAL_GROUP_LIMIT = 80;
const GROUP_RENDER_INCREMENT = 80;

export function BrowserHistoryView({
  onBack,
  onRequestPermission,
  permissionError: externalPermissionError = null,
  permissionVersion = 0,
  api = getChromiumExtensionApi(),
}: BrowserHistoryViewProps) {
  const [query, setQuery] = useState("");
  const [timeRange, setTimeRange] = useState<HistoryTimeRange>("7d");
  const { availability, items, loading, busy, permissionLoading, permissionError, error, setError,
    refreshPermission, refresh, deleteUrls: removeUrls } = useBrowserHistoryData({ api, query, timeRange, permissionVersion,
      permissionError: externalPermissionError, onRequestPermission });
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [activeSiteKey, setActiveSiteKey] = useState<string | null>(null);
  const [visibleGroupLimit, setVisibleGroupLimit] =
    useState(INITIAL_GROUP_LIMIT);
  const overviewScrollY = useRef(0);
  const previousSiteKey = useRef(activeSiteKey);
  const selectionAnchorRef = useRef<string | null>(null);
  const historyDragClickSuppressedRef = useRef(false);
  const historyDragSuppressionTimer = useRef<number | null>(null);
  const [activeHistoryDrag, setActiveHistoryDrag] =
    useState<HistoryUrlItem | null>(null);
  const activeHistoryDragRef = useRef(activeHistoryDrag);
  activeHistoryDragRef.current = activeHistoryDrag;
  const [dragSessionKey, setDragSessionKey] = useState(0);
  const historySensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 50 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 50 } }),
  );

  function armHistoryDragClickSuppression() {
    historyDragClickSuppressedRef.current = true;
    if (historyDragSuppressionTimer.current !== null) {
      window.clearTimeout(historyDragSuppressionTimer.current);
    }
    historyDragSuppressionTimer.current = window.setTimeout(() => {
      historyDragClickSuppressedRef.current = false;
      historyDragSuppressionTimer.current = null;
    }, 220);
  }

  function handleHistoryDragStart(event: DragStartEvent) {
    const data = readHistoryDragData(event.active.data.current);
    if (!data) return;
    armHistoryDragClickSuppression();
    setActiveHistoryDrag(data.item);
  }

  function finishHistoryDrag(_event?: DragEndEvent) {
    setActiveHistoryDrag(null);
    armHistoryDragClickSuppression();
  }

  useEffect(() => {
    const cancel = () => {
      if (!activeHistoryDragRef.current) return;
      setActiveHistoryDrag(null);
      setDragSessionKey((current) => current + 1);
      armHistoryDragClickSuppression();
    };
    const visibility = () => { if (document.visibilityState === "hidden") cancel(); };
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("pointercancel", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("pointercancel", cancel);
      document.removeEventListener("visibilitychange", visibility);
      if (historyDragSuppressionTimer.current !== null) {
        window.clearTimeout(historyDragSuppressionTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    if (!activeSiteKey) return;

    window.history.pushState(
      { ...(window.history.state ?? {}), siteHubLayer: "history-detail" },
      "",
      window.location.href,
    );
    const handlePopState = () => {
      setActiveSiteKey(null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeSiteKey]);

  useLayoutEffect(() => {
    if (previousSiteKey.current === activeSiteKey) return;
    previousSiteKey.current = activeSiteKey;
    window.scrollTo({ top: activeSiteKey ? 0 : overviewScrollY.current, behavior: "instant" });
  }, [activeSiteKey]);

  useEffect(() => {
    if (!selectionMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      setSelectionMode(false);
      setSelectedUrls(new Set());
      selectionAnchorRef.current = null;
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode, busy]);

  useEffect(() => {
    setVisibleGroupLimit(INITIAL_GROUP_LIMIT);
    if (activeSiteKey && window.history.state?.siteHubLayer === "history-detail") {
      window.history.replaceState(
        { ...(window.history.state ?? {}), siteHubLayer: "browser-history" },
        "",
        window.location.href,
      );
    }
    setActiveSiteKey(null);
    setSelectedUrls(new Set());
    setSelectionMode(false);
    selectionAnchorRef.current = null;
  }, [query, timeRange]);

  useEffect(() => {
    selectionAnchorRef.current = null;
  }, [activeSiteKey]);

  const siteGroups = useMemo(() => groupBrowserHistoryItems(items), [items]);
  const visibleGroups = siteGroups.slice(0, visibleGroupLimit);

  const activeSiteGroup = activeSiteKey
    ? siteGroups.find((group) => group.key === activeSiteKey) ?? null
    : null;

  useEffect(() => {
    if (activeSiteKey && !activeSiteGroup) {
      setActiveSiteKey(null);
    }
  }, [activeSiteGroup, activeSiteKey]);

  useEffect(() => {
    setSelectedUrls((current) => {
      const available = new Set(
        items.flatMap((item) => (item.url ? [item.url] : [])),
      );
      const next = new Set([...current].filter((url) => available.has(url)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const selectableItems = items.filter(
    (item): item is BrowserHistoryItem & { url: string } => Boolean(item.url),
  );
  const selectableItemsInView = activeSiteGroup
    ? activeSiteGroup.items.filter(
        (item): item is BrowserHistoryItem & { url: string } => Boolean(item.url),
      )
    : selectableItems;
  const allSelected =
    selectableItemsInView.length > 0 &&
    selectableItemsInView.every((item) => selectedUrls.has(item.url));

  function toggleSelected(url: string, shiftKey = false) {
    const orderedUrls = selectableItemsInView.map((item) => item.url);
    const anchorUrl = selectionAnchorRef.current;
    const canSelectRange =
      shiftKey && Boolean(anchorUrl && orderedUrls.includes(anchorUrl));
    const range = canSelectRange
      ? getInclusiveSelectionRange(orderedUrls, anchorUrl, url)
      : [];
    setSelectedUrls((current) => {
      const next = new Set(current);
      if (canSelectRange) range.forEach((itemUrl) => next.add(itemUrl));
      else if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
    if (!canSelectRange) selectionAnchorRef.current = url;
  }

  function toggleGroupSelected(group: HistorySiteGroup, shiftKey = false) {
    const groupUrls = group.items.flatMap((item) =>
      item.url ? [item.url] : [],
    );
    const orderedGroups = visibleGroups.map((item) => item.key);
    const anchorGroupKey = selectionAnchorRef.current;
    const canSelectRange =
      shiftKey &&
      Boolean(anchorGroupKey && orderedGroups.includes(anchorGroupKey));
    const groupRange = canSelectRange
      ? getInclusiveSelectionRange(orderedGroups, anchorGroupKey, group.key)
      : [];
    setSelectedUrls((current) => {
      const next = new Set(current);
      if (canSelectRange) {
        groupRange.forEach((groupKey) => {
          const rangeGroup = visibleGroups.find((item) => item.key === groupKey);
          rangeGroup?.items.forEach((item) => {
            if (item.url) next.add(item.url);
          });
        });
      } else {
        const shouldDeselect = groupUrls.every((url) => next.has(url));
        groupUrls.forEach((url) => {
          if (shouldDeselect) next.delete(url);
          else next.add(url);
        });
      }
      return next;
    });
    if (!canSelectRange) selectionAnchorRef.current = group.key;
  }

  function toggleAll() {
    setSelectedUrls(
      allSelected
        ? new Set()
        : new Set(selectableItemsInView.map((item) => item.url)),
    );
    selectionAnchorRef.current = null;
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      if (current) setSelectedUrls(new Set());
      selectionAnchorRef.current = null;
      return !current;
    });
  }

  function returnToHistoryOverview() {
    if (window.history.state?.siteHubLayer === "history-detail") {
      window.history.back();
      return;
    }
    setActiveSiteKey(null);
  }

  async function deleteUrls(urls: string[]) {
    const deleted = await removeUrls(urls);
    setSelectedUrls((current) => new Set([...current].filter((url) => !deleted.includes(url))));
  }

  if (availability === "unsupported") {
    return (
      <section className="history-state-panel" aria-labelledby="history-title">
        <div className="history-state-icon" aria-hidden="true">
          <ClockCounterClockwise size={28} weight="regular" />
        </div>
        <p className="history-kicker">浏览器历史</p>
        <h1 id="history-title">历史记录仅在扩展版可用</h1>
        <p>网页预览版无法读取当前浏览器的访问记录。安装 Mysimple 扩展后即可使用。</p>
        <button type="button" className="button secondary-button" onClick={onBack}>
          <ArrowLeft size={17} />
          返回收藏
        </button>
      </section>
    );
  }

  if (availability === "permission-needed") {
    return (
      <section className="history-state-panel" aria-labelledby="history-title">
        <div className="history-state-icon" aria-hidden="true">
          <ClockCounterClockwise size={28} weight="regular" />
        </div>
        <p className="history-kicker">浏览器历史</p>
        <h1 id="history-title">启用浏览器历史记录</h1>
        <p>
          为了在 Mysimple 中查询和管理历史记录，需要获得浏览器的历史权限。历史数据不会写入 Mysimple 收藏或上传到网络。
        </p>
        {permissionError && (
          <p className="history-permission-error" role="alert">
            {permissionError}
          </p>
        )}
        <div className="history-state-actions">
          <button
            type="button"
            className="button primary-button"
            disabled={permissionLoading}
            onClick={() => void refreshPermission()}
          >
            <ClockCounterClockwise size={17} />
            {permissionLoading ? "正在请求权限…" : "允许读取历史记录"}
          </button>
          <button type="button" className="button secondary-button" onClick={onBack}>
            返回收藏
          </button>
        </div>
      </section>
    );
  }

  return (
    <DndContext
      key={dragSessionKey}
      sensors={historySensors}
      autoScroll={false}
      onDragStart={handleHistoryDragStart}
      onDragEnd={finishHistoryDrag}
      onDragCancel={() => finishHistoryDrag()}
    >
      <section
        className="browser-history"
        aria-labelledby="history-title"
        onClickCapture={(event) => {
          if (!historyDragClickSuppressedRef.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
      <h1 id="history-title" className="visually-hidden">历史记录</h1>
      <WorkspaceSearch value={query} onChange={setQuery} label="搜索浏览历史" placeholder="搜索标题或网址" clearLabel="清空历史搜索" />

      <div className="history-toolbar">
        {activeSiteGroup && (
          <button
            type="button"
            className="view-control-button"
            onClick={returnToHistoryOverview}
          >
            <ArrowLeft size={16} />返回历史记录
          </button>
        )}
        <p className="history-summary" role="status">
          {loading
            ? "正在同步浏览器记录…"
            : activeSiteGroup
              ? `${activeSiteGroup.items.length} 个网页 · 访问 ${activeSiteGroup.visitCount} 次`
              : `${siteGroups.length} 个网站 · ${items.length} 个网页`}
        </p>
        <HistoryRangeControl value={timeRange} onChange={setTimeRange} />
        <button
          type="button"
          className={`view-control-button multi-select-button ${
            selectionMode ? "active" : ""
          }`}
          aria-pressed={selectionMode}
          disabled={loading || busy || selectableItemsInView.length === 0}
          onClick={toggleSelectionMode}
        >
          <CheckSquare size={16} />
          <span>
            {selectionMode
              ? selectedUrls.size > 0
                ? `完成 ${selectedUrls.size}`
                : "选择"
              : "多选"}
          </span>
        </button>
      </div>

      {selectionMode && (
        <div
          className="history-selection-toolbar"
        >
          <label className="history-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={busy || selectableItemsInView.length === 0}
            />
            <span>{selectedUrls.size ? `已选择 ${selectedUrls.size} 条` : "全选当前结果"}</span>
          </label>
          <div className="history-selection-actions">
            {selectedUrls.size > 0 && (
              <button
                type="button"
                className="button secondary-button history-danger-action"
                disabled={busy}
                onClick={() => void deleteUrls([...selectedUrls])}
              >
                <Trash size={16} />
                删除选中
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="history-error" role="alert">
          <span>{error}</span>
          <button type="button" className="view-control-button" disabled={loading || busy} onClick={() => refresh()}>重新读取</button>
          <button type="button" className="clear-search" aria-label="关闭错误提示" onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="site-grid history-list-loading" aria-label="正在加载历史记录">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="history-skeleton-card" key={index} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="history-empty" role="status">
          <ClockCounterClockwise size={30} weight="thin" />
          <strong>{error ? "历史记录读取失败" : query.trim() ? "没有匹配的历史记录" : "还没有可显示的历史记录"}</strong>
          <span>{error ? "点击重新读取，再试一次。" : query.trim() ? "换个关键词或扩大时间范围试试。" : "浏览网页后，记录会自动出现在这里。"}</span>
        </div>
      ) : activeSiteGroup ? (
        <div
          className="history-site-detail"
          data-testid={`history-site-detail-${activeSiteGroup.key}`}
        >
          <div className="history-detail-summary">
            {selectionMode && (
              <HistorySelectionToggle
                selected={activeSiteGroup.items
                  .filter((item) => Boolean(item.url))
                  .every((item) => selectedUrls.has(item.url!))}
                indeterminate={
                  activeSiteGroup.items.some(
                    (item) => item.url && selectedUrls.has(item.url),
                  ) &&
                  !activeSiteGroup.items
                    .filter((item) => Boolean(item.url))
                    .every((item) => selectedUrls.has(item.url!))
                }
                label={`选择 ${activeSiteGroup.label} 的全部历史记录`}
                disabled={busy}
                onToggle={(shiftKey) =>
                  toggleGroupSelected(activeSiteGroup, shiftKey)
                }
              />
            )}
            <span className="history-detail-icon">
              {activeSiteGroup.items[0] ? (
                <HistoryFavicon item={activeSiteGroup.items[0]} size="large" />
              ) : (
                <span className="history-favicon-fallback">?</span>
              )}
            </span>
            <div className="history-detail-site-info">
              <strong>{activeSiteGroup.label}</strong>
              <span>{activeSiteGroup.hostname}</span>
            </div>
            <div className="history-detail-meta">
              <span>{activeSiteGroup.items.length} 个页面</span>
              <span>最近访问 {formatHistoryTime(activeSiteGroup.lastVisitTime)}</span>
            </div>
          </div>
          <div className="site-grid history-url-grid">
            {activeSiteGroup.items.map((item) => {
              if (!item.url) return null;
              const url = item.url;
              return (
                <HistoryUrlCard
                  key={`${item.id}-${url}`}
                  item={{ ...item, url }}
                  selectionMode={selectionMode}
                  selected={selectedUrls.has(url)}
                  busy={busy}
                  onToggleSelected={(shiftKey) => toggleSelected(url, shiftKey)}
                  onDelete={() => void deleteUrls([url])}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="history-list">
          <div className="site-grid history-site-grid">
            {visibleGroups.map((group) => (
              <HistorySiteCard
                key={group.key}
                group={group}
                selectionMode={selectionMode}
                selectedUrls={selectedUrls}
                busy={busy}
                onOpen={() => {
                  overviewScrollY.current = window.scrollY;
                  setActiveSiteKey(group.key);
                }}
                onToggleGroupSelected={(shiftKey) =>
                  toggleGroupSelected(group, shiftKey)
                }
              />
            ))}
          </div>
          {visibleGroupLimit < siteGroups.length && (
            <button
              type="button"
              className="button secondary-button history-load-more"
              onClick={() => setVisibleGroupLimit((current) => current + GROUP_RENDER_INCREMENT)}
            >
              继续显示（还剩 {siteGroups.length - visibleGroupLimit} 个网站）
            </button>
          )}
        </div>
      )}
      </section>
      <DragOverlay
        adjustScale={false}
        dropAnimation={null}
        zIndex={90}
      >
        {activeHistoryDrag ? <HistoryDragPreview item={activeHistoryDrag} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
