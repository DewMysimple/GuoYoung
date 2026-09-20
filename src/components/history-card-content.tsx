import { Favicon } from "./favicon";
import type { BrowserHistoryItem } from "../lib/browser-runtime";
export type HistoryUrlItem = BrowserHistoryItem & { url: string };

export interface HistoryDragData {
  kind: "history-card";
  item: HistoryUrlItem;
}

export function readHistoryDragData(data: unknown): HistoryDragData | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as { kind?: unknown; item?: unknown };
  if (candidate.kind !== "history-card" || !candidate.item) return null;
  const item = candidate.item as Partial<HistoryUrlItem>;
  return typeof item.url === "string" && item.url
    ? { kind: "history-card", item: item as HistoryUrlItem }
    : null;
}

export function formatHistoryTitle(item: BrowserHistoryItem): string {
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

export function formatHistoryTime(timestamp?: number): string {
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

export function formatCompactHistoryTime(timestamp?: number): string {
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

export function HistoryFavicon({
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
