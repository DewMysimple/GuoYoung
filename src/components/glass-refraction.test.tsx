import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createLensMap } from "../lib/glass-lens";
import { GlassRefraction } from "./glass-refraction";
import { SOURCE_UPDATED } from "./wallpaper-source";

vi.mock("../lib/glass-lens", () => ({
  createLensMap: vi.fn((width: number, height: number) => `data:image/png;base64,map-${width}-${height}`),
}));

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
  vi.mocked(createLensMap).mockClear();
});

it("reuses the normal card lens at shared overscan offsets without moving native lenses or remeasuring cards", () => {
  const dimensions = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(160);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(140);
  document.documentElement.style.setProperty("--wallpaper-card-spread", "72px");
  const readSpread = vi.spyOn(document.documentElement.style, "getPropertyValue");
  const view = render(<div className="app-shell">
    <main><article className="site-card" /><div className="github-home-entry" /><input className="search-input" /></main>
    <GlassRefraction strength={12} cardRadius={16} searchRadius={12} />
  </div>);
  const native = view.container.querySelector('#wallpaper-glass-lens feImage')!;
  const source = view.container.querySelector('#wallpaper-glass-card-source feImage')!;
  expect(view.container.querySelectorAll("filter")).toHaveLength(4);
  expect(source.getAttribute("href")).toBe(native.getAttribute("href"));
  expect(source.getAttribute("width")).toBe("160");
  expect(source.getAttribute("height")).toBe("140");
  expect(source.getAttribute("x")).toBe("72");
  expect(source.getAttribute("y")).toBe("72");
  expect(native.getAttribute("x")).toBe("0");
  expect(view.container.querySelector('#wallpaper-glass-card-source feDisplacementMap')).toHaveAttribute("in", "SourceGraphic");
  expect(createLensMap).toHaveBeenCalledTimes(3);
  const reads = dimensions.mock.calls.length;

  document.documentElement.style.setProperty("--wallpaper-card-spread", "90.5px");
  act(() => { window.dispatchEvent(new Event(SOURCE_UPDATED)); });
  expect(source.getAttribute("x")).toBe("90.5");
  expect(source.getAttribute("y")).toBe("90.5");
  expect(native.getAttribute("x")).toBe("0");
  expect(createLensMap).toHaveBeenCalledTimes(3);
  expect(dimensions).toHaveBeenCalledTimes(reads);

  view.unmount();
  const sourceReads = readSpread.mock.calls.length;
  window.dispatchEvent(new Event(SOURCE_UPDATED));
  expect(readSpread).toHaveBeenCalledTimes(sourceReads);
});
