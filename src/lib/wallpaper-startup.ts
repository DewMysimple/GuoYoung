import type { SiteCollectionState, WallpaperSettings } from "../types";
import { loadWallpaperBlob } from "./wallpaper-store";

// Disposable presentation cache only. site-hub:v1 remains authoritative.
export const WALLPAPER_STARTUP_KEY = "site-hub:wallpaper-startup:v1";
export const THEME_STARTUP_KEY = "site-hub:theme-startup:v1";
export interface WallpaperStartup {
  key: string;
  preview: string;
  quality?: number;
  wallpaper: WallpaperSettings;
  theme: SiteCollectionState["appearance"]["theme"];
}

export function wallpaperSourceKey(wallpaper: WallpaperSettings) {
  return wallpaper.source === "local" && wallpaper.localAssetId ? `local:${wallpaper.localAssetId}`
    : wallpaper.source === "url" && wallpaper.url ? `url:${wallpaper.url}` : "";
}

export function readWallpaperStartup(storage: Pick<Storage, "getItem"> = localStorage): WallpaperStartup | undefined {
  try {
    const value = JSON.parse(storage.getItem(WALLPAPER_STARTUP_KEY) ?? "null") as WallpaperStartup | null;
    if (value && typeof value.key === "string" && value.key && typeof value.preview === "string"
      && /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value.preview)
      && value.preview.length <= 800_000 && value.wallpaper && wallpaperSourceKey(value.wallpaper) === value.key) return value;
  } catch { /* Cache corruption or unavailable storage must not affect collections. */ }
  return undefined;
}

const requests = new WeakMap<Storage, { signature: string }>();

/** Called only for authoritative reads and successful saves, never drafts. */
export async function syncWallpaperStartup(state: SiteCollectionState, storage: Storage = localStorage) {
  const wallpaper = state.wallpaper;
  const key = wallpaperSourceKey(wallpaper);
  const signature = JSON.stringify([wallpaper, state.appearance.theme]);
  if (requests.get(storage)?.signature === signature) return;
  const existing = readWallpaperStartup(storage);
  const current = { signature };
  requests.set(storage, current);
  const write = (preview: string) => {
    if (requests.get(storage) !== current) return;
    storage.setItem(WALLPAPER_STARTUP_KEY, JSON.stringify({ key, preview, wallpaper, theme: state.appearance.theme, quality: 2 }));
  };
  try {
    storage.setItem(THEME_STARTUP_KEY, state.appearance.theme);
    if (!key) { storage.removeItem(WALLPAPER_STARTUP_KEY); return; }
    if (existing?.key === key && existing.quality === 2) {
      if (JSON.stringify([existing.wallpaper, existing.theme]) !== signature) write(existing.preview);
      return;
    }
    if (existing?.key !== key) storage.removeItem(WALLPAPER_STARTUP_KEY);
    let objectUrl: string | undefined;
    try {
      let source = wallpaper.url;
      if (wallpaper.source === "local") {
        const blob = await loadWallpaperBlob(wallpaper.localAssetId!);
        if (requests.get(storage) !== current || !blob) return;
        source = objectUrl = URL.createObjectURL(blob);
      }
      if (!source) return;
      const image = new Image();
      if (wallpaper.source === "url") image.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => { image.src = ""; reject(new Error("Startup preview timed out")); }, 10_000);
        image.onload = () => { clearTimeout(timeout); resolve(); };
        image.onerror = () => { clearTimeout(timeout); reject(new Error("Startup preview unavailable")); };
        image.src = source;
      });
      // Preview encoding is optional maintenance; let the first app frame and
      // pending input finish before reading/encoding a potentially large image.
      if (typeof window.requestIdleCallback === "function") {
        await new Promise<void>(resolve => window.requestIdleCallback(() => resolve(), { timeout: 2000 }));
      }
      if (requests.get(storage) !== current) return;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      // Fine-grained/noisy photos may exceed the budget at 1920px. Reduce only
      // the disposable preview; the user's original asset stays untouched.
      for (const edge of [1920, 1280, 960, 640, 400]) {
        const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const preview = canvas.toDataURL("image/webp", .82);
        if (preview.length <= 800_000) { write(preview); break; }
      }
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  } catch { /* CORS, quota and decode failures affect this optional cache only. */ }
}

export function dismissWallpaperStartup() {
  document.getElementById("wallpaper-startup")?.remove();
  document.getElementById("wallpaper-startup-style")?.remove();
  delete document.documentElement.dataset.wallpaperStartup;
}
