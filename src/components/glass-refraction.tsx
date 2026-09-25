import { useLayoutEffect, useRef, useState } from "react";
import { createLensMap } from "../lib/glass-lens";

// CSS.supports(url()) also succeeds in engines without backdrop displacement.
export const supportsGlassRefraction = typeof navigator !== "undefined"
  && /Chrom(?:e|ium)\//.test(navigator.userAgent);

const surfaces = [
  { id: "wallpaper-glass-lens", selector: ".site-card:not(.is-dragging), .add-site-card" },
  { id: "wallpaper-glass-lens-wide", selector: ".github-home-entry" },
  { id: "wallpaper-glass-lens-search", selector: ".search-input" },
] as const;

/** Three shared maps measured from actual surfaces. One resize observer, no
 * per-card animation loop, screenshot duplication or transform ownership. */
export function GlassRefraction({ strength, cardRadius, searchRadius }: { strength: number; cardRadius: number; searchRadius: number }) {
  const [maps, setMaps] = useState<Record<string, { href: string; width: number; height: number }>>({});
  const svg = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const root = svg.current?.closest(".app-shell");
    const main = root?.querySelector("main");
    if (!root || !main) return;
    const geometry = new Map<string, string>();
    const observed = new Map<string, Element>();
    const measure = () => {
      const updates: typeof maps = {};
      for (const { id } of surfaces) {
        const element = observed.get(id);
        if (!element) continue;
        // Offset dimensions exclude hover and drag transforms.
        const width = (element as HTMLElement).offsetWidth, height = (element as HTMLElement).offsetHeight;
        const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
        const key = `${width}:${height}:${radius}`;
        if (!width || !height || geometry.get(id) === key) continue;
        geometry.set(id, key);
        const map = createLensMap(width, height, radius);
        if (map) updates[id] = { href: map, width, height };
      }
      if (Object.keys(updates).length) setMaps(current => ({ ...current, ...updates }));
    };
    const resize = new ResizeObserver(measure);
    const attach = () => {
      let changed = false;
      for (const { id, selector } of surfaces) {
        const element = main.querySelector(selector);
        const previous = observed.get(id);
        if (element === previous) continue;
        changed = true;
        if (previous) resize.unobserve(previous);
        if (element) { observed.set(id, element); resize.observe(element); }
        else observed.delete(id);
      }
      if (changed) measure();
    };
    attach();
    const changes = new MutationObserver(attach);
    changes.observe(main, { childList: true, subtree: true });
    return () => { resize.disconnect(); changes.disconnect(); };
  }, [cardRadius, searchRadius]);
  return <svg ref={svg} width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute", pointerEvents: "none" }}>
    <defs>{surfaces.map(({ id }) => <filter key={id} id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      {maps[id] && <>
        {/* Numeric primitive dimensions are essential inside a zero-size SVG.
            Percentage sizes resolve against that viewport and shift the whole
            backdrop instead of refracting only its rim. */}
        <feImage href={maps[id].href} x="0" y="0" width={maps[id].width} height={maps[id].height} preserveAspectRatio="none" result="lens" />
        <feDisplacementMap in="SourceGraphic" in2="lens" scale={strength} xChannelSelector="R" yChannelSelector="G" />
      </>}
    </filter>)}</defs>
  </svg>;
}
