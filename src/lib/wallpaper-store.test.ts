import { afterEach, expect, it, vi } from "vitest";
import { loadWallpaperBlob, saveWallpaperBlob } from "./wallpaper-store";

afterEach(() => vi.unstubAllGlobals());
it.each(["read-error", "write-error", "write-abort", "transaction-error"])("closes the database on %s", async (failure) => {
  const close = vi.fn();
  const read = { error: new Error("read failed"), onerror: () => {} };
  const transaction = {
    error: new Error("write failed"), onerror: () => {}, onabort: () => {},
    objectStore: () => ({
      get: () => { queueMicrotask(() => read.onerror()); return read; },
      put: () => { queueMicrotask(() => failure === "write-abort" ? transaction.onabort() : transaction.onerror()); },
    }),
  };
  const request = {
    result: { close, transaction: () => { if (failure === "transaction-error") throw new Error("transaction failed"); return transaction; } },
    onsuccess: () => {},
  };
  vi.stubGlobal("indexedDB", { open: () => { queueMicrotask(() => request.onsuccess()); return request; } });
  const result = failure === "read-error" ? loadWallpaperBlob("asset") : saveWallpaperBlob("asset", new Blob());
  await expect(result).rejects.toThrow();
  expect(close).toHaveBeenCalledTimes(1);
});
