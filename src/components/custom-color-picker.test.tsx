import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CustomColorPicker } from "./custom-color-picker";

let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  frames = new Map();
  let nextFrame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function drawFrame() {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(0));
  });
}
function pointer(target: Element | Window, type: string, x = 0, y = 0, extra: { pointerId?: number; buttons?: number; button?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, ...extra });
  Object.defineProperties(event, { pointerId: { value: extra.pointerId ?? 1 }, pointerType: { value: "mouse" }, isPrimary: { value: true } });
  fireEvent(target, event);
}
function open() {
  fireEvent.click(screen.getByRole("button", { name: "自定义强调色" }));
  const area = screen.getByRole("slider", { name: "颜色饱和度和亮度" });
  const bounds = vi.spyOn(area, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
  const hue = screen.getByRole("slider", { name: "色相" }) as HTMLInputElement;
  return { area, hue, bounds };
}
function capture(control: Element) {
  let captured = false;
  vi.spyOn(control, "setPointerCapture").mockImplementation(() => { captured = true; });
  vi.spyOn(control, "hasPointerCapture").mockImplementation(() => captured);
  return vi.spyOn(control, "releasePointerCapture").mockImplementation(() => { captured = false; });
}

it("keeps pointer samples local, previews once per frame and commits the final release point once", () => {
  const changed = vi.fn(), preview = vi.fn(), parentRendered = vi.fn();
  const order: string[] = [];
  function Parent() {
    parentRendered();
    const [value, setValue] = useState("#ff0000");
    return <CustomColorPicker value={value} onChange={next => { changed(next); order.push(`commit:${next}`); setValue(next); }}
      onPreview={next => { preview(next); order.push(`preview:${next}`); }} />;
  }
  render(<Parent />);
  const { area, bounds } = open();
  const released = capture(area);
  pointer(area, "pointerdown", 20, 80);
  for (let i = 21; i <= 80; i++) pointer(area, "pointermove", i, 100 - i);
  expect(changed).not.toHaveBeenCalled();
  expect(preview).not.toHaveBeenCalled();
  expect(parentRendered).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(1);
  expect(bounds).toHaveBeenCalledTimes(1);
  drawFrame();
  expect(preview).toHaveBeenCalledExactlyOnceWith("#cc2929");
  expect(screen.getByLabelText("十六进制颜色")).toHaveValue("CC2929");
  expect(parentRendered).toHaveBeenCalledTimes(1);
  pointer(window, "pointerup", 90, 10);
  expect(changed).toHaveBeenCalledExactlyOnceWith("#e61717");
  expect(order.slice(-3)).toEqual(["preview:#e61717", "commit:#e61717", "preview:null"]);
  expect(parentRendered).toHaveBeenCalledTimes(2);
  expect(released).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("十六进制颜色")).toHaveValue("E61717");
  pointer(window, "pointerup", 10, 90);
  drawFrame();
  expect(changed).toHaveBeenCalledTimes(1);
});

it("keeps native hue movement local and flushes its final value before the pending frame", () => {
  const changed = vi.fn(), preview = vi.fn();
  render(<CustomColorPicker value="#ff0000" onChange={changed} onPreview={preview} />);
  const { hue } = open();
  const released = capture(hue);
  pointer(hue, "pointerdown");
  for (const value of [90, 120, 180]) fireEvent.change(hue, { target: { value } });
  expect(hue).toHaveValue("180");
  expect(changed).not.toHaveBeenCalled();
  drawFrame();
  expect(preview).toHaveBeenCalledExactlyOnceWith("#00ffff");
  fireEvent.change(hue, { target: { value: 210 } });
  pointer(window, "pointerup");
  expect(changed).toHaveBeenCalledExactlyOnceWith("#0080ff");
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(frames.size).toBe(0);
  expect(released).toHaveBeenCalledTimes(1);
});

it.each(["pointercancel", "lostpointercapture", "blur", "pagehide", "hidden", "Escape", "outside", "close", "unmount"])("cancels %s without committing and releases pending work", reason => {
  const changed = vi.fn(), preview = vi.fn();
  const view = render(<CustomColorPicker value="#ff0000" onChange={changed} onPreview={preview} />);
  const { area } = open();
  const released = capture(area);
  pointer(area, "pointerdown", 50, 50);
  drawFrame();
  expect(preview).toHaveBeenLastCalledWith("#804040");
  pointer(area, "pointermove", 70, 30);
  if (reason === "pointercancel") pointer(window, reason);
  else if (reason === "lostpointercapture") pointer(area, reason);
  else if (reason === "hidden") {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
  } else if (reason === "Escape") fireEvent.keyDown(area, { key: "Escape" });
  else if (reason === "outside") fireEvent.mouseDown(document.body);
  else if (reason === "close") fireEvent.click(screen.getByRole("button", { name: "自定义强调色" }));
  else if (reason === "unmount") view.unmount();
  else fireEvent(window, new Event(reason));
  expect(changed).not.toHaveBeenCalled();
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(frames.size).toBe(0);
  expect(released).toHaveBeenCalledTimes(1);
  pointer(window, "pointerup", 90, 10);
  drawFrame();
  expect(changed).not.toHaveBeenCalled();
  if (reason !== "unmount") expect(screen.getByRole("button", { name: "自定义强调色" })).toHaveStyle({ backgroundColor: "#ff0000" });
});

