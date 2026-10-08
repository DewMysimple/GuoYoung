import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ResizeHandle } from "./resize-handle";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.classList.remove("resizing-x", "resizing-y");
});

function pointer(target: HTMLElement, type: string, coordinates: { x: number; y: number }, id = 7) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1,
    clientX: coordinates.x, clientY: coordinates.y });
  Object.defineProperty(event, "pointerId", { value: id });
  fireEvent(target, event);
}

function mount(overrides: Partial<ComponentProps<typeof ResizeHandle>> = {}) {
  const changed = vi.fn(), committed = vi.fn(), cancelled = vi.fn();
  const props = { label: "分隔线", axis: "x" as const, value: 440, min: 360, max: 760, defaultValue: 440, ...overrides };
  function Controlled() {
    const [value, setValue] = useState(props.value);
    return <ResizeHandle {...props} value={value} onChange={next => { changed(next); setValue(next); }}
      onCommit={committed} onCancel={cancelled} />;
  }
  render(<Controlled />);
  return { handle: screen.getByRole("separator", { name: "分隔线" }), changed, committed, cancelled };
}

it.each([1.25, 1.5])("converts sidebar physical deltas to logical width exactly once at scale %s", coordinateScale => {
  const { handle, changed, committed, cancelled } = mount({ coordinateScale, direction: -1 });
  const captured = vi.fn(), released = vi.fn();
  Object.defineProperties(handle, {
    setPointerCapture: { value: captured }, hasPointerCapture: { value: () => true }, releasePointerCapture: { value: released },
  });
  pointer(handle, "pointerdown", { x: 800, y: 100 });
  expect(captured).toHaveBeenCalledExactlyOnceWith(7);
  expect(document.documentElement).toHaveClass("resizing-x");
  pointer(handle, "pointermove", { x: 800 - 40 * coordinateScale, y: 300 });
  expect(changed).toHaveBeenLastCalledWith(480);
  expect(handle).toHaveAttribute("aria-valuenow", "480");
  pointer(handle, "pointermove", { x: 800 - 80 * coordinateScale, y: 300 });
  expect(changed).toHaveBeenLastCalledWith(520);
  pointer(handle, "pointerup", { x: 800 - 80 * coordinateScale, y: 300 });
  expect(committed).toHaveBeenCalledExactlyOnceWith(520);
  expect(cancelled).not.toHaveBeenCalled();
  expect(released).toHaveBeenCalledExactlyOnceWith(7);
  expect(document.documentElement).not.toHaveClass("resizing-x");
  pointer(handle, "pointermove", { x: 0, y: 300 });
  pointer(handle, "pointerup", { x: 0, y: 300 });
  expect(committed).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledTimes(3);
});

it.each([1.25, 1.5])("converts topbar vertical deltas without scaling the logical bounds at scale %s", coordinateScale => {
  const { handle, changed, committed } = mount({ axis: "y", value: 64, min: 44, max: 120, defaultValue: 64, coordinateScale });
  pointer(handle, "pointerdown", { x: 100, y: 200 });
  pointer(handle, "pointermove", { x: 700, y: 200 + 12 * coordinateScale });
  expect(changed).toHaveBeenLastCalledWith(76);
  expect(handle).toHaveAttribute("aria-valuenow", "76");
  pointer(handle, "pointermove", { x: 700, y: 200 + 100 * coordinateScale });
  expect(changed).toHaveBeenLastCalledWith(120);
  pointer(handle, "pointerup", { x: 700, y: 200 + 100 * coordinateScale });
  expect(committed).toHaveBeenCalledExactlyOnceWith(120);
});

it.each([1.25, 1.5])("restores the original logical value on pointer cancellation at scale %s", coordinateScale => {
  const { handle, changed, committed, cancelled } = mount({ coordinateScale, direction: -1 });
  pointer(handle, "pointerdown", { x: 800, y: 100 });
  pointer(handle, "pointermove", { x: 800 - 40 * coordinateScale, y: 100 });
  expect(handle).toHaveAttribute("aria-valuenow", "480");
  pointer(handle, "pointercancel", { x: 800 - 40 * coordinateScale, y: 100 });
  expect(changed.mock.calls.map(([value]) => value)).toEqual([480, 440]);
  expect(handle).toHaveAttribute("aria-valuenow", "440");
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(committed).not.toHaveBeenCalled();
  pointer(handle, "pointerup", { x: 800 - 40 * coordinateScale, y: 100 });
  expect(changed).toHaveBeenCalledTimes(2);
  expect(document.documentElement).not.toHaveClass("resizing-x");
});

it.each([1.25, 1.5])("keeps keyboard increments and resets in logical units at scale %s", coordinateScale => {
  const { handle, changed, committed } = mount({ coordinateScale, direction: -1, step: 4 });
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(handle).toHaveAttribute("aria-valuenow", "444");
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  fireEvent.keyDown(handle, { key: "Home" });
  fireEvent.keyDown(handle, { key: "End" });
  fireEvent.doubleClick(handle);
  expect(changed.mock.calls.map(([value]) => value)).toEqual([444, 440, 360, 760, 440]);
  expect(committed.mock.calls).toEqual(changed.mock.calls);
});

it.each([1.25, 1.5])("keeps vertical keyboard steps logical and ignores the other axis at scale %s", coordinateScale => {
  const { handle, changed, committed } = mount({ axis: "y", value: 64, min: 44, max: 120, defaultValue: 64, coordinateScale });
  fireEvent.keyDown(handle, { key: "ArrowDown" });
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(changed.mock.calls.map(([value]) => value)).toEqual([68, 64]);
  expect(committed.mock.calls).toEqual(changed.mock.calls);
});

it("cancels once on Escape before a surrounding dialog sees it", () => {
  const { handle, changed, committed, cancelled } = mount({ coordinateScale: 1.5, direction: -1 });
  const outerEscape = vi.fn();
  document.addEventListener("keydown", outerEscape, true);
  try {
    pointer(handle, "pointerdown", { x: 800, y: 100 });
    pointer(handle, "pointermove", { x: 740, y: 100 });
    fireEvent.keyDown(handle, { key: "Escape" });
    expect(changed.mock.calls.map(([value]) => value)).toEqual([480, 440]);
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(committed).not.toHaveBeenCalled();
    expect(outerEscape).not.toHaveBeenCalled();
    fireEvent.keyDown(handle, { key: "Escape" });
    expect(outerEscape).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalledTimes(1);
  } finally { document.removeEventListener("keydown", outerEscape, true); }
});

it("ignores another pointer and restores logical geometry once when the window loses focus", () => {
  const { handle, changed, committed, cancelled } = mount({ coordinateScale: 1.5 });
  pointer(handle, "pointerdown", { x: 200, y: 100 });
  pointer(handle, "pointermove", { x: 800, y: 100 }, 8);
  pointer(handle, "pointerup", { x: 800, y: 100 }, 8);
  expect(changed).not.toHaveBeenCalled();
  pointer(handle, "pointermove", { x: 260, y: 100 });
  fireEvent(window, new Event("blur"));
  expect(changed.mock.calls.map(([value]) => value)).toEqual([480, 440]);
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(committed).not.toHaveBeenCalled();
  fireEvent(window, new Event("pagehide"));
  pointer(handle, "pointerup", { x: 260, y: 100 });
  expect(cancelled).toHaveBeenCalledTimes(1);
});
