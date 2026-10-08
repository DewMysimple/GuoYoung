import { useEffect, useRef, type HTMLAttributes } from "react";
import { useLatestEvent } from "./use-latest-event";

type Point = { x: number; y: number };
type Sweep = {
  pointerId: number;
  start: Point;
  previous: Point;
  startId: string;
  active: boolean;
  visited: Set<string>;
};

// Return a point on the part of the actual pointer segment inside the card.
// Testing the segment also catches cards crossed between fast pointer events.
export function intersectSelectionPath(from: Point, to: Point, rect: DOMRect): Point | null {
  let enter = 0, exit = 1;
  for (const [start, delta, min, max] of [
    [from.x, to.x - from.x, rect.left, rect.right],
    [from.y, to.y - from.y, rect.top, rect.bottom],
  ]) {
    if (delta === 0) {
      if (start < min || start > max) return null;
    } else {
      const first = (min - start) / delta, last = (max - start) / delta;
      enter = Math.max(enter, Math.min(first, last));
      exit = Math.min(exit, Math.max(first, last));
      if (enter > exit) return null;
    }
  }
  const middle = (enter + exit) / 2;
  return { x: from.x + (to.x - from.x) * middle, y: from.y + (to.y - from.y) * middle };
}

/** One pointer session over the collection, sharing the existing selection reducer. */
export function useSiteSweepSelection(enabled: boolean, toggleSites: (ids: readonly string[]) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sweep = useRef<Sweep | null>(null);
  const suppressClick = useRef(false);
  const toggle = useLatestEvent(toggleSites);

  useEffect(() => {
    if (!enabled) return;
    function move(event: PointerEvent) {
      const session = sweep.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (!(event.buttons & 1)) { sweep.current = null; return; }
      const current = { x: event.clientX, y: event.clientY };
      if (!session.active && Math.hypot(current.x - session.start.x, current.y - session.start.y) < 6) return;
      const ids: string[] = [];
      if (!session.active) {
        session.active = true;
        suppressClick.current = true;
        session.visited.add(session.startId);
        ids.push(session.startId);
      }
      const hits: { id: string; distance: number }[] = [];
      for (const card of containerRef.current?.querySelectorAll<HTMLElement>("[data-site-dnd-id]") ?? []) {
        const id = card.dataset.siteDndId!;
        if (session.visited.has(id)) continue;
        const point = intersectSelectionPath(session.previous, current, card.getBoundingClientRect());
        // Occluded cards (for example behind the sticky topbar) are not touched.
        if (!point || document.elementFromPoint(point.x, point.y)?.closest("[data-site-dnd-id]") !== card) continue;
        session.visited.add(id);
        hits.push({ id, distance: Math.hypot(point.x - session.previous.x, point.y - session.previous.y) });
      }
      ids.push(...hits.sort((a, b) => a.distance - b.distance).map(hit => hit.id));
      session.previous = current;
      if (ids.length) toggle(ids);
      event.preventDefault();
    }
    function finish(event: PointerEvent) {
      if (sweep.current?.pointerId === event.pointerId) sweep.current = null;
    }
    function cancel() { sweep.current = null; }
    function visibility() { if (document.hidden) cancel(); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") cancel(); }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancel();
      suppressClick.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, toggle]);

  const handlers: HTMLAttributes<HTMLDivElement> = {
    onPointerDownCapture(event) {
      suppressClick.current = false;
      sweep.current = null;
      if (!enabled || event.button !== 0 || event.pointerType === "touch" || event.shiftKey) return;
      const target = event.target as Element;
      const card = target.closest<HTMLElement>("[data-site-dnd-id]");
      if (!card || target.closest(".card-actions")) return;
      const point = { x: event.clientX, y: event.clientY };
      sweep.current = { pointerId: event.pointerId, start: point, previous: point,
        startId: card.dataset.siteDndId!, active: false, visited: new Set() };
    },
    onClickCapture(event) {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
  return { containerRef, handlers };
}
