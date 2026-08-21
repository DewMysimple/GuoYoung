import type { SiteCollectionState } from "../types";
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
        return parseStoredState(
          normalizeExtensionValue(values?.[STORAGE_KEY]),
        );
      },
      async save(state) {
        await extensionStorage.set({
          [STORAGE_KEY]: JSON.stringify(state),
        });
      },
      subscribe(listener) {
        const changed = api.storage?.onChanged;
        if (!changed) return () => undefined;
        const handleChange = (
          changes: Record<string, { newValue?: unknown }>,
          areaName: string,
        ) => {
          if (areaName !== "local" || !(STORAGE_KEY in changes)) return;
          listener(
            parseStoredState(
              normalizeExtensionValue(changes[STORAGE_KEY]?.newValue),
            ),
          );
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
      return initial;
    },
    async save(state) {
      saveState(state, webStorage);
    },
  };
}
