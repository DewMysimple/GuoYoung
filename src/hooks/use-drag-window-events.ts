import { useEffect, useRef } from "react";
import { useLatestEvent } from "./use-latest-event";

/** Shared sensor lifecycle for website and group sorting, including pending gestures. */
export function useDragWindowEvents(options: {
  isActive: () => boolean;
  onMove: (x: number, y: number) => void;
  onCancel: () => void;
}) {
  const releasing = useRef(false);
  const move = useLatestEvent((x: number, y: number) => {
    if (options.isActive()) options.onMove(x, y);
  });
  const cancel = useLatestEvent(() => {
    if (releasing.current || !options.isActive()) return;
    // Clear the intent before releasing the sensor: synthetic mouseup cannot commit.
    releasing.current = true;
    try {
      options.onCancel();
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      document.dispatchEvent(new Event("touchcancel", { bubbles: true }));
    } finally {
      releasing.current = false;
    }
  });
  useEffect(() => {
    const pointer = (event: MouseEvent) => move(event.clientX, event.clientY);
    const touch = (event: TouchEvent) => {
      const point = event.touches[0];
      if (point) move(point.clientX, point.clientY);
    };
    const visibility = () => { if (document.visibilityState === "hidden") cancel(); };
    // TouchSensor follows touch events. Browsers can cancel its compatibility
    // pointer stream while that touch is still alive; only touchcancel ends it.
    const pointerCancel = (event: PointerEvent) => { if (event.pointerType !== "touch") cancel(); };
    window.addEventListener("pointermove", pointer, true);
    window.addEventListener("mousemove", pointer, true);
    window.addEventListener("touchmove", touch, { capture: true, passive: true });
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("touchcancel", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointermove", pointer, true);
      window.removeEventListener("mousemove", pointer, true);
      window.removeEventListener("touchmove", touch, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("touchcancel", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [move, cancel]);
  return cancel;
}
