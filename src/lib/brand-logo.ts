export const MAX_BRAND_LOGO_BYTES = 5 * 1024 * 1024;
export const MAX_BRAND_LOGO_DATA_URL_LENGTH = 1024 * 1024;
export const BRAND_LOGO_MAX_EDGE = 512;

const supportedTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export function isHttpImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isBrandLogoDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_BRAND_LOGO_DATA_URL_LENGTH &&
    /^data:image\/webp;base64,[a-z0-9+/]+=*$/i.test(value)
  );
}

function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("无法压缩这张 Logo 图片"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("无法读取这张 Logo 图片"));
        reader.onerror = () => reject(new Error("无法读取这张 Logo 图片"));
        reader.readAsDataURL(blob);
      },
      "image/webp",
      0.9,
    );
  });
}

type DecodedLogo = {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodeLogo(file: File): Promise<DecodedLogo> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Some Chromium/WebView builds reject SVG files in createImageBitmap.
      // The ordinary image decoder is still able to render those files safely.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = "async";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("无法解码这张 Logo 图片"));
      element.src = objectUrl;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function prepareBrandLogo(file: File): Promise<string> {
  if (file.size > MAX_BRAND_LOGO_BYTES) {
    throw new Error("Logo 图片不能超过 5MB");
  }
  if (!supportedTypes.has(file.type)) {
    throw new Error("请选择 PNG、JPG、WebP 或 SVG 图片");
  }

  const decoded = await decodeLogo(file);
  const scale = Math.min(
    1,
    BRAND_LOGO_MAX_EDGE / Math.max(decoded.width, decoded.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(decoded.width * scale));
  canvas.height = Math.max(1, Math.round(decoded.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    decoded.release();
    throw new Error("浏览器无法处理这张 Logo 图片");
  }
  context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
  decoded.release();
  const dataUrl = await canvasToDataUrl(canvas);
  if (!isBrandLogoDataUrl(dataUrl)) {
    throw new Error("压缩后的 Logo 图片仍然过大");
  }
  return dataUrl;
}
