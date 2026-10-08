import { loadAssetBlob, saveAssetBlob } from "./asset-store";

export const MAX_LOCAL_FONT_BYTES = 50 * 1024 * 1024;
export const LOCAL_FONT_ACCEPT = ".ttf,.otf,.ttc,.woff,.woff2";
const loadedBlobs = new Map<string, Promise<Blob>>();

/** Asset IDs are opaque keys, never CSS supplied by a file or imported state. */
export function getLocalFontFamily(assetId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(assetId)) throw new Error("本机字体记录无效，请重新选择字体文件");
  return `Mysimple_Local_${assetId}`;
}

function cacheBlob(assetId: string, promise: Promise<Blob>) {
  loadedBlobs.set(assetId, promise);
  // Font files can be large; retain only the active font and one recent draft.
  if (loadedBlobs.size > 2) loadedBlobs.delete(loadedBlobs.keys().next().value!);
  return promise;
}

export async function prepareLocalFont(file: File): Promise<{ assetId: string; name: string }> {
  if (!/\.(ttf|otf|ttc|woff2?)$/i.test(file.name)) throw new Error("请选择 TTF、OTF、TTC、WOFF 或 WOFF2 字体文件");
  if (!file.size) throw new Error("字体文件为空，请重新选择");
  if (file.size > MAX_LOCAL_FONT_BYTES) throw new Error("字体文件不能超过 50MB");
  const assetId = `font-${crypto.randomUUID()}`;
  try {
    const face = new FontFace(getLocalFontFamily(assetId), await file.arrayBuffer());
    await face.load();
  } catch {
    throw new Error("无法加载这个字体文件，请选择有效的字体文件");
  }
  // Invalid fonts never enter persistent storage or replace the saved selection.
  await saveAssetBlob("fonts", assetId, file);
  cacheBlob(assetId, Promise.resolve(file));
  const basename = file.name.split(/[\\/]/).pop() ?? file.name;
  return { assetId, name: basename.replace(/\.(ttf|otf|ttc|woff2?)$/i, "").slice(0, 80).trim() || "本机字体" };
}

export function loadLocalFontBlob(assetId: string): Promise<Blob> {
  getLocalFontFamily(assetId);
  const cached = loadedBlobs.get(assetId);
  if (cached) return cached;
  const promise = loadAssetBlob("fonts", assetId).then(blob => {
    if (!blob) throw new Error("所选本机字体已丢失，请重新选择字体文件");
    return blob;
  }).catch(error => {
    if (loadedBlobs.get(assetId) === promise) loadedBlobs.delete(assetId);
    throw error;
  });
  return cacheBlob(assetId, promise);
}
