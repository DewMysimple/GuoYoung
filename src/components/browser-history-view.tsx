import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckSquare,
  ClockCounterClockwise,
  MagnifyingGlass,
  Minus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { Favicon } from "./favicon";
import {
  deleteBrowserHistoryUrl,
  getHistoryAvailability,
  groupBrowserHistoryItems,
  readHistoryAvailability,
  searchBrowserHistory,
  subscribeToBrowserHistoryChanges,
  type BrowserHistoryAvailability,
  type BrowserHistoryPermissionResult,
  type HistorySiteGroup,
  type HistoryTimeRange,
} from "../lib/browser-history";
import {
  getChromiumExtensionApi,
  type BrowserHistoryItem,
  type ChromiumExtensionApi,
} from "../lib/browser-runtime";

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

const TIME_RANGE_OPTIONS: Array<{ value: HistoryTimeRange; label: string }> = [
  { value: "all", label: "全部历史" },
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];

const INITIAL_GROUP_LIMIT = 80;
const GROUP_RENDER_INCREMENT = 80;

function formatHistoryTitle(item: BrowserHistoryItem): string {
  if (item.title?.trim()) return item.title.trim();
  if (item.url) {
    try {
      return new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      return item.url;
    }
  }
  return "未命名页面";
}

function formatHistoryTime(timestamp?: number): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatCompactHistoryTime(timestamp?: number): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    ...(new Date(timestamp).getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" as const }
      : {}),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function HistoryFavicon({
  item,
  size = "normal",
}: {
  item: BrowserHistoryItem;
  size?: "normal" | "large";
}) {
  const name = formatHistoryTitle(item);
  if (!item.url) {
    return <span className="history-favicon-fallback">?</span>;
  }
  return (
    <Favicon
      site={{
        name,
        url: item.url,
        customIconUrl: undefined,
        iconSource: "browser",
      }}
      size={size}
    />
  );
}

function HistorySelectionToggle({
  selected,
  indeterminate = false,
  label,
  disabled,
  onToggle,
}: {
  selected: boolean;
  indeterminate?: boolean;
  label: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="history-selection-toggle"
      aria-label={label}
      aria-pressed={selected}
      data-indeterminate={indeterminate || undefined}
      disabled={disabled}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {indeterminate ? <Minus size={14} weight="bold" /> : selected ? <Check size={14} weight="bold" /> : null}
    </button>
  );
}

function HistoryUrlCard({
  item,
  selectionMode,
  selected,
  busy,
  onToggleSelected,
  onDelete,
}: {
  item: BrowserHistoryItem & { url: string };
  selectionMode: boolean;
  selected: boolean;
  busy: boolean;
  onToggleSelected: () => void;
  onDelete: () => void;
}) {
  const title = formatHistoryTitle(item);

  return (
    <article className={`site-card history-url-card ${selectionMode ? "is-selection-mode" : ""} ${selected ? "is-selected" : ""}`} data-drag-disabled>
      {selectionMode && (
        <HistorySelectionToggle
          selected={selected}
          label={`${selected ? "取消选择" : "选择"} ${title}`}
          disabled={busy}
          onToggle={onToggleSelected}
        />
      )}
      <div className="site-card-topline">
        <HistoryFavicon item={item} size="large" />
        <button
          type="button"
          className="history-url-delete"
          aria-label={`删除历史记录 ${title}`}
          disabled={busy || selectionMode}
          onClick={onDelete}
        >
          <Trash size={17} />
        </button>
      </div>
      <a
        className="site-card-full-link history-url-link"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`打开历史记录 ${title}`}
        title={`${title} · 最近访问 ${formatHistoryTime(item.lastVisitTime)} · 访问 ${item.visitCount || 1} 次`}
        onClick={(event) => {
          if (selectionMode || busy) event.preventDefault();
          if (selectionMode && !busy) onToggleSelected();
        }}
      />
      <div className="site-card-link">
        <span className="site-name" title={title}>{title}</span>
        <span className="site-domain" title={item.url}>{item.url}</span>
      </div>
      <div className="site-category history-card-meta" title={`最近访问 ${formatHistoryTime(item.lastVisitTime)} · 访问 ${item.visitCount || 1} 次`}>
        <ClockCounterClockwise size={15} aria-hidden="true" />
        <time
          aria-label={`最近访问 ${formatHistoryTime(item.lastVisitTime)}`}
          dateTime={
            item.lastVisitTime
              ? new Date(item.lastVisitTime).toISOString()
              : undefined
          }
        >
          {formatCompactHistoryTime(item.lastVisitTime)}
        </time>
        <span className="visually-hidden">访问 {item.visitCount && item.visitCount > 1 ? item.visitCount : 1} 次</span>
      </div>
    </article>
  );
}

