import { useLayoutEffect, useRef } from "react";
import { createLensMap } from "../lib/glass-lens";

const namespace = "http://www.w3.org/2000/svg";
function node(tag: string, attributes: Record<string, string | number>) {
  const element = document.createElementNS(namespace, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

type Surface = { element: HTMLElement; pseudo: boolean; filter: Element; id: string; key: string };

/** Wallpaper materials have an explicit image input. Hovering a sibling must
 * not change the pixels sampled by another surface's blur. Foreground content,
 * borders and shadows remain SourceGraphic; drag transforms remain on hosts. */
export function WallpaperMaterial({ source }: { source: string }) {
  const reference = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const svg = reference.current;
    const root = svg?.closest<HTMLElement>(".app-shell");
    const image = root?.querySelector<HTMLImageElement>(".wallpaper-layer img");
    if (!svg || !root || !image) return;
    const definitions = node("defs", {});
    svg.append(definitions);
    const surfaces: Surface[] = [];
    const own = new Map<HTMLElement, Surface>();
    const before = new Map<HTMLElement, Surface>();
    const profiles = new Map<string, { id: string; element: Element; padding: number; width: number; height: number }>();
    let sequence = 0, frame = 0, animateUntil = 0, disposed = false;
    const refresh = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    };
    const observe = () => {
      changes.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
      changes.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    };
    const remove = (surface: Surface) => {
      surface.element.classList.remove(surface.pseudo ? "wallpaper-material-before" : "wallpaper-material-own");
      surface.element.style.removeProperty(surface.pseudo ? "--wallpaper-material-before" : "--wallpaper-material-own");
      (surface.pseudo ? before : own).delete(surface.element);
      if (!before.has(surface.element) && !own.has(surface.element)) resize.unobserve(surface.element);
      surface.filter.remove();
      surfaces.splice(surfaces.indexOf(surface), 1);
    };
    const resize = new ResizeObserver(refresh);
    const changes = new MutationObserver(records => {
      if (records.every(record => svg.contains(record.target))) return;
      animateUntil = performance.now() + 250;
      refresh();
    });
    function measure() {
      frame = 0;
      if (disposed || !image!.complete || !image!.naturalWidth) return;
      changes.disconnect();
      const img = image!;
      const box = img.getBoundingClientRect(), imageStyle = getComputedStyle(img);
      const fit = imageStyle.objectFit === "contain" ? Math.min : Math.max;
      const scale = fit(box.width / img.naturalWidth, box.height / img.naturalHeight);
      const width = img.naturalWidth * scale, height = img.naturalHeight * scale;
      const position = imageStyle.objectPosition.split(" ").map(value => parseFloat(value) / 100);
      const left = box.x + (box.width - width) * position[0];
      const top = box.y + (box.height - height) * (position[1] ?? position[0]);
      const wallpaperBlur = parseFloat(imageStyle.filter.match(/blur\(([^)]+)/)?.[1] ?? "0");
      const overlay = getComputedStyle(root!.querySelector(".wallpaper-layer span")!).backgroundColor;
      const usedProfiles = new Set<string>();
      for (const surface of [...surfaces]) if (!surface.element.isConnected) remove(surface);
      for (const element of root!.querySelectorAll<HTMLElement>("*")) {
        if (!(element instanceof HTMLElement) || element.closest(".wallpaper-layer")) continue;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom < -100 || rect.top > innerHeight + 100) continue;
        for (const pseudo of [false, true]) {
          const map = pseudo ? before : own;
          let surface = map.get(element);
          const style = getComputedStyle(element, pseudo ? "::before" : null);
          if (pseudo && style.content === "none") continue;
          // Chromium drops fragment-backed SVG filters on a directly promoted
          // host. During a control's actual sorting transform retain its native
          // glass; stationary siblings still use their independent image input.
          // Cards keep their image filter on the untransformed pseudo-element.
          if (!pseudo && (style.transform !== "none" || /(?:transform|opacity)/.test(style.willChange))) {
            if (surface) remove(surface);
            continue;
          }
          const material = surface ? style.getPropertyValue("--wallpaper-material-input").trim() : style.backdropFilter;
          if (!material || material === "none") { if (surface) remove(surface); continue; }
          const border = pseudo ? getComputedStyle(element) : null;
          const x = rect.x + (border ? parseFloat(border.borderLeftWidth) : 0);
          const y = rect.y + (border ? parseFloat(border.borderTopWidth) : 0);
          const w = pseudo ? parseFloat(style.width) || element.clientWidth : rect.width;
          const h = pseudo ? parseFloat(style.height) || element.clientHeight : rect.height;
          const radius = parseFloat(style.borderTopLeftRadius) || 0;
          const blur = parseFloat(material.match(/blur\(([^)]+)/)?.[1] ?? "0");
          const saturationText = material.match(/saturate\(([^)]+)/)?.[1] ?? "1";
          const saturation = parseFloat(saturationText) / (saturationText.includes("%") ? 100 : 1);
          const lensId = material.match(/url\([^)]*#([^"')]+)/)?.[1];
          const strength = lensId ? Number(document.getElementById(lensId)?.querySelector("feDisplacementMap")?.getAttribute("scale") ?? 0) : 0;
          // Blur each wallpaper profile once. Per-surface graphs only position
          // that image, refract its rim, and composite the unchanged foreground.
          const profileKey = JSON.stringify([source, left, top, width, height, innerWidth, innerHeight, wallpaperBlur, overlay, blur, saturation]);
          usedProfiles.add(profileKey);
          let profile = profiles.get(profileKey);
          if (!profile) {
            const padding = Math.max(96, Math.ceil((wallpaperBlur + blur) * 3 + 40));
            const profileWidth = innerWidth + padding * 2, profileHeight = innerHeight + padding * 2;
            const id = `wallpaper-source-${sequence++}`, filterId = `${id}-blur`;
            const picture = node("svg", { id, width: profileWidth, height: profileHeight, viewBox: `${-padding} ${-padding} ${profileWidth} ${profileHeight}` });
            const effect = node("filter", { id: filterId, filterUnits: "userSpaceOnUse", x: -padding, y: -padding, width: profileWidth, height: profileHeight, "color-interpolation-filters": "sRGB" });
            effect.append(node("feGaussianBlur", { in: "SourceGraphic", stdDeviation: blur, edgeMode: "duplicate", result: "blurred" }),
              node("feColorMatrix", { in: "blurred", type: "saturate", values: saturation }));
            const content = node("g", { filter: `url(#${filterId})` });
            const canvas = { x: -padding, y: -padding, width: profileWidth, height: profileHeight };
            content.append(node("rect", { ...canvas, fill: "var(--page)" }),
              node("image", { href: source, x: left, y: top, width, height, preserveAspectRatio: "none", style: `filter:blur(${wallpaperBlur}px)` }),
              node("rect", { ...canvas, fill: overlay }));
            picture.append(effect, content); definitions.append(picture);
            profile = { id, element: picture, padding, width: profileWidth, height: profileHeight };
            profiles.set(profileKey, profile);
          }
          const key = JSON.stringify([profile.id, x, y, w, h, radius, strength]);
          if (!surface) {
            const id = `wallpaper-material-${sequence++}`;
            const filter = node("filter", { id, filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" });
            definitions.append(filter);
            surface = { element, pseudo, filter, id, key: "" };
            surfaces.push(surface); map.set(element, surface); resize.observe(element);
          }
          if (surface.key !== key) {
            const margin = Math.max(96, Math.ceil((wallpaperBlur + blur) * 3 + strength));
            const filter = surface.filter;
            for (const [name, value] of Object.entries({ x: -margin, y: -margin, width: w + 2 * margin, height: h + 2 * margin })) filter.setAttribute(name, String(value));
            filter.replaceChildren(
              node("feImage", { href: `#${profile.id}`, x: -profile.padding - x, y: -profile.padding - y, width: profile.width, height: profile.height, preserveAspectRatio: "none", result: "colored" }),
            );
            let input = "colored";
            const lens = strength ? createLensMap(w, h, radius) : undefined;
            if (lens) {
              filter.append(node("feImage", { href: lens, x: 0, y: 0, width: w, height: h, preserveAspectRatio: "none", result: "lens" }),
                node("feDisplacementMap", { in: input, in2: "lens", scale: strength, xChannelSelector: "R", yChannelSelector: "G", result: "refracted" }));
              input = "refracted";
            }
            const mask = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="${namespace}" width="${w}" height="${h}"><rect width="100%" height="100%" rx="${radius}" fill="white"/></svg>`);
            filter.append(node("feImage", { href: mask, x: 0, y: 0, width: w, height: h, preserveAspectRatio: "none", result: "mask" }),
              node("feComposite", { in: input, in2: "mask", operator: "in", result: "glass" }),
              node("feComposite", { in: "SourceGraphic", in2: "glass", operator: "over" }));
            surface.key = key;
          }
          element.style.setProperty(pseudo ? "--wallpaper-material-before" : "--wallpaper-material-own", `url(#${surface.id})`);
          element.classList.add(pseudo ? "wallpaper-material-before" : "wallpaper-material-own");
        }
      }
      for (const [key, profile] of profiles) if (!usedProfiles.has(key)) {
        profile.element.remove(); profiles.delete(key);
      }
      observe();
      if (performance.now() < animateUntil) refresh();
    }
    const transition = () => { animateUntil = performance.now() + 300; refresh(); };
    const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
    transparency.addEventListener("change", refresh);
    resize.observe(root); resize.observe(image);
    observe();
    image.addEventListener("load", refresh);
    document.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    root.addEventListener("transitionrun", transition);
    root.addEventListener("transitionend", refresh);
    root.addEventListener("pointerover", transition);
    root.addEventListener("pointerout", transition);
    refresh();
    return () => {
      disposed = true; cancelAnimationFrame(frame); changes.disconnect(); resize.disconnect();
      transparency.removeEventListener("change", refresh);
      image.removeEventListener("load", refresh);
      document.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
      root.removeEventListener("transitionrun", transition);
      root.removeEventListener("transitionend", refresh);
      root.removeEventListener("pointerover", transition);
      root.removeEventListener("pointerout", transition);
      for (const surface of [...surfaces]) remove(surface);
      definitions.remove();
    };
  }, [source]);
  return <svg ref={reference} width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute", pointerEvents: "none" }} />;
}
