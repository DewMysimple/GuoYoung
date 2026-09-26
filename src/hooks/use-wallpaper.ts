import { useEffect, useMemo, useState } from "react";
import { loadWallpaperBlob } from "../lib/wallpaper-store";
import { readWallpaperStartup, wallpaperSourceKey } from "../lib/wallpaper-startup";
import type { WallpaperSettings } from "../types";

export function useWallpaper(wallpaper: WallpaperSettings) {
  const key = wallpaperSourceKey(wallpaper);
  const preview = useMemo(() => {
    const saved = readWallpaperStartup();
    return saved?.key === key ? saved.preview : undefined;
  }, [key]);
  const [resolved, setResolved] = useState<{ key: string; imageUrl?: string; error: string }>();

  useEffect(() => {
    setResolved(undefined);
    if (!key) return;
    let active = true;
    let objectUrl: string | undefined;
    let image: HTMLImageElement | undefined;
    // An unavailable remote wallpaper must never lock the collection screen.
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setResolved({ key, error: "壁纸加载超时，请检查图片地址或重新选择本地图片" });
    }, 4_000);

    async function resolveWallpaper() {
      try {
        let candidate = wallpaper.url;
        if (wallpaper.source === "local") {
          const blob = await loadWallpaperBlob(wallpaper.localAssetId!);
          if (!active) return;
          if (!blob) throw new Error("本地壁纸文件已丢失，请重新选择");
          candidate = objectUrl = URL.createObjectURL(blob);
        }
        if (!candidate) throw new Error("壁纸地址为空");
        image = new Image();
        await new Promise<void>((resolve, reject) => {
          image!.onload = () => resolve();
          image!.onerror = () => reject(new Error("壁纸无法加载，请检查图片地址"));
          image!.src = candidate;
        });
        // onload can precede decoding. Keep the saved preview until the full
        // image can be painted, avoiding a blank frame during the handoff.
        if (image.decode) await image.decode();
        if (active) setResolved({ key, imageUrl: candidate, error: "" });
      } catch (reason) {
        if (active) setResolved({ key, error: reason instanceof Error ? reason.message : "壁纸无法加载" });
      } finally {
        clearTimeout(timeout);
      }
    }

    void resolveWallpaper();
    return () => {
      active = false;
      clearTimeout(timeout);
      if (image) { image.onload = null; image.onerror = null; image.src = ""; }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, wallpaper.localAssetId, wallpaper.source, wallpaper.url]);

  const current = resolved?.key === key ? resolved : undefined;
  return { imageUrl: key ? current?.imageUrl ?? preview : undefined, error: current?.error ?? "", pending: !!key && !current };
}
