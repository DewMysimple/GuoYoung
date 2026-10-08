import { useEffect, useRef, type HTMLAttributes } from "react";
import { useLatestEvent } from "./use-latest-event";

type Point = { x: number; y: number };
type Sweep = {
  pointerId: number;
  start: Point;
  previous: Point;
  startId: string;
  active: boolean;
  insideId: string | null;
};

// Testing the segment also catches items crossed between fast pointer events.
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

/** Shared pointer gesture; callers retain ownership of their selection state. */
export function useSweepSelection({ enabled, itemSelector, idAttribute, ignoreSelector, onToggle }: {
  enabled: boolean;
  itemSelector: string;
  idAttribute: string;
  ignoreSelector?: string;
  onToggle: (ids: readonly string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sweep = useRef<Sweep | null>(null);
  const suppressClick = useRef(false);
  const toggle = useLatestEvent(onToggle);

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
        ids.push(session.startId);
      }
      const hits: { id: string; distance: number }[] = [];
      for (const item of containerRef.current?.querySelectorAll<HTMLElement>(itemSelector) ?? []) {
        const id = item.getAttribute(idAttribute);
        // Moving within an item or leaving it is one continuous visit.
        // Once outside, entering it again toggles it in this same press.
        if (!id || id === session.insideId) continue;
        const point = intersectSelectionPath(session.previous, current, item.getBoundingClientRect());
        if (!point || document.elementFromPoint(point.x, point.y)?.closest(itemSelector) !== item) continue;
        hits.push({ id, distance: Math.hypot(point.x - session.previous.x, point.y - session.previous.y) });
      }
      ids.push(...hits.sort((a, b) => a.distance - b.distance).map(hit => hit.id));
      session.previous = current;
      const inside = document.elementFromPoint(current.x, current.y)?.closest(itemSelector);
      session.insideId = inside && containerRef.current?.contains(inside) ? inside.getAttribute(idAttribute) : null;
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
  }, [enabled, itemSelector, idAttribute, toggle]);

  const handlers: HTMLAttributes<HTMLDivElement> = {
    onPointerDownCapture(event) {
      suppressClick.current = false;
      sweep.current = null;
      if (!enabled || event.button !== 0 || event.pointerType === "touch" || event.shiftKey) return;
      const target = event.target as Element;
      const item = target.closest<HTMLElement>(itemSelector);
      const id = item?.getAttribute(idAttribute);
      if (!item || !id || !containerRef.current?.contains(item) || (ignoreSelector && target.closest(ignoreSelector))) return;
      const point = { x: event.clientX, y: event.clientY };
      sweep.current = { pointerId: event.pointerId, start: point, previous: point,
        startId: id, active: false, insideId: id };
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
