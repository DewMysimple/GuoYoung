import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import type { ChromiumExtensionApi } from "./browser-runtime";
import { createSiteHubStore } from "./state-store";
import { STORAGE_KEY } from "./storage";

describe("site hub store", () => {
  it("loads and saves through chrome.storage.local in extension mode", async () => {
    const state = createDefaultState();
    const get = vi.fn().mockResolvedValue({
      [STORAGE_KEY]: JSON.stringify(state),
    });
    const set = vi.fn().mockResolvedValue(undefined);
    const api: ChromiumExtensionApi = {
      runtime: { id: "extension-id" },
      storage: { local: { get, set } },
    };

    const store = createSiteHubStore(api, localStorage);
    expect(store.mode).toBe("extension");
    expect(store.initial).toBeUndefined();
    await expect(store.load()).resolves.toEqual({
      state,
      recovered: false,
    });

    await store.save(state);
    expect(set).toHaveBeenCalledWith({
      [STORAGE_KEY]: JSON.stringify(state),
    });
  });

  it("keeps synchronous localStorage bootstrap in web mode", async () => {
    const state = createDefaultState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    const store = createSiteHubStore({}, localStorage);

    expect(store.mode).toBe("web");
    expect(store.initial?.state).toEqual(state);
    await expect(store.load()).resolves.toEqual(store.initial);
  });

  it("subscribes to external chrome storage changes", () => {
    const state = createDefaultState();
    let listener:
      | ((changes: Record<string, { newValue?: unknown }>, area: string) => void)
      | undefined;
    const api: ChromiumExtensionApi = {
      runtime: { id: "extension-id" },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
        onChanged: {
          addListener: vi.fn((callback) => {
            listener = callback;
          }),
          removeListener: vi.fn(),
        },
      },
    };
    const store = createSiteHubStore(api, localStorage);
    const subscriber = vi.fn();
    const unsubscribe = store.subscribe!(subscriber);
    listener?.({
      [STORAGE_KEY]: { newValue: JSON.stringify(state) },
    }, "local");
    expect(subscriber).toHaveBeenCalledWith({ state, recovered: false });
    unsubscribe();
    expect(api.storage?.onChanged?.removeListener).toHaveBeenCalled();
  });
});
