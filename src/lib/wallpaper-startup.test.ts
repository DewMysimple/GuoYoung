import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { loadWallpaperBlob } from "./wallpaper-store";
import { readWallpaperStartup, syncWallpaperStartup, WALLPAPER_STARTUP_KEY } from "./wallpaper-startup";

vi.mock("./wallpaper-store", () => ({ loadWallpaperBlob: vi.fn() }));
const preview = "data:image/webp;base64,YQ==";
function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } as unknown as Storage;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("saved wallpaper startup preview", () => {
  it("shrinks a detailed preview to fit the budget and avoids rereading it on collection-only saves", async () => {
    const storage = memory();
    const state = createDefaultState();
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://example.test/detail.png" };
    vi.stubGlobal("Image", class {
      naturalWidth = 1920; naturalHeight = 1080;
      onload?: () => void;
      set src(_: string) { queueMicrotask(() => this.onload?.()); }
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValueOnce(`data:image/webp;base64,${"a".repeat(800_000)}`).mockReturnValue(preview);
    await syncWallpaperStartup(state, storage);
    expect(readWallpaperStartup(storage)?.preview).toBe(preview);
    const read = vi.spyOn(storage, "getItem");
    await syncWallpaperStartup({ ...state, sites: [] }, storage);
    expect(read).not.toHaveBeenCalled();
  });

  it("reuses pixels while updating saved appearance and clears on removal", async () => {
    const storage = memory();
    const state = createDefaultState();
    state.wallpaper = { ...state.wallpaper, source: "local", localAssetId: "saved" };
    storage.setItem(WALLPAPER_STARTUP_KEY, JSON.stringify({ key: "local:saved", preview, quality: 2, wallpaper: state.wallpaper, theme: "light" }));
    state.wallpaper.overlay = 50;
    state.appearance.theme = "dark";
    await syncWallpaperStartup(state, storage);
    expect(readWallpaperStartup(storage)).toMatchObject({ preview, theme: "dark", wallpaper: { overlay: 50 } });
    state.wallpaper = { ...state.wallpaper, source: "none" };
    await syncWallpaperStartup(state, storage);
    expect(storage.getItem(WALLPAPER_STARTUP_KEY)).toBeNull();
  });

  it("cannot resurrect an old image after a newer save clears the wallpaper", async () => {
    const storage = memory();
    const state = createDefaultState();
    state.wallpaper = { ...state.wallpaper, source: "local", localAssetId: "pending" };
    let finish!: (blob: Blob) => void;
    vi.mocked(loadWallpaperBlob).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = syncWallpaperStartup(state, storage);
    await syncWallpaperStartup({ ...state, wallpaper: { ...state.wallpaper, source: "none" } }, storage);
    finish(new Blob(["image"]));
    await pending;
    expect(readWallpaperStartup(storage)).toBeUndefined();
  });

  it("ignores corrupt preview data and storage quota failures", async () => {
    const storage = memory();
    storage.setItem(WALLPAPER_STARTUP_KEY, "{broken");
    expect(readWallpaperStartup(storage)).toBeUndefined();
    const state = createDefaultState();
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://example.test/wallpaper.png" };
    storage.setItem(WALLPAPER_STARTUP_KEY, JSON.stringify({ key: `url:${state.wallpaper.url}`, preview, quality: 2, wallpaper: state.wallpaper, theme: "light" }));
    storage.setItem = () => { throw new DOMException("Quota", "QuotaExceededError"); };
    await expect(syncWallpaperStartup(state, storage)).resolves.toBeUndefined();
  });
});
