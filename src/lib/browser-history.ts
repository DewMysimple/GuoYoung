import {
  getChromiumExtensionApi,
  isExtensionEnvironment,
  type BrowserHistoryItem,
  type BrowserHistoryQuery,
  type ChromiumExtensionApi,
} from "./browser-runtime";

export const HISTORY_PERMISSION = "history";
export const HISTORY_INVALIDATED_MESSAGE = "browser-history-invalidated";

export type HistoryTimeRange = "all" | "today" | "yesterday" | "7d" | "30d";

export type BrowserHistoryAvailability =
  | "unsupported"
  | "permission-needed"
  | "granted";

export interface HistoryRange {
  startTime: number;
  endTime: number;
}

export interface BrowserHistorySearchOptions {
  text: string;
  range: HistoryTimeRange;
  now?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function getHistoryRange(
  range: HistoryTimeRange,
  now = Date.now(),
): HistoryRange {
  const today = startOfLocalDay(now);
  if (range === "today") {
    return { startTime: today, endTime: now };
  }
  if (range === "yesterday") {
    return { startTime: today - DAY_MS, endTime: today };
  }
  if (range === "7d") {
    return { startTime: now - 7 * DAY_MS, endTime: now };
  }
  if (range === "30d") {
    return { startTime: now - 30 * DAY_MS, endTime: now };
  }
  return { startTime: 0, endTime: now };
}

export function isHistoryInvalidationMessage(message: unknown): boolean {
  return message === HISTORY_INVALIDATED_MESSAGE;
}

export function normalizeHistoryItems(
  items: BrowserHistoryItem[],
): BrowserHistoryItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => typeof item.url === "string" && item.url.length > 0)
    .filter((item) => {
      if (seen.has(item.url!)) return false;
      seen.add(item.url!);
      return true;
    })
    .sort(
      (first, second) =>
        (second.lastVisitTime ?? 0) - (first.lastVisitTime ?? 0),
    );
}

export function getHistoryAvailability(
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): BrowserHistoryAvailability {
  if (!api || !isExtensionEnvironment(api)) return "unsupported";
  if (api.permissions?.contains) return "permission-needed";
  if (api.history) return "granted";
  return "permission-needed";
}

export async function readHistoryAvailability(
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): Promise<BrowserHistoryAvailability> {
  const initial = getHistoryAvailability(api);
  if (initial !== "permission-needed") return initial;
  if (!api?.permissions?.contains) return "unsupported";
  try {
    return (await api.permissions.contains({ permissions: [HISTORY_PERMISSION] }))
      ? "granted"
      : "permission-needed";
  } catch {
    return "permission-needed";
  }
}

export async function requestHistoryPermission(
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): Promise<boolean> {
  if (!api || !isExtensionEnvironment(api)) return false;
  if (!api.permissions?.request) return Boolean(api.history);
  try {
    return await api.permissions.request({ permissions: [HISTORY_PERMISSION] });
  } catch {
    return false;
  }
}

export function createHistoryQuery(
  options: BrowserHistorySearchOptions,
): BrowserHistoryQuery {
  const now = options.now ?? Date.now();
  const { startTime, endTime } = getHistoryRange(options.range, now);
  return {
    text: options.text.trim(),
    startTime,
    endTime,
    maxResults: 0,
  };
}

export async function searchBrowserHistory(
  options: BrowserHistorySearchOptions,
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): Promise<BrowserHistoryItem[]> {
  if (!api?.history) throw new Error("Browser history is unavailable");
  const items = await api.history.search(createHistoryQuery(options));
  return normalizeHistoryItems(items);
}

export async function deleteBrowserHistoryUrl(
  url: string,
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): Promise<void> {
  if (!api?.history) throw new Error("Browser history is unavailable");
  await api.history.deleteUrl({ url });
}

export async function deleteBrowserHistoryRange(
  range: HistoryRange,
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): Promise<void> {
  if (!api?.history) throw new Error("Browser history is unavailable");
  await api.history.deleteRange(range);
}

export async function deleteAllBrowserHistory(
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): Promise<void> {
  if (!api?.history) throw new Error("Browser history is unavailable");
  await api.history.deleteAll();
}

export function subscribeToBrowserHistoryChanges(
  listener: () => void,
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): () => void {
  const runtime = api?.runtime?.onMessage;
  const handleMessage = (message: unknown) => {
    if (isHistoryInvalidationMessage(message)) listener();
  };
  runtime?.addListener(handleMessage);

  const history = api?.history;
  const handleVisited = () => listener();
  const handleVisitRemoved = () => listener();
  history?.onVisited?.addListener(handleVisited);
  history?.onVisitRemoved?.addListener(handleVisitRemoved);

  return () => {
    runtime?.removeListener(handleMessage);
    history?.onVisited?.removeListener(handleVisited);
    history?.onVisitRemoved?.removeListener(handleVisitRemoved);
  };
}
