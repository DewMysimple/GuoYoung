import { loadAssetBlob, saveAssetBlob } from "./asset-store";

export const MAX_WALLPAPER_BYTES = 20 * 1024 * 1024;

export function saveWallpaperBlob(id: string, blob: Blob): Promise<void> {
  return saveAssetBlob("wallpapers", id, blob);
}

export function loadWallpaperBlob(id: string): Promise<Blob | undefined> {
  return loadAssetBlob("wallpapers", id);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("无法压缩这张图片"));
      },
      "image/webp",
      0.85,
    );
  });
}

export async function prepareWallpaper(file: File): Promise<Blob> {
  if (file.size > MAX_WALLPAPER_BYTES) {
    throw new Error("图片不能超过 20MB");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 2560 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  try {
    if (!context) throw new Error("浏览器无法处理这张图片");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    image.close();
  }
  return canvasToBlob(canvas);
}
