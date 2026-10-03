import { useLayoutEffect, useRef } from "react";
import { discoverMaterialCandidates, readMaterialMeasurements, readWallpaperFrame } from "../lib/wallpaper-material-measurements";
import { createMaterialResources } from "../lib/wallpaper-material-resources";
import { classifyMaterialMutation, scrollMovesMaterial } from "../lib/wallpaper-material-invalidation";

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
    let candidates: HTMLElement[] = [], discover = true;
    let frame = 0, animateUntil = 0, disposed = false, fullRefresh = true;
    const animated = new Set<HTMLElement>();
    const wallpaperTransitions = new Set<string>();
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    };
    const refresh = () => { fullRefresh = true; schedule(); };
    const observe = () => {
      changes.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
      changes.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    };
    const resize = new ResizeObserver(refresh);
    const resources = createMaterialResources(svg, source,
      element => resize.observe(element), element => resize.unobserve(element));
    const changes = new MutationObserver(records => {
      const reasons = records.map(record => classifyMaterialMutation(record, root, svg));
      if (reasons.every(reason => reason === "none")) return;
      if (reasons.includes("discover")) discover = true;
      refresh();
    });
    const scroll = (event: Event) => {
      if (scrollMovesMaterial(event.target, root, candidates)) refresh();
    };
    function measure() {
      frame = 0;
      if (disposed || !image!.complete || !image!.naturalWidth) return;
      changes.disconnect();
      const all = fullRefresh || discover || wallpaperTransitions.size > 0;
      fullRefresh = false;
      // The whole snapshot is read before the resource owner touches live SVG
      // or CSS. Candidate eligibility does not depend on current binding status.
      const wallpaper = readWallpaperFrame(root!, image!);
      if (discover) {
        candidates = discoverMaterialCandidates(root!, resources);
        discover = false;
      }
      const measurements = readMaterialMeasurements(wallpaper, candidates, resources,
        all ? undefined : Array.from(animated));
      resources.apply(wallpaper, measurements);
      observe();
      if (wallpaperTransitions.size || performance.now() < animateUntil) schedule();
      else animated.clear();
    }
    // Color/opacity hover feedback does not move the wallpaper sampling window.
    // Track only transitions that can change its geometry; direct drag style
    // writes already arrive through the mutation observer.
    const transition = (event: TransitionEvent) => {
      // The wallpaper itself changes the input of every surface, even though
      // it is not an ancestor of those surfaces. End/cancel also samples the
      // final value; observing its box cannot detect transform or filter changes.
      if (event.target === image && /^(object-position|transform|filter)$/.test(event.propertyName)) {
        if (event.type === "transitionrun") wallpaperTransitions.add(event.propertyName);
        else wallpaperTransitions.delete(event.propertyName);
        refresh();
        return;
      }
      if (!/^(transform|translate|scale|width|height|top|left|right|bottom|inset|padding|margin|gap|grid)/.test(event.propertyName)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (/^(transform|translate|scale)$/.test(event.propertyName)) {
        // A transformed own-surface temporarily uses native glass. Its return
        // transition must still be tracked after that managed surface is gone.
        if (!candidates.some(element => target.contains(element))) return;
        animated.add(target);
      } else { fullRefresh = true; animated.add(root); }
      animateUntil = performance.now() + 300;
      schedule();
    };
    const invalidate = () => { discover = true; refresh(); };
    const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
    transparency.addEventListener("change", invalidate);
    resize.observe(root); resize.observe(image);
    observe();
    image.addEventListener("load", refresh);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", invalidate);
    root.addEventListener("transitionrun", transition);
    root.addEventListener("transitionend", transition);
    root.addEventListener("transitioncancel", transition);
    refresh();
    return () => {
      disposed = true; cancelAnimationFrame(frame); changes.disconnect(); resize.disconnect();
      transparency.removeEventListener("change", invalidate);
      image.removeEventListener("load", refresh);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", invalidate);
      root.removeEventListener("transitionrun", transition);
      root.removeEventListener("transitionend", transition);
      root.removeEventListener("transitioncancel", transition);
      resources.dispose();
    };
  }, [source]);
  return <svg ref={reference} width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute", pointerEvents: "none" }} />;
}
