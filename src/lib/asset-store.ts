const DATABASE_NAME = "site-hub-assets";
const DATABASE_VERSION = 2;
type AssetStore = "wallpapers" | "fonts";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of ["wallpapers", "fonts"]) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("无法打开本地资源存储"));
  });
}

export async function saveAssetBlob(store: AssetStore, id: string, blob: Blob): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(store, "readwrite");
      transaction.objectStore(store).put(blob, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error ?? new Error(store === "wallpapers" ? "无法保存壁纸" : "无法保存字体"));
    });
  } finally {
    database.close();
  }
}

export async function loadAssetBlob(store: AssetStore, id: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const transaction = database.transaction(store, "readonly");
      const request = transaction.objectStore(store).get(id);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined);
      request.onerror = transaction.onerror = transaction.onabort = () =>
        reject(request.error ?? transaction.error ?? new Error(store === "wallpapers" ? "无法读取壁纸" : "无法读取字体"));
    });
  } finally {
    database.close();
  }
}
