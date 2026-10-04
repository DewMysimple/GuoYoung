import { useLayoutEffect } from "react";
import { wallpaperSourceGeometry } from "../lib/wallpaper-source-geometry";

const SOURCE_CHANGE = "mysimple:wallpaper-source-change";
export const SOURCE_UPDATED = "mysimple:wallpaper-source-updated";
const SOURCE_PROPERTIES = [
  "--wallpaper-source-image", "--wallpaper-source-left", "--wallpaper-source-top",
  "--wallpaper-source-width", "--wallpaper-source-height", "--wallpaper-source-blur",
  "--wallpaper-card-blur", "--wallpaper-card-spread",
  "--wallpaper-source-filter", "--wallpaper-card-filter",
] as const;
const SOURCE_TRANSITIONS = new Set(["object-position", "transform", "filter"]);

/** Explicit notification after a settings/gesture owner writes wallpaper CSS. */
export function refreshWallpaperSource() {
  window.dispatchEvent(new Event(SOURCE_CHANGE));
}

/** One decoded image supplies native fit/zoom/transition geometry to the
 * visible wallpaper and cards, which share the same CSS background renderer.
 * No card discovery,
 * scroll subscriptions, image encoding or ownership of drag transforms. */
export function WallpaperSource({ source, glassBlur, glassSaturation = 100, glassRefraction = false }: {
  source: string; glassBlur: number; glassSaturation?: number; glassRefraction?: boolean;
}) {
  useLayoutEffect(() => {
    const image = document.querySelector<HTMLImageElement>(".app-shell .wallpaper-layer img");
    if (!image) return;
    const root = document.documentElement;
    const cssSource = `url("${source.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
      .replace(/[\n\r\f]/g, character => `\\${character.charCodeAt(0).toString(16)} `)}")`;
    let frame = 0, disposed = false;
    let previous: readonly string[] = [];
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    };
    function measure() {
      frame = 0;
      if (disposed || !image!.complete || !image!.naturalWidth) return;
      // Finish all source reads before publishing any of the shared variables.
      const box = image!.getBoundingClientRect(), style = getComputedStyle(image!);
      const position = style.objectPosition.split(" ").map(value => parseFloat(value) / 100);
      const transform = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
      const geometry = wallpaperSourceGeometry({
        box, naturalWidth: image!.naturalWidth, naturalHeight: image!.naturalHeight,
        fit: style.objectFit === "contain" ? "contain" : "cover",
        positionX: position[0], positionY: position[1] ?? position[0],
        transformScale: Math.hypot(transform.a, transform.b),
        wallpaperBlur: parseFloat(style.filter.match(/blur\(([^)]+)/)?.[1] ?? "0"), glassBlur,
        pixelRatio: window.devicePixelRatio,
      });
      const transitioning = image!.getAnimations?.().some(animation =>
        "transitionProperty" in animation && SOURCE_TRANSITIONS.has(String(animation.transitionProperty))
        && (animation.playState === "running" || animation.pending));
      if (geometry) {
        const saturation = glassSaturation === 100 ? "" : `saturate(${glassSaturation / 100})`;
        const frostedFilter = saturation
          ? `${geometry.cardFilter === "none" ? "" : `${geometry.cardFilter} `}${saturation}`
          : geometry.cardFilter;
        const refraction = 'url("#wallpaper-glass-card-source")';
        const cardFilter = glassRefraction
          ? `${frostedFilter === "none" ? "" : `${frostedFilter} `}${refraction}` : frostedFilter;
        const values = [cssSource, ...[geometry.left, geometry.top, geometry.width,
          geometry.height, geometry.blur, geometry.cardBlur, geometry.spread].map(value => `${value}px`),
          geometry.sourceFilter, cardFilter];
        let changed = false;
        SOURCE_PROPERTIES.forEach((property, index) => {
          if (values[index] !== previous[index]) {
            root.style.setProperty(property, values[index]);
            changed = true;
          }
        });
        previous = values;
        if (changed) window.dispatchEvent(new Event(SOURCE_UPDATED));
      }
      if (transitioning) schedule();
    }
    const transition = (event: TransitionEvent) => {
      if (event.target === image && SOURCE_TRANSITIONS.has(event.propertyName)) schedule();
    };
    image.addEventListener("load", schedule);
    image.addEventListener("transitionrun", transition);
    image.addEventListener("transitionend", transition);
    image.addEventListener("transitioncancel", transition);
    window.addEventListener("resize", schedule);
    window.addEventListener(SOURCE_CHANGE, schedule);
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      image.removeEventListener("load", schedule);
      image.removeEventListener("transitionrun", transition);
      image.removeEventListener("transitionend", transition);
      image.removeEventListener("transitioncancel", transition);
      window.removeEventListener("resize", schedule);
      window.removeEventListener(SOURCE_CHANGE, schedule);
      for (const property of SOURCE_PROPERTIES) root.style.removeProperty(property);
    };
  }, [source, glassBlur, glassSaturation, glassRefraction]);
  return null;
}
