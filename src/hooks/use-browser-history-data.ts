import { useEffect, useRef, useState } from "react";
import { deleteBrowserHistoryUrl, getHistoryAvailability, readHistoryAvailability, searchBrowserHistory,
  subscribeToBrowserHistoryChanges, subscribeToHistoryPermissionChanges, type BrowserHistoryAvailability,
  type BrowserHistoryPermissionResult, type HistoryTimeRange } from "../lib/browser-history";
import type { BrowserHistoryItem, ChromiumExtensionApi } from "../lib/browser-runtime";

/** Browser data lifecycle only. Selection, detail navigation and rendering stay in the view. */
export function useBrowserHistoryData({ api, query, timeRange, permissionVersion, permissionError: externalError, onRequestPermission, active: visible = true }: {
  active?: boolean;
  api: ChromiumExtensionApi | undefined; query: string; timeRange: HistoryTimeRange; permissionVersion: number;
  permissionError: string | null;
  onRequestPermission: () => Promise<BrowserHistoryPermissionResult> | BrowserHistoryPermissionResult | void;
}) {
  const [availability, setAvailability] = useState(() => getHistoryAvailability(api));
  const [items, setItems] = useState<BrowserHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasRead, setHasRead] = useState(false);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionError, setPermissionError] = useState(externalError);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const permissionEpoch = useRef(0);
  const availabilityRef = useRef(availability);
  const checkAvailability = useRef<() => Promise<BrowserHistoryAvailability>>(async () => "unsupported");
  const deleting = useRef(false);
  const requesting = useRef(false);
  const previousQuery = useRef(query);
  const refresh = () => {
    void checkAvailability.current().then(next => {
      if (next === "granted") setRevision(value => value + 1);
    });
  };

  useEffect(() => {
    const current = ++generation.current;
    deleting.current = false;
    requesting.current = false;
    setBusy(false);
    setPermissionLoading(false);
    let checkSequence = 0;
    const apply = (next: BrowserHistoryAvailability) => {
      if (next !== availabilityRef.current) permissionEpoch.current++;
      availabilityRef.current = next;
      setAvailability(next);
      setAvailabilityChecked(true);
      if (next === "granted") setPermissionError(null);
      else {
        setItems([]);
        setHasRead(false);
        setLoading(false);
        setError(null);
        setReadError(null);
        deleting.current = false;
        setBusy(false);
      }
    };
    const check = async () => {
      const sequence = ++checkSequence;
      const next = await readHistoryAvailability(api);
      if (generation.current !== current) return "unsupported" as const;
      if (sequence === checkSequence) apply(next);
      return availabilityRef.current;
    };
    checkAvailability.current = check;
    void check();
    const remove = subscribeToHistoryPermissionChanges(granted => {
      // Revocation immediately invalidates cached and in-flight history data.
      if (!granted) { checkSequence++; apply("permission-needed"); }
      else refresh();
    }, api);
    const visibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current++;
      remove();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [api, permissionVersion]);

  useEffect(() => { setPermissionError(externalError); }, [externalError]);

  useEffect(() => {
    if (availability !== "granted") return;
    return subscribeToBrowserHistoryChanges(refresh, api);
  }, [api, availability]);

  useEffect(() => {
    if (!visible || !availabilityChecked || availability !== "granted") return;
    let active = true;
    const epoch = permissionEpoch.current;
    // Only typing needs debounce. Never report an empty result while a first
    // read is pending; subsequent reads retain the last successful snapshot.
    const delay = previousQuery.current === query ? 0 : 160;
    previousQuery.current = query;
    setLoading(true);
    setReadError(null);
    const read = () => {
      void searchBrowserHistory({ text: query, range: timeRange }, api).then((next) => {
        if (active && epoch === permissionEpoch.current) { setItems(next); setHasRead(true); setLoading(false); }
      }, () => {
        if (active && epoch === permissionEpoch.current) {
          setHasRead(true); setLoading(false); setReadError("无法读取浏览器历史记录，请稍后重试。");
          void checkAvailability.current();
        }
      });
    };
    const timer = delay ? window.setTimeout(read, delay) : undefined;
    if (!delay) read();
    return () => { active = false; window.clearTimeout(timer); };
  }, [api, availability, availabilityChecked, query, timeRange, revision, visible]);

  async function refreshPermission() {
    if (requesting.current) return;
    requesting.current = true;
    setPermissionLoading(true);
    setPermissionError(null);
    const current = generation.current;
    try {
      const result = await onRequestPermission();
      const next = await checkAvailability.current();
      if (current !== generation.current) return;
      if (next !== "granted" && result && !result.granted) setPermissionError(result.error ?? "浏览器未完成历史记录授权，请检查扩展权限后重试。");
    } catch {
      if (current === generation.current) setPermissionError("浏览器未完成历史记录授权，请检查扩展权限后重试。");
    } finally {
      if (current === generation.current) { requesting.current = false; setPermissionLoading(false); }
    }
  }

  async function deleteUrls(urls: string[]): Promise<string[]> {
    const unique = [...new Set(urls)];
    if (!unique.length || deleting.current) return [];
    deleting.current = true;
    setBusy(true);
    setError(null);
    const current = generation.current;
    const epoch = permissionEpoch.current;
    const results = await Promise.allSettled(unique.map((url) => deleteBrowserHistoryUrl(url, api)));
    if (current !== generation.current || epoch !== permissionEpoch.current) return [];
    const deleted = unique.filter((_, index) => results[index].status === "fulfilled");
    const failed = unique.length - deleted.length;
    deleting.current = false;
    setBusy(false);
    refresh();
    if (failed) setError(`已删除 ${deleted.length} 条，${failed} 条删除失败，请稍后重试。`);
    return deleted;
  }

  return { availability, items, loading: availability === "granted" && (loading || !hasRead),
    busy, permissionLoading, permissionError, error: error ?? readError,
    setError: (message: string | null) => { setError(message); setReadError(null); },
    refreshPermission, refresh, deleteUrls };
}
