export interface BrowserSearchApi {
  query: (queryInfo: {
    text: string;
    disposition?: "CURRENT_TAB" | "NEW_TAB" | "NEW_WINDOW";
  }) => Promise<void> | void;
}

export interface BrowserStorageArea {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

export interface BrowserStorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface BrowserStorageChangedEvent {
  addListener: (
    callback: (
      changes: Record<string, BrowserStorageChange>,
      areaName: string,
    ) => void,
  ) => void;
  removeListener: (
    callback: (
      changes: Record<string, BrowserStorageChange>,
      areaName: string,
    ) => void,
  ) => void;
}

export interface BrowserTab {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
}

export interface BrowserTabsApi {
  query: (queryInfo: {
    active?: boolean;
    currentWindow?: boolean;
  }) => Promise<BrowserTab[]>;
}

export interface BrowserBookmarkTreeNode {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  children?: BrowserBookmarkTreeNode[];
}

export interface BrowserBookmarksApi {
  getTree: () => Promise<BrowserBookmarkTreeNode[]>;
  remove: (id: string) => Promise<void>;
  removeTree: (id: string) => Promise<void>;
}

export interface BrowserHistoryItem {
  id: string;
  title?: string;
  url?: string;
  lastVisitTime?: number;
  visitCount?: number;
  typedCount?: number;
}

export interface BrowserHistoryQuery {
  text: string;
  startTime?: number;
  endTime?: number;
  maxResults?: number;
}

export interface BrowserHistoryRemovedEvent {
  allHistory: boolean;
  urls?: string[];
}

export interface BrowserHistoryChangedEvent<T> {
  addListener: (callback: (value: T) => void) => void;
  removeListener: (callback: (value: T) => void) => void;
}

export interface BrowserHistoryApi {
  search: (query: BrowserHistoryQuery) => Promise<BrowserHistoryItem[]>;
  deleteUrl: (details: { url: string }) => Promise<void>;
  deleteRange: (range: { startTime: number; endTime: number }) => Promise<void>;
  deleteAll: () => Promise<void>;
  onVisited?: BrowserHistoryChangedEvent<BrowserHistoryItem>;
  onVisitRemoved?: BrowserHistoryChangedEvent<BrowserHistoryRemovedEvent>;
}

export interface BrowserPermissionsApi {
  contains: (permissions: { permissions?: string[] }) => Promise<boolean>;
  request: (permissions: { permissions?: string[] }) => Promise<boolean>;
  onAdded?: BrowserPermissionChangedEvent;
}

export interface BrowserPermissionChangedEvent {
  addListener: (callback: (permissions: { permissions?: string[] }) => void) => void;
  removeListener: (callback: (permissions: { permissions?: string[] }) => void) => void;
}

export interface BrowserRuntimeMessageEvent {
  addListener: (
    callback: (message: unknown, sender?: unknown, sendResponse?: unknown) => void,
  ) => void;
  removeListener: (
    callback: (message: unknown, sender?: unknown, sendResponse?: unknown) => void,
  ) => void;
}

export interface ChromiumExtensionApi {
  runtime?: {
    id?: string;
    getURL?: (path: string) => string;
    sendMessage?: (message: unknown) => Promise<unknown> | void;
    onMessage?: BrowserRuntimeMessageEvent;
  };
  search?: BrowserSearchApi;
  tabs?: BrowserTabsApi;
  bookmarks?: BrowserBookmarksApi;
  history?: BrowserHistoryApi;
  permissions?: BrowserPermissionsApi;
  storage?: {
    local?: BrowserStorageArea;
    onChanged?: BrowserStorageChangedEvent;
  };
}

export function getBrowserFaviconUrl(
  pageUrl: string,
  size = 64,
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): string | undefined {
  if (!isExtensionEnvironment(api) || !api?.runtime?.getURL) return undefined;
  const faviconUrl = new URL(api.runtime.getURL("/_favicon/"));
  faviconUrl.searchParams.set("pageUrl", pageUrl);
  faviconUrl.searchParams.set("size", String(size));
  return faviconUrl.toString();
}

export function getBrowserFaviconUrls(
  pageUrl: string,
  size = 64,
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): string[] {
  const exactUrl = getBrowserFaviconUrl(pageUrl, size, api);
  if (!exactUrl) return [];

  try {
    const origin = new URL(pageUrl).origin;
    const originUrl = getBrowserFaviconUrl(origin, size, api);
    return [...new Set([exactUrl, originUrl].filter(Boolean) as string[])];
  } catch {
    return [exactUrl];
  }
}

export function getChromiumExtensionApi(): ChromiumExtensionApi | undefined {
  return (
    globalThis as typeof globalThis & {
      chrome?: ChromiumExtensionApi;
    }
  ).chrome;
}

export function isExtensionEnvironment(
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
): boolean {
  return Boolean(api?.runtime?.id);
}
