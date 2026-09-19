import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WALLPAPER } from "../data/defaults";
import { loadWallpaperBlob } from "../lib/wallpaper-store";
import { useWallpaper } from "./use-wallpaper";

vi.mock("../lib/wallpaper-store", () => ({ loadWallpaperBlob: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("wallpaper lifetime", () => {
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