it("ignores other pointers and cancels when the active pointer loses its pressed button", () => {
  const changed = vi.fn(), preview = vi.fn();
  render(<CustomColorPicker value="#ff0000" onChange={changed} onPreview={preview} />);
  const { area } = open();
  const released = capture(area);
  pointer(area, "pointerdown", 50, 50, { button: 2 });
  expect(frames.size).toBe(0);
  pointer(area, "pointerdown", 50, 50);
  pointer(area, "pointerdown", 80, 20, { pointerId: 2 });
  pointer(area, "pointermove", 80, 20, { pointerId: 2 });
  pointer(window, "pointerup", 80, 20, { pointerId: 2 });
  drawFrame();
  expect(preview).toHaveBeenLastCalledWith("#804040");
  pointer(area, "pointermove", 80, 20, { buttons: 0 });
  expect(preview).toHaveBeenLastCalledWith(null);
  pointer(window, "pointerup", 80, 20);
  expect(changed).not.toHaveBeenCalled();
  expect(released).toHaveBeenCalledTimes(1);
});

it("lets an external value replace an active preview without a stale release overwriting it", () => {
  const changed = vi.fn(), preview = vi.fn();
  const view = render(<CustomColorPicker value="#ff0000" onChange={changed} onPreview={preview} />);
  const { area, hue } = open();
  const released = capture(area);
  pointer(area, "pointerdown", 50, 50);
  drawFrame();
  view.rerender(<CustomColorPicker value="#0000ff" onChange={changed} onPreview={preview} />);
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(hue).toHaveValue("240");
  expect(screen.getByLabelText("十六进制颜色")).toHaveValue("0000FF");
  pointer(window, "pointerup", 90, 10);
  expect(changed).not.toHaveBeenCalled();
  expect(released).toHaveBeenCalledTimes(1);
});

it("retains the chosen hue through grey and black values, including controlled commit echoes", () => {
  function Parent() {
    const [value, setValue] = useState("#808080");
    return <CustomColorPicker value={value} onChange={setValue} />;
  }
  render(<Parent />);
  const { area, hue } = open();
  fireEvent.change(hue, { target: { value: 120 } });
  expect(hue).toHaveValue("120");
  pointer(area, "pointerdown", 100, 0);
  pointer(window, "pointerup", 100, 0);
  expect(screen.getByLabelText("十六进制颜色")).toHaveValue("00FF00");
  const hex = screen.getByLabelText("十六进制颜色");
  fireEvent.change(hex, { target: { value: "000000" } });
  fireEvent.keyDown(hex, { key: "Enter" });
  fireEvent.change(hue, { target: { value: 180 } });
  expect(hue).toHaveValue("180");
  pointer(area, "pointerdown", 100, 0);
  pointer(window, "pointerup", 100, 0);
  expect(hex).toHaveValue("00FFFF");
});

it("commits keyboard and valid HEX edits directly, without double committing Enter followed by blur", () => {
  const changed = vi.fn(), preview = vi.fn();
  render(<CustomColorPicker value="#ff0000" onChange={changed} onPreview={preview} />);
  const { area, hue } = open();
  fireEvent.keyDown(area, { key: "ArrowLeft" });
  expect(changed).toHaveBeenLastCalledWith("#ff0505");
  fireEvent.change(hue, { target: { value: 120 } });
  expect(changed).toHaveBeenLastCalledWith("#05ff05");
  const hex = screen.getByLabelText("十六进制颜色");
  fireEvent.change(hex, { target: { value: "aBc123" } });
  fireEvent.keyDown(hex, { key: "Enter" });
  const calls = changed.mock.calls.length;
  fireEvent.blur(hex);
  expect(changed).toHaveBeenCalledTimes(calls);
  expect(changed).toHaveBeenLastCalledWith("#abc123");
  fireEvent.change(hex, { target: { value: "12" } });
  fireEvent.blur(hex);
  expect(hex).toHaveValue("ABC123");
  expect(changed).toHaveBeenCalledTimes(calls);
  expect(preview).not.toHaveBeenCalled();
});