function HistorySiteCard({
  group,
  selectionMode,
  selectedUrls,
  busy,
  onOpen,
  onToggleGroupSelected,
}: {
  group: HistorySiteGroup;
  selectionMode: boolean;
  selectedUrls: Set<string>;
  busy: boolean;
  onOpen: () => void;
  onToggleGroupSelected: () => void;
}) {
  const groupUrls = group.items.flatMap((item) =>
    item.url ? [item.url] : [],
  );
  const selectedCount = groupUrls.filter((url) => selectedUrls.has(url)).length;
  const allSelected = groupUrls.length > 0 && selectedCount === groupUrls.length;

  const representative = group.items[0];

  return (
    <article
      className={`site-card history-site-card ${selectionMode ? "is-selection-mode" : ""} ${selectedCount > 0 ? "is-selected" : ""}`}
      data-drag-disabled
      data-testid={`history-site-card-${group.key}`}
      data-history-site-key={group.key}
    >
      <div className="history-site-card-summary">
        {selectionMode && (
          <HistorySelectionToggle
            selected={allSelected}
            indeterminate={selectedCount > 0 && !allSelected}
            label={`${allSelected ? "取消选择" : "选择"} ${group.label} 的全部历史记录`}
            disabled={busy}
            onToggle={onToggleGroupSelected}
          />
        )}
        <button
          type="button"
          className="site-card-full-link history-site-open"
          aria-label={`查看 ${group.label} 历史记录`}
          title={`${group.label} · ${group.items.length} 个页面 · 访问 ${group.visitCount} 次 · 最近访问 ${formatHistoryTime(group.lastVisitTime)}`}
          aria-pressed={selectionMode ? allSelected : undefined}
          disabled={busy}
          onClick={selectionMode ? onToggleGroupSelected : onOpen}
        />
          <div className="site-card-topline">
            <span className="history-site-icon">
              {representative ? (
                <HistoryFavicon item={representative} size="large" />
              ) : (
                <span className="history-favicon-fallback">?</span>
              )}
            </span>
            <span className="history-site-summary-actions">
              <span className="history-site-url-count" title={`${group.items.length} 个页面 · 访问 ${group.visitCount} 次`}>
                {group.items.length} 个页面
              </span>
            </span>
          </div>
          <div className="site-card-link">
            <span className="site-name-row">
              <span className="site-name" title={group.label}>{group.label}</span>
            </span>
            <span className="site-domain" title={group.hostname}>
              {group.hostname}
            </span>
          </div>
          <div className="site-category history-card-meta" title={`最近访问 ${formatHistoryTime(group.lastVisitTime)} · 访问 ${group.visitCount} 次`}>
            <ClockCounterClockwise size={15} aria-hidden="true" />
            <time aria-label={`最近访问 ${formatHistoryTime(group.lastVisitTime)}`}>
              {formatCompactHistoryTime(group.lastVisitTime)}
            </time>
          </div>
      </div>
    </article>
  );
}

