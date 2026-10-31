import type { SiteCollectionState } from "../types";
import { syncWallpaperStartup } from "./wallpaper-startup";
import {
  getChromiumExtensionApi,
  isExtensionEnvironment,
  type ChromiumExtensionApi,
} from "./browser-runtime";
import {
  loadState,
  parseStoredState,
  saveState,
  STORAGE_KEY,
  type LoadedState,
} from "./storage";

export type StorageMode = "extension" | "web";

export interface SiteHubStore {
  mode: StorageMode;
  initial?: LoadedState;
  load: () => Promise<LoadedState>;
  save: (state: SiteCollectionState) => Promise<void>;
  /** Last raw authoritative value, before parsing or schema normalization. */
  getPersistedValue?: () => string | null;
  subscribe?: (listener: (loaded: LoadedState) => void) => () => void;
}

function normalizeExtensionValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function createSiteHubStore(
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
  webStorage: Storage = localStorage,
  startupRead?: Promise<Record<string, unknown>>,
): SiteHubStore {
  const extensionStorage = api?.storage?.local;
  if (isExtensionEnvironment(api) && extensionStorage) {
    let persistedValue: string | null = null;
    return {
      mode: "extension",
      getPersistedValue: () => persistedValue,
      async load() {
        const pending = startupRead;
        startupRead = undefined;
        const values = await (pending ?? extensionStorage.get(STORAGE_KEY));
        const raw = values?.[STORAGE_KEY];
        persistedValue = typeof raw === "string" ? raw : null;
        const loaded = parseStoredState(normalizeExtensionValue(raw));
        if (!loaded.recovered) void syncWallpaperStartup(loaded.state, webStorage);
        return loaded;
      },
      async save(state) {
        const serialized = JSON.stringify(state);
        await extensionStorage.set({
          [STORAGE_KEY]: serialized,
        });
        persistedValue = serialized;
        void syncWallpaperStartup(state, webStorage);
      },
      subscribe(listener) {
        const changed = api.storage?.onChanged;
        if (!changed) return () => undefined;
        const handleChange = (
          changes: Record<string, { newValue?: unknown }>,
          areaName: string,
        ) => {
          if (areaName !== "local" || !(STORAGE_KEY in changes)) return;
          const raw = changes[STORAGE_KEY]?.newValue;
          persistedValue = typeof raw === "string" ? raw : null;
          const loaded = parseStoredState(normalizeExtensionValue(raw));
          if (!loaded.recovered) void syncWallpaperStartup(loaded.state, webStorage);
          listener(loaded);
        };
        changed.addListener(handleChange);
        return () => changed.removeListener(handleChange);
      },
    };
  }

  const initial = loadState(webStorage);
  return {
    mode: "web",
    initial,
    async load() {
      return loadState(webStorage);
    },
    async save(state) {
      saveState(state, webStorage);
      void syncWallpaperStartup(state, webStorage);
    },
  };
}
