import { createLensMap } from "./glass-lens";
import type { MaterialBindings, MaterialMeasurement, MaterialMeasurements, MaterialTarget, WallpaperFrame } from "./wallpaper-material-measurements";

const namespace = "http://www.w3.org/2000/svg";
function node(tag: string, attributes: Record<string, string | number>) {
  const element = document.createElementNS(namespace, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

interface Profile { id: string; element: Element; padding: number; width: number; height: number }
interface Surface extends MaterialTarget { filter: Element; id: string; key: string; profileKey: string }

export interface MaterialResources extends MaterialBindings {
  apply(frame: WallpaperFrame, measurements: MaterialMeasurements): void;
  dispose(): void;
}

/** Owns SVG resources and CSS bindings. Never reads computed styles or layout. */
export function createMaterialResources(
  svg: SVGSVGElement,
  source: string,
  onBind: (element: HTMLElement) => void,
  onUnbind: (element: HTMLElement) => void,
): MaterialResources {
  const definitions = node("defs", {});
  svg.append(definitions);
  const own = new Map<HTMLElement, Surface>(), before = new Map<HTMLElement, Surface>();
  const profiles = new Map<string, Profile>();
  let sequence = 0;
  const targets = function* () { yield* own.values(); yield* before.values(); };
  const has = (element: HTMLElement, pseudo?: boolean) => pseudo === undefined
    ? own.has(element) || before.has(element) : (pseudo ? before : own).has(element);

  function remove({ element, pseudo }: MaterialTarget) {
    const map = pseudo ? before : own, surface = map.get(element);
    if (!surface) return;
    element.classList.remove(pseudo ? "wallpaper-material-before" : "wallpaper-material-own");
    element.style.removeProperty(pseudo ? "--wallpaper-material-before" : "--wallpaper-material-own");
    map.delete(element);
    if (!has(element)) onUnbind(element);
    surface.filter.remove();
  }

  function createProfile(frame: WallpaperFrame, blur: number, saturation: number): Profile {
    const padding = Math.max(96, Math.ceil((frame.blur + blur) * 3 + 40));
    const width = frame.viewportWidth + padding * 2, height = frame.viewportHeight + padding * 2;
    const id = `wallpaper-source-${sequence++}`, filterId = `${id}-blur`;
    const picture = node("svg", { id, width, height, viewBox: `${-padding} ${-padding} ${width} ${height}` });
    const effect = node("filter", { id: filterId, filterUnits: "userSpaceOnUse", x: -padding, y: -padding, width, height, "color-interpolation-filters": "sRGB" });
    effect.append(node("feGaussianBlur", { in: "SourceGraphic", stdDeviation: blur, edgeMode: "duplicate", result: "blurred" }),
      node("feColorMatrix", { in: "blurred", type: "saturate", values: saturation }));
    const content = node("g", { filter: `url(#${filterId})` });
    const canvas = { x: -padding, y: -padding, width, height };
    content.append(node("rect", { ...canvas, fill: "var(--page)" }),
      node("image", { href: source, x: frame.left, y: frame.top, width: frame.width, height: frame.height, preserveAspectRatio: "none", style: `filter:blur(${frame.blur}px)` }),
      node("rect", { ...canvas, fill: frame.overlay }));
    picture.append(effect, content); definitions.append(picture);
    return { id, element: picture, padding, width, height };
  }

  function applySurface(frame: WallpaperFrame, measurement: MaterialMeasurement) {
    const { element, pseudo, x, y, w, h, radius, blur, saturation, strength } = measurement;
    const map = pseudo ? before : own;
    let surface = map.get(element);
    const profileKey = `${frame.key}:${blur}:${saturation}`;
    let profile = profiles.get(profileKey);
    if (!profile) { profile = createProfile(frame, blur, saturation); profiles.set(profileKey, profile); }
    const key = JSON.stringify([profile.id, w, h, radius, strength]);
    if (!surface) {
      const id = `wallpaper-material-${sequence++}`;
      const filter = node("filter", { id, filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" });
      definitions.append(filter);
      surface = { element, pseudo, filter, id, key: "", profileKey };
      map.set(element, surface); onBind(element);
    }
    // Bindings may be cleared by a React className update independently of SVG
    // resource ownership. Reconcile them without rewriting unchanged values.
    const className = pseudo ? "wallpaper-material-before" : "wallpaper-material-own";
    const property = `--${className}`, value = `url(#${surface.id})`;
    if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
    if (!element.classList.contains(className)) element.classList.add(className);
    if (surface.key !== key) {
      const margin = Math.max(96, Math.ceil((frame.blur + blur) * 3 + strength));
      const filter = surface.filter;
      for (const [name, value] of Object.entries({ x: -margin, y: -margin, width: w + 2 * margin, height: h + 2 * margin })) filter.setAttribute(name, String(value));
      filter.replaceChildren(node("feImage", { href: `#${profile.id}`, x: -profile.padding - x, y: -profile.padding - y, width: profile.width, height: profile.height, preserveAspectRatio: "none", result: "colored" }));
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
    surface.profileKey = profileKey;
    // Scrolling changes the origin only, preserving the graph and lens/mask.
    const input = surface.filter.firstElementChild!;
    const inputX = String(-profile.padding - x), inputY = String(-profile.padding - y);
    if (input.getAttribute("x") !== inputX) input.setAttribute("x", inputX);
    if (input.getAttribute("y") !== inputY) input.setAttribute("y", inputY);
  }

  return {
    has, targets,
    apply(frame, measurements) {
      for (const target of measurements.removals) remove(target);
      for (const measurement of measurements.surfaces) applySurface(frame, measurement);
      // Visibility controls measurement, not ownership. Offscreen or temporarily
      // unmeasured surfaces must keep their source until updated or unbound.
      const referenced = new Set(Array.from(targets(), surface => surface.profileKey));
      for (const [key, profile] of profiles) if (!referenced.has(key)) {
        profile.element.remove(); profiles.delete(key);
      }
    },
    dispose() {
      for (const target of [...targets()]) remove(target);
      profiles.clear(); definitions.remove();
    },
  };
}
