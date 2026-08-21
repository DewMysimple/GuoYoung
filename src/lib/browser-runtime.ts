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

export interface ChromiumExtensionApi {
  runtime?: {
    id?: string;
    getURL?: (path: string) => string;
  };
  search?: BrowserSearchApi;
  tabs?: BrowserTabsApi;
  bookmarks?: BrowserBookmarksApi;
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
