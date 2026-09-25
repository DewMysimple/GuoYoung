import { createDefaultState } from "../data/defaults";
import { createSiteHubStore, type SiteHubStore } from "./state-store";

declare global {
  interface Window { __MYSIMPLE_STARTUP__?: { read: () => Promise<Record<string, unknown>>; dispose: () => void } }
}

/** Settle the store before the first React commit instead of painting a loader
 * and a default collection. Only authoritative storage supplies the initial data. */
export async function prepareAppStore(): Promise<SiteHubStore> {
  const earlyRead = window.__MYSIMPLE_STARTUP__;
  delete window.__MYSIMPLE_STARTUP__;
  const store = createSiteHubStore(undefined, localStorage, earlyRead?.read());
  if (store.initial) { earlyRead?.dispose(); return store; }
  try {
    return { ...store, initial: await store.load() };
  } catch {
    return { ...store, initial: { state: createDefaultState(), recovered: true } };
  } finally {
    earlyRead?.dispose();
  }
}
