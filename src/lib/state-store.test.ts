import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import type { ChromiumExtensionApi } from "./browser-runtime";
import { createSiteHubStore } from "./state-store";
import { STORAGE_KEY } from "./storage";
import { WALLPAPER_STARTUP_KEY } from "./wallpaper-startup";
import { importSelectedBookmarks } from "./bookmark-manager";

describe("site hub store", () => {
  it.each(["web", "extension"])("rejects an unsuccessful %s write and permits a later save read by a fresh store", async mode => {
    const original = createDefaultState();
    const edited = { ...original, brand: { ...original.brand, name: "Synthetic saved brand" } };
    let persisted = JSON.stringify(original);
    let rejectWrite = true;
    const setItem = vi.fn((key: string, value: string) => {
      if (key === STORAGE_KEY) {
        if (rejectWrite) throw new Error("Synthetic quota");
        persisted = value;
      }
    });
    const webStorage = { getItem: (key: string) => key === STORAGE_KEY ? persisted : null,
      setItem, removeItem: vi.fn() } as unknown as Storage;
    const api: ChromiumExtensionApi = mode === "extension" ? {
      runtime: { id: "synthetic-extension" }, storage: { local: {
        get: async () => ({ [STORAGE_KEY]: persisted }),
        set: async values => { if (rejectWrite) throw new Error("Synthetic quota"); persisted = values[STORAGE_KEY] as string; },
      } },
    } : {};
    const store = createSiteHubStore(api, webStorage);
    await expect(store.save(edited)).rejects.toThrow("Synthetic quota");
    expect((await createSiteHubStore(api, webStorage).load()).state.brand).toEqual(original.brand);
    rejectWrite = false;
    await expect(store.save(edited)).resolves.toBeUndefined();
    expect((await createSiteHubStore(api, webStorage).load()).state.brand.name).toBe("Synthetic saved brand");
  });

  it.each(["web", "extension"])("restores a newly added anchored bookmark after a fresh %s store is created", async (mode) => {
    const state = createDefaultState();
    const url = "https://example.com/docs?next=/Guide/#installation/";
    const next = importSelectedBookmarks(state,
      [{ id: "anchored-bookmark", title: "Anchored document", url }],
      new Set(["anchored-bookmark"]), "search").state;
    let persisted = JSON.stringify(state);
    const api: ChromiumExtensionApi = mode === "extension" ? {
      runtime: { id: "test-extension" },
      storage: { local: {
        get: vi.fn(async () => ({ [STORAGE_KEY]: persisted })),
        set: vi.fn(async (values) => { persisted = values[STORAGE_KEY] as string; }),
      } },
    } : {};
    if (mode === "web") localStorage.setItem(STORAGE_KEY, persisted);
    try {
      await createSiteHubStore(api, localStorage).save(next);
      const refreshed = await createSiteHubStore(api, localStorage).load();
      expect(refreshed.recovered).toBe(false);
      expect(refreshed.state.sites.find((site) => site.name === "Anchored document")?.url).toBe(url);
      expect(refreshed.state.sites).toHaveLength(state.sites.length + 1);
    } finally {
      localStorage.removeItem(STORAGE_KEY);
    }
  });

  it("consumes the early authoritative read once and reads fresh storage thereafter", async () => {
    const state = createDefaultState();
    const get = vi.fn().mockResolvedValue({ [STORAGE_KEY]: JSON.stringify({ ...state, sites: [] }) });
    const store = createSiteHubStore({ runtime: { id: "extension" }, storage: { local: { get, set: vi.fn() } } }, localStorage,
      Promise.resolve({ [STORAGE_KEY]: JSON.stringify(state) }));
    expect((await store.load()).state.sites).toEqual(state.sites);
    expect(get).not.toHaveBeenCalled();
    expect((await store.load()).state.sites).toEqual([]);
    expect(get).toHaveBeenCalledOnce();
  });
  it("does not update the startup preview when the authoritative save fails", async () => {
    const state = createDefaultState();
    const preview = "previous saved preview";
    localStorage.setItem(WALLPAPER_STARTUP_KEY, preview);
    const store = createSiteHubStore({ runtime: { id: "extension-id" }, storage: { local: {
      get: vi.fn(), set: vi.fn().mockRejectedValue(new Error("write failed")),
    } } }, localStorage);
    await expect(store.save(state)).rejects.toThrow("write failed");
    expect(localStorage.getItem(WALLPAPER_STARTUP_KEY)).toBe(preview);
    localStorage.removeItem(WALLPAPER_STARTUP_KEY);
  });

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
