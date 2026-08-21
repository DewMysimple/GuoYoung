const PLACEHOLDER_PAGE_URL = "https://site-hub-favicon-placeholder.invalid/";
const SAMPLE_SIZE = 32;

const placeholderFingerprintCache = new Map<string, Promise<string | undefined>>();

function parseBrowserFaviconUrl(source: string): URL | undefined {
  try {
    const url = new URL(source);
    if (url.protocol !== "chrome-extension:" || url.pathname !== "/_favicon/") {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

export function isBrowserFaviconUrl(source: string): boolean {
  return Boolean(parseBrowserFaviconUrl(source));
}

function fingerprintImage(image: HTMLImageElement): string | undefined {
  if (!image.naturalWidth || !image.naturalHeight) return undefined;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;

    context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const pixels = context.getImageData(
      0,
      0,
      SAMPLE_SIZE,
      SAMPLE_SIZE,
    ).data;

    // FNV-1a provides a small, deterministic fingerprint after both images
    // have been normalized to the same dimensions.
    let hash = 0x811c9dc5;
    for (let index = 0; index < pixels.length; index += 1) {
      hash ^= pixels[index];
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  } catch {
    // If Chromium ever prevents reading the internal image, the browser
    // result is considered unverified and the caller will try the website.
    return undefined;
  }
}

function loadFingerprint(source: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(fingerprintImage(image));
    image.onerror = () => resolve(undefined);
    image.src = source;
  });
}

function getPlaceholderFingerprint(source: string): Promise<string | undefined> {
  const faviconUrl = parseBrowserFaviconUrl(source);
  if (!faviconUrl) return Promise.resolve(undefined);

  faviconUrl.searchParams.set("pageUrl", PLACEHOLDER_PAGE_URL);
  const cacheKey = `${faviconUrl.origin}|${faviconUrl.searchParams.get("size") ?? ""}`;
  const cached = placeholderFingerprintCache.get(cacheKey);
  if (cached) return cached;

  const fingerprint = loadFingerprint(faviconUrl.toString());
  placeholderFingerprintCache.set(cacheKey, fingerprint);
  return fingerprint;
}

/**
 * Chromium's `_favicon` endpoint returns a browser-specific generic page or
 * globe image when its local database has no icon. That response still loads
 * successfully, so compare it with a guaranteed cache miss before accepting
 * it as a real site favicon.
 *
 * `true` also covers an unverified result. Falling through to the site's own
 * favicon is safer than showing the same generic globe on many cards.
 */
export async function isBrowserFaviconPlaceholder(
  image: HTMLImageElement,
  source: string,
): Promise<boolean> {
  if (!isBrowserFaviconUrl(source)) return false;

  const [candidateFingerprint, placeholderFingerprint] = await Promise.all([
    Promise.resolve(fingerprintImage(image)),
    getPlaceholderFingerprint(source),
  ]);

  if (!candidateFingerprint || !placeholderFingerprint) return true;
  return candidateFingerprint === placeholderFingerprint;
}

/** @internal Used by tests and when an extension is hot-reloaded. */
export function clearBrowserFaviconPlaceholderCache() {
  placeholderFingerprintCache.clear();
}
