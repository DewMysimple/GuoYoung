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

export interface LogoEditOptions {
  shape: "original" | "circle" | "square" | "rectangle";
  crop: boolean;
  zoom: number;
  x: number;
  y: number;
}

export const DEFAULT_LOGO_EDIT: LogoEditOptions = { shape: "original", crop: false, zoom: 1, x: 50, y: 50 };

export function logoCropRect(width: number, height: number, options: LogoEditOptions) {
  const ratio = options.shape === "original" ? width / height : options.shape === "rectangle" ? 1.6 : 1;
  const zoom = Math.min(4, Math.max(1, options.zoom));
  const cropWidth = Math.min(width, height * ratio) / zoom;
  const cropHeight = cropWidth / ratio;
  return { x: (width - cropWidth) * Math.min(100, Math.max(0, options.x)) / 100,
    y: (height - cropHeight) * Math.min(100, Math.max(0, options.y)) / 100,
    width: cropWidth, height: cropHeight, ratio };
}

export function drawLogo(canvas: HTMLCanvasElement, image: CanvasImageSource, width: number, height: number, options: LogoEditOptions) {
  const rect = logoCropRect(width, height, options);
  canvas.width = Math.max(1, Math.round(BRAND_LOGO_MAX_EDGE * Math.min(1, rect.ratio)));
  canvas.height = Math.max(1, Math.round(BRAND_LOGO_MAX_EDGE / Math.max(1, rect.ratio)));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法处理这张 Logo 图片");
  if (options.crop) context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  else {
    const scale = Math.min(canvas.width / width, canvas.height / height);
    context.drawImage(image, (canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2, width * scale, height * scale);
  }
}

export async function prepareBrandLogo(file: File, options: LogoEditOptions = DEFAULT_LOGO_EDIT): Promise<string> {
  if (!supportedTypes.has(file.type)) {
    throw new Error("请选择 PNG、JPG、WebP 或 SVG 图片");
  }

  const decoded = await decodeLogo(file);
  const canvas = document.createElement("canvas");
  try {
    drawLogo(canvas, decoded.image, decoded.width, decoded.height, options);
  } finally {
    decoded.release();
  }
  const dataUrl = await canvasToDataUrl(canvas);
  if (!isBrandLogoDataUrl(dataUrl)) {
    throw new Error("压缩后的 Logo 图片仍然过大");
  }
  return dataUrl;
}
