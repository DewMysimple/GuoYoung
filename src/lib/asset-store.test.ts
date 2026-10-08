import { afterEach, expect, it, vi } from "vitest";
import { loadAssetBlob, saveAssetBlob } from "./asset-store";

afterEach(() => vi.unstubAllGlobals());

it("adds the fonts store to a v1 database without replacing existing wallpapers", async () => {
  const wallpaper = new Blob(["saved wallpaper"]);
  const stores = new Map<string, Map<string, Blob>>([["wallpapers", new Map([["existing", wallpaper]])]]);
  let version = 1;
  const createObjectStore = vi.fn((name: string) => stores.set(name, new Map()));
  const close = vi.fn();
  const transaction = vi.fn((name: string) => {
    const result = {
      oncomplete: () => {},
      objectStore: (store: string) => ({
        get: (id: string) => {
          const request = { result: stores.get(store)?.get(id), onsuccess: () => {} };
          queueMicrotask(() => request.onsuccess());
          return request;
        },
        put: (blob: Blob, id: string) => {
          stores.get(store)!.set(id, blob);
          queueMicrotask(() => result.oncomplete());
        },
      }),
    };
    expect(stores.has(name)).toBe(true);
    return result;
  });
  const database = { objectStoreNames: { contains: (name: string) => stores.has(name) }, createObjectStore, transaction, close };
  const open = vi.fn((_name: string, nextVersion: number) => {
    const request = { result: database, onupgradeneeded: () => {}, onsuccess: () => {} };
    queueMicrotask(() => {
      if (nextVersion > version) { request.onupgradeneeded(); version = nextVersion; }
      request.onsuccess();
    });
    return request;
  });
  vi.stubGlobal("indexedDB", { open });
  expect(await loadAssetBlob("wallpapers", "existing")).toBe(wallpaper);
  const font = new Blob(["font bytes"]);
  await saveAssetBlob("fonts", "existing", font);
  expect(await loadAssetBlob("fonts", "existing")).toBe(font);
  expect(await loadAssetBlob("wallpapers", "existing")).toBe(wallpaper);
  expect(open).toHaveBeenCalledWith("site-hub-assets", 2);
  expect(createObjectStore).toHaveBeenCalledExactlyOnceWith("fonts");
  expect(transaction.mock.calls.map(call => call[0])).toEqual(["wallpapers", "fonts", "fonts", "wallpapers"]);
  expect(close).toHaveBeenCalledTimes(4);
});

it("rejects a failed database open without starting a transaction", async () => {
  const request = { error: new Error("database unavailable"), onerror: () => {} };
  vi.stubGlobal("indexedDB", { open: () => { queueMicrotask(() => request.onerror()); return request; } });
  await expect(loadAssetBlob("fonts", "id")).rejects.toThrow("database unavailable");
});
