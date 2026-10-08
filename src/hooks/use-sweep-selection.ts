import { useEffect, useRef, type HTMLAttributes } from "react";
import { useLatestEvent } from "./use-latest-event";

type Point = { x: number; y: number };
type Clip = { rect: DOMRect; x: boolean; y: boolean };
type Sweep = {
  pointerId: number;
  start: Point;
  previous: Point;
  startId: string;
  active: boolean;
  insideId: string | null;
  lastItem: { id: string; center: Point };
  direction: Point | null;
  turn: { point: Point; id: string | null };
};

const GESTURE_DISTANCE = 6;
const containsPoint = (rect: DOMRect, point: Point) =>
  point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
const project = (from: Point, to: Point, direction: Point) =>
  (to.x - from.x) * direction.x + (to.y - from.y) * direction.y;

/** Rectangle used by both visits and continuity, clipped to visible content. */
function visibleSelectionRect(item: HTMLElement, clips: Map<Element, Clip>): DOMRect {
  const rect = item.getBoundingClientRect();
  let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
  let right = Math.min(window.innerWidth, rect.right), bottom = Math.min(window.innerHeight, rect.bottom);
  for (let parent = item.parentElement; parent; parent = parent.parentElement) {
    let clip = clips.get(parent);
    if (!clip) {
      const style = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      clip = { rect: new DOMRect(bounds.left + parent.clientLeft, bounds.top + parent.clientTop, parent.clientWidth, parent.clientHeight),
        x: /^(auto|scroll|hidden|clip)$/.test(style.overflowX || style.overflow), y: /^(auto|scroll|hidden|clip)$/.test(style.overflowY || style.overflow) };
      clips.set(parent, clip);
    }
    if (clip.x) { left = Math.max(left, clip.rect.left); right = Math.min(right, clip.rect.right); }
    if (clip.y) { top = Math.max(top, clip.rect.top); bottom = Math.min(bottom, clip.rect.bottom); }
  }
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

// Testing the segment also catches items crossed between fast pointer events.
export function intersectSelectionPath(from: Point, to: Point, rect: DOMRect): Point | null {
  let enter = 0, exit = 1;
  for (const [start, delta, min, max] of [
    [from.x, to.x - from.x, rect.left, rect.right],
    [from.y, to.y - from.y, rect.top, rect.bottom],
  ]) {
    if (delta === 0) {
      if (start <= min || start >= max) return null;
    } else {
      const first = (min - start) / delta, last = (max - start) / delta;
      enter = Math.max(enter, Math.min(first, last));
      exit = Math.min(exit, Math.max(first, last));
      // Merely touching a boundary is not another visit to the item.
      if (enter >= exit) return null;
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
    function advance(session: Sweep, current: Point) {
      if (current.x === session.previous.x && current.y === session.previous.y) return;
      if (!session.active && Math.hypot(current.x - session.start.x, current.y - session.start.y) < GESTURE_DISTANCE) return;
      const ids: string[] = [];
      if (!session.active) {
        session.active = true;
        suppressClick.current = true;
        ids.push(session.startId);
      }
      // A cross-item trajectory establishes direction. Accumulate the retreat
      // from its furthest point so slow turns and fast turns behave alike.
      // The turning item belongs to the return visit even if the pointer never
      // leaves it; movement confined to a single item establishes no direction.
      const retreat = session.direction ? -project(session.turn.point, current, session.direction) : 0;
      const sideways = session.direction ? Math.abs(project(session.turn.point, current, { x: -session.direction.y, y: session.direction.x })) : 0;
      if (session.direction && retreat >= GESTURE_DISTANCE && retreat >= sideways) {
        if (session.turn.id) ids.push(session.turn.id);
        session.direction = null;
      }
      const hits: { id: string; rect: DOMRect; distance: number }[] = [];
      const clips = new Map<Element, Clip>();
      for (const item of containerRef.current?.querySelectorAll<HTMLElement>(itemSelector) ?? []) {
        const id = item.getAttribute(idAttribute);
        if (!id) continue;
        const rect = visibleSelectionRect(item, clips);
        if (!rect.width || !rect.height) continue;
        const point = intersectSelectionPath(session.previous, current, rect);
        if (!point) continue;
        const visible = document.elementFromPoint(point.x, point.y);
        // Sweep bounds are rectangular, including rounded corners. An ancestor
        // behind a transparent corner is visible; an unrelated overlay is not.
        if (!visible || (!item.contains(visible) && !visible.contains(item))) continue;
        hits.push({ id, rect, distance: Math.hypot(point.x - session.previous.x, point.y - session.previous.y) });
      }
      let changedDirection = false;
      for (const hit of hits.sort((a, b) => a.distance - b.distance)) {
        if (hit.id === session.insideId || ids.includes(hit.id)) continue;
        ids.push(hit.id);
        const center = { x: hit.rect.x + hit.rect.width / 2, y: hit.rect.y + hit.rect.height / 2 };
        if (hit.id !== session.lastItem.id) {
          // Item-to-item direction is independent of event density and the
          // final approach through a rounded corner or a gap above the item.
          const x = center.x - session.lastItem.center.x, y = center.y - session.lastItem.center.y;
          const length = Math.hypot(x, y);
          session.direction = length ? { x: x / length, y: y / length } : null;
          changedDirection = true;
        }
        session.lastItem = { id: hit.id, center };
      }
      // Use the same confirmed geometric hit for both entry and continuity.
      // CSS hit slop must never mark an item visited before it was toggled.
      session.insideId = hits.find(hit => containsPoint(hit.rect, current))?.id ?? null;
      const progress = session.direction ? project(session.turn.point, current, session.direction) : 0;
      const lateral = session.direction ? Math.abs(project(session.turn.point, current, { x: -session.direction.y, y: session.direction.x })) : 0;
      // A sideways departure moves the turn point too. Otherwise a later move
      // outside the item could incorrectly reverse an old visit to that item.
      if (changedDirection || !session.direction || progress >= 0 || (lateral >= GESTURE_DISTANCE && lateral > Math.abs(progress))) {
        session.turn = { point: current, id: session.insideId };
      }
      session.previous = current;
      if (ids.length) toggle(ids);
    }
    function move(event: PointerEvent) {
      const session = sweep.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (!(event.buttons & 1)) { sweep.current = null; return; }
      // Keep real intermediate paths, including turns within one browser event.
      // Dispatch each step separately: selection owners deduplicate each batch.
      for (const sample of event.getCoalescedEvents?.() ?? []) advance(session, { x: sample.clientX, y: sample.clientY });
      advance(session, { x: event.clientX, y: event.clientY });
      if (!session.active) return;
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
      const rect = item.getBoundingClientRect();
      sweep.current = { pointerId: event.pointerId, start: point, previous: point,
        startId: id, active: false, insideId: id,
        lastItem: { id, center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } }, direction: null,
        turn: { point, id } };
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