export function BrowserHistoryView({
  onBack,
  onRequestPermission,
  permissionError: externalPermissionError = null,
  permissionVersion = 0,
  api = getChromiumExtensionApi(),
}: BrowserHistoryViewProps) {
  const [availability, setAvailability] = useState<BrowserHistoryAvailability>(
    () => getHistoryAvailability(api),
  );
  const [items, setItems] = useState<BrowserHistoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [timeRange, setTimeRange] = useState<HistoryTimeRange>("all");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(
    externalPermissionError,
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [activeSiteKey, setActiveSiteKey] = useState<string | null>(null);
  const [visibleGroupLimit, setVisibleGroupLimit] =
    useState(INITIAL_GROUP_LIMIT);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const loadSequence = useRef(0);
  const overviewScrollY = useRef(0);
  const previousSiteKey = useRef(activeSiteKey);

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
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode, busy]);

  useEffect(() => {
    let active = true;
    void readHistoryAvailability(api).then((next) => {
      if (active) setAvailability(next);
    });
    return () => {
      active = false;
    };
  }, [api, permissionVersion]);

  useEffect(() => {
    setPermissionError(externalPermissionError);
  }, [externalPermissionError]);

  useEffect(() => {
    if (availability !== "granted") return;
    const refresh = () => setRefreshVersion((current) => current + 1);
    const removeMessageListener = subscribeToBrowserHistoryChanges(refresh, api);
    const handleFocus = () => refresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      removeMessageListener();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [api, availability]);

  useEffect(() => {
    if (availability !== "granted") return;
    let active = true;
    const sequence = ++loadSequence.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchBrowserHistory(
        { text: query, range: timeRange },
        api,
      ).then(
        (nextItems) => {
          if (!active || sequence !== loadSequence.current) return;
          setItems(nextItems);
          setLoading(false);
        },
        () => {
          if (!active || sequence !== loadSequence.current) return;
          setItems([]);
          setLoading(false);
          setError("无法读取浏览器历史记录，请稍后重试。");
        },
      );
    }, 160);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, availability, query, refreshVersion, timeRange]);

  useEffect(() => {
    setVisibleGroupLimit(INITIAL_GROUP_LIMIT);
    setActiveSiteKey(null);
    setSelectedUrls(new Set());
    setSelectionMode(false);
  }, [query, timeRange]);

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

  async function refreshPermission() {
    if (permissionLoading) return;
    setPermissionLoading(true);
    setPermissionError(null);
    try {
      const result = await onRequestPermission();
      const nextAvailability = await readHistoryAvailability(api);
      setAvailability(nextAvailability);
      if (nextAvailability === "granted") {
        setPermissionError(null);
      } else if (result && !result.granted) {
        setPermissionError(
          result.error ?? "浏览器未完成历史记录授权，请检查扩展权限后重试。",
        );
      }
    } catch {
      setPermissionError("浏览器未完成历史记录授权，请检查扩展权限后重试。");
    } finally {
      setPermissionLoading(false);
    }
  }

  function toggleSelected(url: string) {
    setSelectedUrls((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleGroupSelected(group: HistorySiteGroup) {
    const groupUrls = group.items.flatMap((item) =>
      item.url ? [item.url] : [],
    );
    setSelectedUrls((current) => {
      const next = new Set(current);
      const shouldDeselect = groupUrls.every((url) => next.has(url));
      groupUrls.forEach((url) => {
        if (shouldDeselect) next.delete(url);
        else next.add(url);
      });
      return next;
    });
  }

  function toggleAll() {
    setSelectedUrls(
      allSelected
        ? new Set()
        : new Set(selectableItemsInView.map((item) => item.url)),
    );
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      if (current) setSelectedUrls(new Set());
      return !current;
    });
  }

  async function deleteUrls(urls: string[]) {
    const uniqueUrls = [...new Set(urls)];
    if (!uniqueUrls.length || busy) return;
    setBusy(true);
    setError(null);
    const results = await Promise.allSettled(
      uniqueUrls.map((url) => deleteBrowserHistoryUrl(url, api)),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    const deleted = uniqueUrls.length - failed;
    setSelectedUrls((current) => {
      const next = new Set(current);
      uniqueUrls.forEach((url) => next.delete(url));
      return next;
    });
    setBusy(false);
    setRefreshVersion((current) => current + 1);
    if (failed > 0) {
      setError(`已删除 ${deleted} 条，${failed} 条删除失败，请稍后重试。`);
    }
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
    <section className="browser-history" aria-labelledby="history-title">
      <h1 id="history-title" className="visually-hidden">历史记录</h1>
      <div className="workspace-intro history-workspace-intro">
        <div className="search-panel">
          <form
            className="search-input"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <MagnifyingGlass size={21} aria-hidden="true" />
            <span className="visually-hidden">搜索浏览历史</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题或网址"
              autoComplete="off"
              aria-label="搜索浏览历史"
            />
            <span className="search-trailing-actions">
              {query && (
                <button
                  type="button"
                  className="clear-search"
                  aria-label="清空历史搜索"
                  onClick={() => setQuery("")}
                >
                  <X size={16} />
                </button>
              )}
            </span>
          </form>
        </div>
      </div>

      <div className="history-toolbar">
        {activeSiteGroup && (
          <button type="button" className="view-control-button" onClick={() => setActiveSiteKey(null)}>
            <ArrowLeft size={16} />返回历史记录
          </button>
        )}
        <p className="history-summary" role="status">
          {loading ? "正在同步浏览器记录…" : activeSiteGroup
            ? `${activeSiteGroup.items.length} 个网页 · 访问 ${activeSiteGroup.visitCount} 次`
            : `${siteGroups.length} 个网站 · ${items.length} 个网页`}
        </p>
        <label className="history-range-select">
          <span>时间范围</span>
          <select
            aria-label="历史记录时间范围"
            value={timeRange}
            onChange={(event) => setTimeRange(event.target.value as HistoryTimeRange)}
          >
            {TIME_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
          <button type="button" className="view-control-button" disabled={loading || busy} onClick={() => setRefreshVersion((current) => current + 1)}>重新读取</button>
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
                onToggle={() => toggleGroupSelected(activeSiteGroup)}
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
                  onToggleSelected={() => toggleSelected(url)}
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
                onToggleGroupSelected={() => toggleGroupSelected(group)}
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
  );
}
