import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WALLPAPER } from "../data/defaults";
import { loadWallpaperBlob } from "../lib/wallpaper-store";
import { useWallpaper } from "./use-wallpaper";
import { WALLPAPER_STARTUP_KEY } from "../lib/wallpaper-startup";

vi.mock("../lib/wallpaper-store", () => ({ loadWallpaperBlob: vi.fn() }));
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("wallpaper lifetime", () => {
  it("shows a saved preview during a slow local read and keeps it on failure", async () => {
    const wallpaper = { ...DEFAULT_WALLPAPER, source: "local" as const, localAssetId: "saved" };
    const preview = "data:image/png;base64,YQ==";
    localStorage.setItem(WALLPAPER_STARTUP_KEY, JSON.stringify({ key: "local:saved", wallpaper, preview, theme: "light" }));
    let reject!: (error: Error) => void;
    vi.mocked(loadWallpaperBlob).mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    const { result, rerender } = renderHook(({ settings }) => useWallpaper(settings), { initialProps: { settings: wallpaper as typeof DEFAULT_WALLPAPER } });
    expect(result.current).toMatchObject({ imageUrl: preview, pending: true });
    await act(async () => reject(new Error("unavailable")));
    expect(result.current).toMatchObject({ imageUrl: preview, pending: false, error: "unavailable" });
    rerender({ settings: { ...wallpaper, source: "none" } });
    expect(result.current.imageUrl).toBeUndefined();
  });

  it("releases a stalled uncached startup into a usable collection", async () => {
    vi.useFakeTimers();
    vi.mocked(loadWallpaperBlob).mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useWallpaper({ ...DEFAULT_WALLPAPER, source: "local", localAssetId: "stalled" }));
    expect(result.current.pending).toBe(true);
    act(() => vi.advanceTimersByTime(4_000));
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toContain("超时");
  });

  it("does not allocate an object URL after a pending read is abandoned", async () => {
    let resolve!: (blob: Blob) => void;
    vi.mocked(loadWallpaperBlob).mockReturnValue(new Promise((done) => { resolve = done; }));
    const create = vi.fn().mockReturnValue("blob:abandoned");
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; });
    const { unmount } = renderHook(() => useWallpaper({ ...DEFAULT_WALLPAPER, source: "local", localAssetId: "pending" }));
    unmount();
    await act(async () => resolve(new Blob(["image"])));
    expect(create).not.toHaveBeenCalled();
  });
});
