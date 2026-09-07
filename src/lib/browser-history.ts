import {
  getChromiumExtensionApi,
  isExtensionEnvironment,
  type BrowserApiResult,
  type BrowserHistoryItem,
  type BrowserHistoryQuery,
  type ChromiumExtensionApi,
} from "./browser-runtime";
import { getHostname, inferSiteName } from "./site-utils";

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

export interface BrowserHistoryPermissionResult {
  granted: boolean;
  error?: string;
}

export interface HistorySiteGroup {
  key: string;
  label: string;
  hostname: string;
  items: BrowserHistoryItem[];
  lastVisitTime?: number;
  visitCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const HISTORY_TWO_PART_SUFFIXES = new Set([
  "co.uk",
  "com.au",
  "com.cn",
  "com.jp",
  "co.jp",
  "co.kr",
]);

const HISTORY_BRAND_LABELS: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
};

function getHistoryHostname(url: string): string {
  return getHostname(url).toLocaleLowerCase("en-US");
}

export function getHistorySiteKey(url: string): string {
  const hostname = getHistoryHostname(url);
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;

  const suffix = parts.slice(-2).join(".");
  return HISTORY_TWO_PART_SUFFIXES.has(suffix)
    ? parts.slice(-3).join(".")
    : parts.slice(-2).join(".");
}

function getHistorySiteLabel(key: string): string {
  return (
    HISTORY_BRAND_LABELS[key] ??
    inferSiteName(`https://${key}`) ??
    key
  );
}

export function groupBrowserHistoryItems(
  items: BrowserHistoryItem[],
): HistorySiteGroup[] {
  const grouped = new Map<string, HistorySiteGroup>();

  for (const item of items) {
    if (!item.url) continue;
    let key: string;
    let hostname: string;
    try {
      hostname = getHistoryHostname(item.url);
      key = getHistorySiteKey(item.url);
    } catch {
      key = item.url;
      hostname = item.url;
    }

    const current = grouped.get(key);
    if (current) {
      current.items.push(item);
      current.visitCount += Math.max(1, item.visitCount ?? 1);
      if ((item.lastVisitTime ?? 0) > (current.lastVisitTime ?? 0)) {
        current.lastVisitTime = item.lastVisitTime;
      }
      continue;
    }

    grouped.set(key, {
      key,
      label: getHistorySiteLabel(key),
      hostname,
      items: [item],
      lastVisitTime: item.lastVisitTime,
      visitCount: Math.max(1, item.visitCount ?? 1),
    });
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort(
        (first, second) =>
          (second.lastVisitTime ?? 0) - (first.lastVisitTime ?? 0),
      ),
    }))
    .sort(
      (first, second) =>
        (second.lastVisitTime ?? 0) - (first.lastVisitTime ?? 0),
    );
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getRuntimeError(api: ChromiumExtensionApi | undefined): string | undefined {
  return api?.runtime?.lastError?.message;
}

function isPromiseLike<T>(value: BrowserApiResult<T>): value is PromiseLike<T> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "then" in value &&
      typeof (value as { then?: unknown }).then === "function",
  );
}

function callBrowserApi<T>(
  api: ChromiumExtensionApi | undefined,
  invoke: (callback: (value?: T) => void) => BrowserApiResult<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error("Browser API call failed"));
    };
    const complete = (value?: T) => {
      if (settled) return;
      settled = true;
      const runtimeError = getRuntimeError(api);
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }
      resolve(value as T);
    };

    try {
      const result = invoke(complete);
      if (isPromiseLike(result)) {
        void result.then(complete, fail);
      } else if (result !== undefined) {
        complete(result as T);
      }
    } catch (error) {
      fail(error);
    }
  });
}

function formatPermissionError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (message && !message.toLowerCase().includes("last error")) {
    return `浏览器未完成历史记录授权：${message}`;
  }
  return "浏览器未完成历史记录授权，请检查扩展权限后重试。";
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
    return (
      (await callBrowserApi<boolean>(api, (callback) =>
        api.permissions!.contains(
          { permissions: [HISTORY_PERMISSION] },
          (granted) => callback(granted),
        ),
      ))
        ? "granted"
        : "permission-needed"
    );
  } catch {
    return "permission-needed";
  }
}

export async function requestHistoryPermission(
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): Promise<BrowserHistoryPermissionResult> {
  if (!api || !isExtensionEnvironment(api)) {
    return { granted: false };
  }
  if (!api.permissions?.request) return { granted: Boolean(api.history) };
  try {
    const granted = await callBrowserApi<boolean>(api, (callback) =>
      api.permissions!.request(
        { permissions: [HISTORY_PERMISSION] },
        (result) => callback(result),
      ),
    );
    return { granted };
  } catch (error) {
    return { granted: false, error: formatPermissionError(error) };
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
  const query = createHistoryQuery(options);
  const items = await callBrowserApi<BrowserHistoryItem[]>(api, (callback) =>
    api.history!.search(query, (result) => callback(result)),
  );
  return normalizeHistoryItems(items);
}

export async function deleteBrowserHistoryUrl(
  url: string,
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): Promise<void> {
  if (!api?.history) throw new Error("Browser history is unavailable");
  await callBrowserApi<void>(api, (callback) =>
    api.history!.deleteUrl({ url }, () => callback()),
  );
}

export async function deleteBrowserHistoryRange(
  range: HistoryRange,
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): Promise<void> {
  if (!api?.history) throw new Error("Browser history is unavailable");
  await callBrowserApi<void>(api, (callback) =>
    api.history!.deleteRange(range, () => callback()),
  );
}

export async function deleteAllBrowserHistory(
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): Promise<void> {
  if (!api?.history) throw new Error("Browser history is unavailable");
  await callBrowserApi<void>(api, (callback) =>
    api.history!.deleteAll(() => callback()),
  );
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
