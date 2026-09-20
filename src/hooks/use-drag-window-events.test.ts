import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDragWindowEvents } from "./use-drag-window-events";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("native listeners use the latest selection and workspace after rerender", () => {
  const move = vi.fn();
  const cancel = vi.fn();
  const { rerender } = renderHook(({ active, workspace, selected }) => useDragWindowEvents({
    isActive: () => active,
    onMove: (x, y) => move(workspace, selected, x, y),
    onCancel: () => cancel(workspace, selected),
  }), { initialProps: { active: false, workspace: "main", selected: [] as string[] } });
  act(() => window.dispatchEvent(new MouseEvent("pointermove", { clientX: 10, clientY: 20 })));
  expect(move).not.toHaveBeenCalled();
  rerender({ active: true, workspace: "github", selected: ["new-group"] });
  act(() => window.dispatchEvent(new MouseEvent("pointermove", { clientX: 30, clientY: 40 })));
  expect(move).toHaveBeenLastCalledWith("github", ["new-group"], 30, 40);
  act(() => window.dispatchEvent(new Event("blur")));
  expect(cancel).toHaveBeenLastCalledWith("github", ["new-group"]);
});

it.each(["blur", "pagehide", "pointercancel"])("%s clears the intent before releasing sensors and removes listeners on unmount", (eventName) => {
  let active = true;
  const calls: string[] = [];
  const release = () => calls.push(active ? "stale-commit" : "sensor-release");
  document.addEventListener("mouseup", release);
  const { unmount } = renderHook(() => useDragWindowEvents({
    isActive: () => active,
    onMove: vi.fn(),
    onCancel: () => { calls.push("cancel"); active = false; },
  }));
  act(() => window.dispatchEvent(new Event(eventName)));
  expect(calls).toEqual(["cancel", "sensor-release"]);
  unmount(); active = true;
  window.dispatchEvent(new Event(eventName));
  expect(calls).toHaveLength(2);
  document.removeEventListener("mouseup", release);
});

it("does not recursively cancel a pending sensor before React commits its cleared state", () => {
  const cancel = vi.fn();
  renderHook(() => useDragWindowEvents({ isActive: () => true, onMove: vi.fn(), onCancel: cancel }));
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("lets TouchSensor follow its touch stream until touchcancel", () => {
  const cancel = vi.fn();
  renderHook(() => useDragWindowEvents({ isActive: () => true, onMove: vi.fn(), onCancel: cancel }));
  const compatibilityEvent = new Event("pointercancel");
  Object.defineProperty(compatibilityEvent, "pointerType", { value: "touch" });
  act(() => window.dispatchEvent(compatibilityEvent));
  expect(cancel).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new Event("touchcancel")));
  expect(cancel).toHaveBeenCalledTimes(1);
});
