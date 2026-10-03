export interface MaterialTarget { readonly element: HTMLElement; readonly pseudo: boolean }

/** Read-only view of bindings; candidate eligibility is independent of binding. */
export interface MaterialBindings {
  has(element: HTMLElement, pseudo?: boolean): boolean;
  targets(): Iterable<MaterialTarget>;
}

export type WallpaperFrame = Readonly<{
  key: string;
  left: number; top: number; width: number; height: number;
  viewportWidth: number; viewportHeight: number;
  blur: number; overlay: string;
}>;

export type MaterialMeasurement = Readonly<MaterialTarget & {
  x: number; y: number; w: number; h: number; radius: number;
  blur: number; saturation: number; strength: number;
}>;

export interface MaterialMeasurements {
  readonly surfaces: readonly MaterialMeasurement[];
  readonly removals: readonly MaterialTarget[];
}

function materialInput(style: CSSStyleDeclaration) {
  return style.getPropertyValue("--wallpaper-material-input").trim();
}

function declaresMaterial(style: CSSStyleDeclaration) {
  const input = materialInput(style);
  return !!input && input !== "none";
}

/** This module only reads the live document. Apply its snapshot in a later phase. */
export function readWallpaperFrame(root: HTMLElement, image: HTMLImageElement): WallpaperFrame {
  const box = image.getBoundingClientRect(), style = getComputedStyle(image);
  const fit = style.objectFit === "contain" ? Math.min : Math.max;
  const scale = fit(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  const position = style.objectPosition.split(" ").map(value => parseFloat(value) / 100);
  const left = box.x + (box.width - width) * position[0];
  const top = box.y + (box.height - height) * (position[1] ?? position[0]);
  const transform = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
  // CSS filters run before the wallpaper's uniform zoom transform. The SVG
  // source uses screen coordinates, so its blur must include that same scale.
  const blur = parseFloat(style.filter.match(/blur\(([^)]+)/)?.[1] ?? "0") * Math.hypot(transform.a, transform.b);
  const overlay = getComputedStyle(root.querySelector(".wallpaper-layer span")!).backgroundColor;
  const viewportWidth = innerWidth, viewportHeight = innerHeight;
  // The resource owner is scoped to one source. Never serialize its potentially
  // large startup data URL into every surface's cache key.
  const key = JSON.stringify([left, top, width, height, viewportWidth, viewportHeight, blur, overlay]);
  return { key, left, top, width, height, viewportWidth, viewportHeight, blur, overlay };
}

export function discoverMaterialCandidates(root: HTMLElement, bindings: MaterialBindings): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("*")).filter(element => {
    if (!(element instanceof HTMLElement) || element.closest(".wallpaper-layer")) return false;
    // CSS registers this property as non-inherited. A native backdrop without
    // this explicit local declaration is not eligible for managed sampling.
    return bindings.has(element) || declaresMaterial(getComputedStyle(element))
      || declaresMaterial(getComputedStyle(element, "::before"));
  });
}

export function readMaterialMeasurements(
  frame: WallpaperFrame,
  candidates: readonly HTMLElement[],
  bindings: MaterialBindings,
  moving?: readonly HTMLElement[],
): MaterialMeasurements {
  const removals = Array.from(bindings.targets()).filter(target => !target.element.isConnected);
  const surfaces: MaterialMeasurement[] = [];
  for (const element of candidates) {
    if (!element.isConnected || (moving && !moving.some(target => target.contains(element)))) continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom < -100 || rect.top > frame.viewportHeight + 100) continue;
    for (const pseudo of [false, true]) {
      const bound = bindings.has(element, pseudo);
      const style = getComputedStyle(element, pseudo ? "::before" : null);
      if (pseudo && style.content === "none") continue;
      // Chromium drops fragment-backed SVG filters on a directly promoted host.
      // Native glass handles moving controls; cards keep the filter on ::before.
      if (!pseudo && (style.transform !== "none" || /(?:transform|opacity)/.test(style.willChange))) {
        if (bound) removals.push({ element, pseudo });
        continue;
      }
      const material = materialInput(style);
      if (!material || material === "none") { if (bound) removals.push({ element, pseudo }); continue; }
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
      surfaces.push({ element, pseudo, x, y, w, h, radius, blur, saturation, strength });
    }
  }
  return { surfaces, removals };
}
