import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { getBundledBrandIcon } from "../lib/brand-icons";
import {
  isBrowserFaviconPlaceholder,
  isBrowserFaviconUrl,
} from "../lib/browser-favicon-placeholder";
import {
  getFaviconCandidates,
  getSiteInitial,
  resolveSiteIconSource,
} from "../lib/site-utils";
import type { SiteItem } from "../types";

interface FaviconProps {
  site: Pick<SiteItem, "name" | "url" | "customIconUrl" | "iconSource">;
  size?: "normal" | "large";
}

type FaviconResolution =
  | { kind: "image"; source: string }
  | { kind: "brand" }
  | { kind: "letter" };

const MAX_CACHED_FAVICONS = 256;
const MIN_AUTOMATIC_FAVICON_SIZE = 64;
const faviconResolutionCache = new Map<string, FaviconResolution>();

interface LowResolutionCandidate {
  index: number;
  source: string;
  size: number;
}

function rememberResolution(key: string, resolution: FaviconResolution) {
  if (
    !faviconResolutionCache.has(key) &&
    faviconResolutionCache.size >= MAX_CACHED_FAVICONS
  ) {
    const oldestKey = faviconResolutionCache.keys().next().value;
    if (oldestKey) faviconResolutionCache.delete(oldestKey);
  }
  faviconResolutionCache.set(key, resolution);
}

function getCachedImageIndex(
  key: string,
  sources: readonly string[],
): number | undefined {
  const cached = faviconResolutionCache.get(key);
  if (cached?.kind !== "image") return undefined;
  const index = sources.indexOf(cached.source);
  return index >= 0 ? index : undefined;
}

/** @internal Exposed only so component tests can isolate the page-level cache. */
export function clearFaviconResolutionCache() {
  faviconResolutionCache.clear();
}

