import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ClockCounterClockwise,
  MagnifyingGlass,
  Trash,
  X,
} from "@phosphor-icons/react";
import { Favicon } from "./favicon";
import { ConfirmDialog } from "./confirm-dialog";
import {
  deleteAllBrowserHistory,
  deleteBrowserHistoryRange,
  deleteBrowserHistoryUrl,
  getHistoryAvailability,
  getHistoryRange,
  readHistoryAvailability,
  searchBrowserHistory,
  subscribeToBrowserHistoryChanges,
  type BrowserHistoryAvailability,
  type BrowserHistoryPermissionResult,
  type HistoryTimeRange,
} from "../lib/browser-history";
import {
  getChromiumExtensionApi,
  type BrowserHistoryItem,
  type ChromiumExtensionApi,
} from "../lib/browser-runtime";
import { getHostname } from "../lib/site-utils";

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

const INITIAL_RENDER_LIMIT = 160;
const RENDER_INCREMENT = 160;

function formatHistoryTitle(item: BrowserHistoryItem): string {
  if (item.title?.trim()) return item.title.trim();
  if (item.url) {
    try {
      return getHostname(item.url);
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

function formatHistoryDay(timestamp?: number): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(timestamp);
}

function historyDayKey(timestamp?: number): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "unknown";
  }
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function HistoryFavicon({ item }: { item: BrowserHistoryItem }) {
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
    />
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
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_RENDER_LIMIT);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const loadSequence = useRef(0);

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
    setVisibleLimit(INITIAL_RENDER_LIMIT);
  }, [query, timeRange]);

  useEffect(() => {
    setSelectedUrls((current) => {
      const available = new Set(
        items.flatMap((item) => (item.url ? [item.url] : [])),
      );
      const next = new Set([...current].filter((url) => available.has(url)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const visibleItems = items.slice(0, visibleLimit);
  const groupedItems = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: BrowserHistoryItem[] }> = [];
    for (const item of visibleItems) {
      const key = historyDayKey(item.lastVisitTime);
      const existing = groups.at(-1);
      if (existing?.key === key) {
        existing.items.push(item);
      } else {
        groups.push({
          key,
          label: formatHistoryDay(item.lastVisitTime),
          items: [item],
        });
      }
    }
    return groups;
  }, [visibleItems]);

  const selectableItems = items.filter(
    (item): item is BrowserHistoryItem & { url: string } => Boolean(item.url),
  );
  const allSelected =
    selectableItems.length > 0 &&
    selectableItems.every((item) => selectedUrls.has(item.url));

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

  function toggleAll() {
    setSelectedUrls(
      allSelected
        ? new Set()
        : new Set(selectableItems.map((item) => item.url)),
    );
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

  async function clearCurrentRange() {
    if (busy || !items.length) return;
    setBusy(true);
    setError(null);
    try {
      if (query.trim()) {
        await Promise.all(
          selectableItems.map((item) => deleteBrowserHistoryUrl(item.url, api)),
        );
      } else if (timeRange === "all") {
        await deleteAllBrowserHistory(api);
      } else {
        await deleteBrowserHistoryRange(getHistoryRange(timeRange), api);
      }
      setSelectedUrls(new Set());
      setRefreshVersion((current) => current + 1);
    } catch {
      setError("清理历史记录失败，请稍后重试。");
    } finally {
      setBusy(false);
      setConfirmClear(false);
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
      <div className="history-page-header">
        <div>
          <p className="history-kicker">浏览器历史</p>
          <h1 id="history-title">历史记录</h1>
          <p className="history-summary">
            {loading ? "正在同步浏览器记录…" : `当前显示 ${items.length} 个网页`}
          </p>
        </div>
        <button type="button" className="button secondary-button" onClick={onBack}>
          <ArrowLeft size={17} />
          返回收藏
        </button>
      </div>

      <div className="history-toolbar">
        <label className="history-search">
          <MagnifyingGlass size={19} aria-hidden="true" />
          <span className="visually-hidden">搜索浏览历史</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题或网址"
            autoComplete="off"
          />
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
        </label>
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
      </div>

      {(selectedUrls.size > 0 || items.length > 0) && (
        <div className="history-selection-toolbar">
          <label className="history-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={busy || selectableItems.length === 0}
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
            <button
              type="button"
              className="button secondary-button history-danger-action"
              disabled={busy || items.length === 0}
              onClick={() => setConfirmClear(true)}
            >
              <Trash size={16} />
              {query.trim() ? "清理搜索结果" : timeRange === "all" ? "清空全部历史" : "清理当前范围"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="history-error" role="alert">
          <span>{error}</span>
          <button type="button" className="clear-search" aria-label="关闭错误提示" onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="history-list history-list-loading" aria-label="正在加载历史记录">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="history-skeleton-row" key={index} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="history-empty" role="status">
          <ClockCounterClockwise size={30} weight="thin" />
          <strong>{query.trim() ? "没有匹配的历史记录" : "还没有可显示的历史记录"}</strong>
          <span>{query.trim() ? "换个关键词或扩大时间范围试试。" : "浏览网页后，记录会自动出现在这里。"}</span>
        </div>
      ) : (
        <div className="history-list">
          {groupedItems.map((group) => (
            <section className="history-day" key={group.key} aria-labelledby={`history-day-${group.key}`}>
              <h2 id={`history-day-${group.key}`}>{group.label}</h2>
              <div className="history-day-items">
                {group.items.map((item) => {
                  if (!item.url) return null;
                  const title = formatHistoryTitle(item);
                  return (
                    <article className="history-row" key={`${item.id}-${item.url}`}>
                      <input
                        className="history-row-checkbox"
                        type="checkbox"
                        checked={selectedUrls.has(item.url)}
                        onChange={() => toggleSelected(item.url!)}
                        aria-label={`选择 ${title}`}
                        disabled={busy}
                      />
                      <HistoryFavicon item={item} />
                      <a
                        className="history-row-link"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`打开历史记录 ${title}`}
                      >
                        <strong title={title}>{title}</strong>
                        <span title={item.url}>{item.url}</span>
                      </a>
                      <div className="history-row-meta">
                        <time dateTime={item.lastVisitTime ? new Date(item.lastVisitTime).toISOString() : undefined}>
                          {formatHistoryTime(item.lastVisitTime)}
                        </time>
                        <span>{item.visitCount && item.visitCount > 1 ? `访问 ${item.visitCount} 次` : "访问 1 次"}</span>
                      </div>
                      <button
                        type="button"
                        className="history-row-delete"
                        aria-label={`删除历史记录 ${title}`}
                        disabled={busy}
                        onClick={() => void deleteUrls([item.url!])}
                      >
                        <Trash size={17} />
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
          {visibleLimit < items.length && (
            <button
              type="button"
              className="button secondary-button history-load-more"
              onClick={() => setVisibleLimit((current) => current + RENDER_INCREMENT)}
            >
              继续显示（还剩 {items.length - visibleLimit} 条）
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title={query.trim() ? "清理搜索结果" : timeRange === "all" ? "清空全部浏览历史" : "清理当前时间范围"}
        description={
          query.trim()
            ? `将从浏览器历史中删除当前搜索到的 ${items.length} 个网址及其全部访问记录。`
            : timeRange === "all"
              ? "这会删除当前浏览器配置文件中的全部历史记录，且无法恢复。"
              : `将删除当前时间范围内的 ${items.length} 个网页记录，且无法恢复。`
        }
        confirmLabel="确认清理"
        destructive
        onOpenChange={setConfirmClear}
        onConfirm={() => void clearCurrentRange()}
      />
    </section>
  );
}
