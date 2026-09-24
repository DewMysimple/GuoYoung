import {
  getChromiumExtensionApi,
  isExtensionEnvironment,
  type BrowserHistoryApi,
} from "./lib/browser-runtime";
import {
  HISTORY_INVALIDATED_MESSAGE,
  HISTORY_PERMISSION,
} from "./lib/browser-history";

const api = getChromiumExtensionApi();

function notifyOpenViews() {
  try {
    const result = api?.runtime?.sendMessage?.(HISTORY_INVALIDATED_MESSAGE);
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      void (result as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    // No extension page may be listening while the service worker is active.
  }
}

let registeredHistory: BrowserHistoryApi | undefined;

function registerHistoryListeners() {
  if (registeredHistory || !api?.history) return;
  api.history.onVisited?.addListener(notifyOpenViews);
  api.history.onVisitRemoved?.addListener(notifyOpenViews);
  registeredHistory = api.history;
}

if (isExtensionEnvironment(api)) {
  registerHistoryListeners();
  api?.permissions?.onAdded?.addListener(({ permissions }) => {
    if (permissions?.includes(HISTORY_PERMISSION)) registerHistoryListeners();
  });
  api?.permissions?.onRemoved?.addListener(({ permissions }) => {
    if (!permissions?.includes(HISTORY_PERMISSION)) return;
    registeredHistory?.onVisited?.removeListener(notifyOpenViews);
    registeredHistory?.onVisitRemoved?.removeListener(notifyOpenViews);
    registeredHistory = undefined;
    notifyOpenViews();
  });
}
