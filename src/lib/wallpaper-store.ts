const DATABASE_NAME = "site-hub-assets";
const STORE_NAME = "wallpapers";
const DATABASE_VERSION = 1;
export const MAX_WALLPAPER_BYTES = 20 * 1024 * 1024;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("无法打开壁纸存储"));
  });
}

export async function saveWallpaperBlob(id: string, blob: Blob): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(blob, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("无法保存壁纸"));
  });
  database.close();
}

export async function loadWallpaperBlob(id: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  const result = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(id);
    request.onsuccess = () =>
      resolve(request.result instanceof Blob ? request.result : undefined);
    request.onerror = () =>
      reject(request.error ?? new Error("无法读取壁纸"));
  });
  database.close();
  return result;
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
  if (!context) {
    image.close();
    throw new Error("浏览器无法处理这张图片");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvasToBlob(canvas);
}
