import { useEffect, useState } from "react";
import { loadWallpaperBlob } from "../lib/wallpaper-store";
import type { WallpaperSettings } from "../types";

export function useWallpaper(wallpaper: WallpaperSettings) {
  const [imageUrl, setImageUrl] = useState<string>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setError("");
    setImageUrl(undefined);

    async function resolveWallpaper() {
      try {
        let candidate: string | undefined;
        if (wallpaper.source === "url" && wallpaper.url) {
          candidate = wallpaper.url;
        } else if (
          wallpaper.source === "local" &&
          wallpaper.localAssetId
        ) {
          const blob = await loadWallpaperBlob(wallpaper.localAssetId);
          if (!blob) throw new Error("本地壁纸文件已丢失，请重新选择");
          objectUrl = URL.createObjectURL(blob);
          candidate = objectUrl;
        }
        if (!candidate) return;
        await new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("壁纸无法加载，请检查图片地址"));
          image.src = candidate;
        });
        if (active) setImageUrl(candidate);
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : "壁纸无法加载",
          );
        }
      }
    }

    void resolveWallpaper();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    wallpaper.localAssetId,
    wallpaper.source,
    wallpaper.url,
  ]);

  return { imageUrl, error };
}