export function Favicon({ site, size = "normal" }: FaviconProps) {
  const preferredSource = resolveSiteIconSource(site);
  const bundledIcon = useMemo(
    () => getBundledBrandIcon(site.url),
    [site.url],
  );
  const sources = useMemo(
    () => getFaviconCandidates(site),
    [site.customIconUrl, site.iconSource, site.name, site.url],
  );
  const sourceKey = `${preferredSource}|${sources.join("|")}`;
  const cachedResolution = faviconResolutionCache.get(sourceKey);
  const cachedImageIndex = getCachedImageIndex(sourceKey, sources);
  const [sourceIndex, setSourceIndex] = useState(cachedImageIndex ?? 0);
  const [failed, setFailed] = useState(
    cachedResolution?.kind === "brand" ||
      cachedResolution?.kind === "letter",
  );
  const [loaded, setLoaded] = useState(cachedImageIndex !== undefined);
  const bestLowResolution = useRef<LowResolutionCandidate | null>(null);
  const acceptedLowResolutionSource = useRef<string | null>(null);
  const source = sources[sourceIndex];
  const currentSource = useRef(source);
  currentSource.current = source;

  useEffect(() => {
    const resolution = faviconResolutionCache.get(sourceKey);
    const imageIndex = getCachedImageIndex(sourceKey, sources);
    setSourceIndex(imageIndex ?? 0);
    setFailed(
      resolution?.kind === "brand" || resolution?.kind === "letter",
    );
    setLoaded(imageIndex !== undefined);
    bestLowResolution.current = null;
    acceptedLowResolutionSource.current = null;
    // `sourceKey` represents the complete candidate list. The memoized
    // `sources` value changes whenever that key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  function showNextSourceOrFallback() {
    setLoaded(false);
    if (sourceIndex < sources.length - 1) {
      setSourceIndex((current) => current + 1);
      return;
    }

    if (!bundledIcon && bestLowResolution.current) {
      const fallback = bestLowResolution.current;
      acceptedLowResolutionSource.current = fallback.source;
      if (fallback.index === sourceIndex) {
        rememberResolution(sourceKey, {
          kind: "image",
          source: fallback.source,
        });
        setLoaded(true);
      } else {
        setSourceIndex(fallback.index);
      }
      return;
    }

    rememberResolution(sourceKey, {
      kind: bundledIcon ? "brand" : "letter",
    });
    setFailed(true);
  }

  function handleError() {
    showNextSourceOrFallback();
  }

  function acceptLoadedImage(image: HTMLImageElement, loadedSource: string) {
    if (currentSource.current !== loadedSource) return;
    const naturalSize = Math.max(image.naturalWidth, image.naturalHeight);
    const isCustomSource = Boolean(
      site.customIconUrl && loadedSource === site.customIconUrl,
    );
    const isExplicitSource =
      preferredSource !== "auto" &&
      preferredSource !== "brand" &&
      sourceIndex === 0;
    const isAcceptedLowResolution =
      acceptedLowResolutionSource.current === loadedSource;
    const resolutionUnavailable = naturalSize === 0;

    if (
      !isCustomSource &&
      !isExplicitSource &&
      !isAcceptedLowResolution &&
      !resolutionUnavailable &&
      naturalSize < MIN_AUTOMATIC_FAVICON_SIZE
    ) {
      if (
        !bestLowResolution.current ||
        naturalSize > bestLowResolution.current.size
      ) {
        bestLowResolution.current = {
          index: sourceIndex,
          source: loadedSource,
          size: naturalSize,
        };
      }
      showNextSourceOrFallback();
      return;
    }

    rememberResolution(sourceKey, { kind: "image", source: loadedSource });
    setLoaded(true);
  }

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    const loadedSource = source;
    const shouldVerifyBrowserResult =
      preferredSource === "auto" && isBrowserFaviconUrl(loadedSource);

    if (!shouldVerifyBrowserResult) {
      acceptLoadedImage(image, loadedSource);
      return;
    }

    void isBrowserFaviconPlaceholder(image, loadedSource).then(
      (isPlaceholder) => {
        if (currentSource.current !== loadedSource) return;
        if (isPlaceholder) {
          showNextSourceOrFallback();
          return;
        }
        acceptLoadedImage(image, loadedSource);
      },
      () => {
        if (currentSource.current === loadedSource) {
          showNextSourceOrFallback();
        }
      },
    );
  }

  if (preferredSource === "brand" && bundledIcon) {
    return (
      <span
        className={`favicon-frame favicon-brand favicon-${size}`}
        aria-hidden="true"
        data-testid="favicon-selected-brand"
      >
        <svg viewBox="0 0 24 24" role="presentation">
          <path d={bundledIcon.path} fill={`#${bundledIcon.hex}`} />
        </svg>
      </span>
    );
  }

  if (failed && bundledIcon) {
    return (
      <span
        className={`favicon-frame favicon-brand favicon-${size}`}
        aria-hidden="true"
        data-testid="favicon-brand-fallback"
      >
        <svg viewBox="0 0 24 24" role="presentation">
          <path d={bundledIcon.path} fill={`#${bundledIcon.hex}`} />
        </svg>
      </span>
    );
  }

  if (failed) {
    return (
      <span
        className={`favicon-fallback favicon-${size}`}
        aria-hidden="true"
        data-testid="favicon-fallback"
      >
        {getSiteInitial(site.name, site.url)}
      </span>
    );
  }

  return (
    <span className={`favicon-frame favicon-${size}`} aria-hidden="true">
      {!loaded && (
        <span className="favicon-letter">
          {getSiteInitial(site.name, site.url)}
        </span>
      )}
      <img
        key={source}
        className={loaded ? "is-loaded" : ""}
        src={source}
        alt=""
        width={size === "large" ? 48 : 32}
        height={size === "large" ? 48 : 32}
        draggable={false}
        loading="eager"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={handleError}
      />
    </span>
  );
}
