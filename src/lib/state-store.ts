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
  subscribe?: (listener: (loaded: LoadedState) => void) => () => void;
}

function normalizeExtensionValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function createSiteHubStore(
  api: ChromiumExtensionApi | undefined = getChromiumExtensionApi(),
  webStorage: Storage = localStorage,
): SiteHubStore {
  const extensionStorage = api?.storage?.local;
  if (isExtensionEnvironment(api) && extensionStorage) {
    return {
      mode: "extension",
      async load() {
        const values = await extensionStorage.get(STORAGE_KEY);
        const loaded = parseStoredState(
          normalizeExtensionValue(values?.[STORAGE_KEY]),
        );
        if (!loaded.recovered) void syncWallpaperStartup(loaded.state, webStorage);
        return loaded;
      },
      async save(state) {
        await extensionStorage.set({
          [STORAGE_KEY]: JSON.stringify(state),
        });
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
          const loaded = parseStoredState(normalizeExtensionValue(changes[STORAGE_KEY]?.newValue));
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
