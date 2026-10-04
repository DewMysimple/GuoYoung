import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createLensMap } from "../lib/glass-lens";
import { GlassRefraction } from "./glass-refraction";

vi.mock("../lib/glass-lens", () => ({
  createLensMap: vi.fn((width: number, height: number) => `data:image/png;base64,map-${width}-${height}`),
}));

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
  vi.mocked(createLensMap).mockClear();
});

it("keeps only shared native backdrop lens maps and never samples wallpaper", () => {
  const dimensions = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(160);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(140);
  const view = render(<div className="app-shell">
    <main><article className="site-card" /><div className="github-home-entry" /><input className="search-input" /></main>
    <GlassRefraction strength={12} cardRadius={16} searchRadius={12} />
  </div>);
  expect(view.container.querySelectorAll("filter")).toHaveLength(3);
  expect(view.container.querySelector('#wallpaper-glass-card-source')).toBeNull();
  for (const lens of view.container.querySelectorAll("filter feImage")) {
    expect(lens).toHaveAttribute("href", "data:image/png;base64,map-160-140");
    expect(lens).toHaveAttribute("width", "160");
    expect(lens).toHaveAttribute("height", "140");
    expect(lens).toHaveAttribute("x", "0");
    expect(lens).toHaveAttribute("y", "0");
  }
  for (const displacement of view.container.querySelectorAll("feDisplacementMap")) {
    expect(displacement).toHaveAttribute("in", "SourceGraphic");
    expect(displacement).toHaveAttribute("in2", "lens");
    expect(displacement).toHaveAttribute("scale", "12");
  }
  expect(createLensMap).toHaveBeenCalledTimes(3);
  const reads = dimensions.mock.calls.length;
  act(() => { window.dispatchEvent(new Event("scroll")); });
  expect(createLensMap).toHaveBeenCalledTimes(3);
  expect(dimensions).toHaveBeenCalledTimes(reads);
});
