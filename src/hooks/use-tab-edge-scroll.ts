import { useEffect, useRef } from "react";
import { useLatestEvent } from "./use-latest-event";

const EDGE_ZONE = 56;
const MIN_SPEED = 4;
const MAX_SPEED = 18;

/** Both group sorting and site transfer use the same visible tab viewport. */
export function useTabEdgeScroll(isActive: () => boolean, onScroll: () => void) {
  const frame = useRef<number | null>(null);
  const pointerX = useRef<number | null>(null);
  const tick = useLatestEvent(() => {
    if (!isActive()) { frame.current = null; return; }
    const viewport = document.querySelector<HTMLElement>(".category-tabs");
    const x = pointerX.current;
    if (viewport && x !== null) {
      const rect = viewport.getBoundingClientRect();
      const depth = x >= rect.left && x < rect.left + EDGE_ZONE
        ? -(rect.left + EDGE_ZONE - x) / EDGE_ZONE
        : x <= rect.right && x > rect.right - EDGE_ZONE
          ? (x - rect.right + EDGE_ZONE) / EDGE_ZONE : 0;
      if (depth) {
        const before = viewport.scrollLeft;
        viewport.scrollLeft += Math.sign(depth) * (MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.min(1, Math.abs(depth)));
        if (before !== viewport.scrollLeft) onScroll();
      }
    }
    frame.current = window.requestAnimationFrame(tick);
  });
  function stop() {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    pointerX.current = null;
  }
  useEffect(() => stop, []);
  return {
    start: () => { if (frame.current === null) frame.current = window.requestAnimationFrame(tick); },
    stop,
    track: (x: number) => { pointerX.current = x; },
  };
}
