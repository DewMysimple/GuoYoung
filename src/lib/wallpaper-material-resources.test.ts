import { afterEach, describe, expect, it, vi } from "vitest";
import { createMaterialResources } from "./wallpaper-material-resources";
import type { MaterialMeasurement, WallpaperFrame } from "./wallpaper-material-measurements";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

const frame: WallpaperFrame = { key: "initial-wallpaper", left: 0, top: 0, width: 1920, height: 1080,
  viewportWidth: 1920, viewportHeight: 1080, blur: 0, overlay: "rgba(0, 0, 0, 0)" };

function setup() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.append(svg);
  const bind = vi.fn(), unbind = vi.fn();
  const resources = createMaterialResources(svg, "data:image/png;base64,wallpaper-preview", bind, unbind);
  const card = (): MaterialMeasurement => {
    const element = document.createElement("article"); document.body.append(element);
    return { element, pseudo: true, x: 10, y: 20, w: 140, h: 124, radius: 12, blur: 24, saturation: 1, strength: 0 };
  };
  const filter = (measurement: MaterialMeasurement) => {
    const property = measurement.pseudo ? "--wallpaper-material-before" : "--wallpaper-material-own";
    const id = measurement.element.style.getPropertyValue(property).match(/#([^)]*)/)![1];
    return document.getElementById(id)!;
  };
  const profile = (measurement: MaterialMeasurement) => filter(measurement).firstElementChild!.getAttribute("href")!.slice(1);
  return { svg, resources, bind, unbind, card, filter, profile };
}

describe("wallpaper material resource ownership", () => {
  it("retains an unmeasured surface's profile until its last owner is removed", () => {
    const { resources, card, profile, svg } = setup();
    const visible = card(), offscreen = card();
    resources.apply(frame, { surfaces: [visible, offscreen], removals: [] });
    const originalProfile = profile(offscreen);
    expect(profile(visible)).toBe(originalProfile);

    // A wallpaper edit updates the visible surface. Offscreen surfaces are not
    // remeasured, but their feImage references must not be left dangling.
    resources.apply({ ...frame, key: "moved-wallpaper", left: 30 }, { surfaces: [visible], removals: [] });
    const currentProfile = profile(visible);
    expect(currentProfile).not.toBe(originalProfile);
    expect(document.getElementById(originalProfile)).not.toBeNull();
    expect(document.getElementById(currentProfile)).not.toBeNull();

    resources.apply(frame, { surfaces: [], removals: [offscreen] });
    expect(document.getElementById(originalProfile)).toBeNull();
    expect(document.getElementById(currentProfile)).not.toBeNull();
    resources.dispose();
    expect(svg.childElementCount).toBe(0);
    expect(visible.element.classList.contains("wallpaper-material-before")).toBe(false);
  });

  it("reuses the graph on scroll and restores React-cleared bindings without layout reads", () => {
    const { resources, card, filter, profile } = setup();
    const surface = card();
    const computedStyle = vi.spyOn(window, "getComputedStyle").mockImplementation(() => { throw new Error("Write phase read computed style"); });
    const bounds = vi.spyOn(surface.element, "getBoundingClientRect").mockImplementation(() => { throw new Error("Write phase read layout"); });
    resources.apply(frame, { surfaces: [surface], removals: [] });
    const originalFilter = filter(surface), input = originalFilter.firstElementChild!;
    const originalProfile = profile(surface), previousY = input.getAttribute("y");
    surface.element.className = "site-card is-selected";
    surface.element.style.removeProperty("--wallpaper-material-before");

    resources.apply(frame, { surfaces: [{ ...surface, y: 220 }], removals: [] });
    expect(surface.element.classList.contains("is-selected")).toBe(true);
    expect(surface.element.classList.contains("wallpaper-material-before")).toBe(true);
    expect(filter(surface)).toBe(originalFilter);
    expect(filter(surface).firstElementChild).toBe(input);
    expect(profile(surface)).toBe(originalProfile);
    expect(input.getAttribute("y")).not.toBe(previousY);
    expect(computedStyle).not.toHaveBeenCalled();
    expect(bounds).not.toHaveBeenCalled();
  });

  it("keeps observation and a shared profile until both material slots are unbound", () => {
    const { resources, card, profile, unbind } = setup();
    const before = card(), own = { ...before, pseudo: false };
    resources.apply(frame, { surfaces: [before, own], removals: [] });
    const shared = profile(before);
    resources.apply(frame, { surfaces: [], removals: [before] });
    expect(resources.has(before.element, true)).toBe(false);
    expect(resources.has(before.element)).toBe(true);
    expect(document.getElementById(shared)).not.toBeNull();
    expect(unbind).not.toHaveBeenCalled();
    resources.apply(frame, { surfaces: [], removals: [own] });
    expect(resources.has(before.element)).toBe(false);
    expect(document.getElementById(shared)).toBeNull();
    expect(unbind).toHaveBeenCalledExactlyOnceWith(before.element);
  });
});
