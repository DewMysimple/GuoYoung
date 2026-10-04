import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WallpaperSource, refreshWallpaperSource, SOURCE_UPDATED } from "./wallpaper-source";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function sourceFixture(ready = true) {
  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.innerHTML = '<div class="wallpaper-layer"><img alt="" /></div>';
  document.body.append(shell);
  const image = shell.querySelector("img")!;
  const state = {
    ready,
    box: { left: -12.25, top: -8.5, width: 1224, height: 816 },
    animations: [] as Partial<CSSTransition>[],
  };
  Object.defineProperties(image, {
    complete: { get: () => state.ready },
    naturalWidth: { get: () => state.ready ? 1600 : 0 },
    naturalHeight: { get: () => state.ready ? 900 : 0 },
  });
  const operations: string[] = [];
  const rect = vi.spyOn(image, "getBoundingClientRect").mockImplementation(() => {
    operations.push("read-box");
    return { ...state.box, x: state.box.left, y: state.box.top,
      right: state.box.left + state.box.width, bottom: state.box.top + state.box.height,
      toJSON() {} };
  });
  const style = document.createElement("div").style;
  style.objectFit = "contain";
  style.objectPosition = "25% 75%";
  style.transform = "matrix(1.5, 0, 0, 1.5, 0, 0)";
  style.filter = "blur(4px)";
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => {
    expect(element).toBe(image);
    operations.push("read-style");
    return style;
  });
  image.getAnimations = () => {
    operations.push("read-animation");
    return state.animations as Animation[];
  };
  vi.stubGlobal("DOMMatrixReadOnly", class {
    a: number; b: number;
    constructor(value?: string) {
      const values = value?.match(/matrix\(([^)]+)\)/)?.[1].split(",").map(Number);
      this.a = values?.[0] ?? 1; this.b = values?.[1] ?? 0;
    }
  });
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
    const id = ++nextFrame; frames.set(id, callback); return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
  const rootStyle = document.documentElement.style;
  const write = rootStyle.setProperty.bind(rootStyle);
  vi.spyOn(rootStyle, "setProperty").mockImplementation((...args) => {
    operations.push(`write:${args[0]}`); write(...args);
  });
  return {
    image, state, style, rect, frames, operations, rootStyle,
    flushFrame() {
      const callbacks = [...frames.values()]; frames.clear();
      act(() => { callbacks.forEach(callback => callback(0)); });
    },
    transition(type: "transitionrun" | "transitionend" | "transitioncancel", propertyName: string) {
      const event = new Event(type);
      Object.defineProperty(event, "propertyName", { value: propertyName });
      act(() => { image.dispatchEvent(event); });
    },
  };
}

it("publishes a complete source before paint and coalesces explicit changes without reacting to scroll or theme DOM", () => {
  const fixture = sourceFixture();
  const { rootStyle, state, rect, frames, operations } = fixture;
  const events = vi.spyOn(window, "dispatchEvent");
  const published = vi.fn(() => [rootStyle.getPropertyValue("--wallpaper-source-image"),
    rootStyle.getPropertyValue("--wallpaper-card-spread")]);
  window.addEventListener(SOURCE_UPDATED, published, { once: true });
  render(<WallpaperSource source="https://images.example.test/wallpaper.png" glassBlur={24} />);
  expect(rootStyle.getPropertyValue("--wallpaper-source-image")).toContain("wallpaper.png");
  expect(rootStyle.getPropertyValue("--wallpaper-source-left")).toBe("-12.25px");
  expect(rootStyle.getPropertyValue("--wallpaper-source-top")).toBe("87.125px");
  expect(rootStyle.getPropertyValue("--wallpaper-source-blur")).toBe("6px");
  expect(rootStyle.getPropertyValue("--wallpaper-source-filter")).toBe(`blur(2px) blur(${Math.sqrt(32)}px)`);
  expect(rootStyle.getPropertyValue("--wallpaper-card-filter")).toBe(`${rootStyle.getPropertyValue("--wallpaper-source-filter")} blur(24px)`);
  expect(parseFloat(rootStyle.getPropertyValue("--wallpaper-card-blur"))).toBeCloseTo(Math.hypot(6, 24));
  expect(operations.slice(0, 3)).toEqual(["read-box", "read-style", "read-animation"]);
  expect(operations.slice(3).every(operation => operation.startsWith("write:"))).toBe(true);
  expect(published).toHaveBeenCalledOnce();
  expect(published.mock.results[0].value).toEqual([
    rootStyle.getPropertyValue("--wallpaper-source-image"), rootStyle.getPropertyValue("--wallpaper-card-spread"),
  ]);

  document.dispatchEvent(new Event("scroll"));
  document.documentElement.dataset.theme = "dark";
  rootStyle.setProperty("--wallpaper-overlay", ".5");
  fixture.image.classList.add("irrelevant-class");
  fixture.flushFrame();
  expect(rect).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(0);

  state.box.left = -18.125;
  act(() => { refreshWallpaperSource(); refreshWallpaperSource(); window.dispatchEvent(new Event("resize")); });
  expect(frames.size).toBe(1);
  fixture.flushFrame();
  expect(rect).toHaveBeenCalledTimes(2);
  expect(rootStyle.getPropertyValue("--wallpaper-source-left")).toBe("-18.125px");
  expect(frames.size).toBe(0);
  expect(events.mock.calls.filter(([event]) => event.type === SOURCE_UPDATED)).toHaveLength(2);
  refreshWallpaperSource();
  fixture.flushFrame();
  expect(events.mock.calls.filter(([event]) => event.type === SOURCE_UPDATED)).toHaveLength(2);
});

it("waits for the source load and follows only its active optical transitions through their final frame", () => {
  const fixture = sourceFixture(false);
  render(<WallpaperSource source="blob:wallpaper" glassBlur={24} />);
  expect(fixture.rect).not.toHaveBeenCalled();
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-source-image")).toBe("");
  fixture.state.ready = true;
  act(() => { fixture.image.dispatchEvent(new Event("load")); });
  fixture.flushFrame();
  expect(fixture.rect).toHaveBeenCalledTimes(1);

  fixture.transition("transitionrun", "opacity");
  expect(fixture.frames.size).toBe(0);
  fixture.state.animations = [{ transitionProperty: "transform", playState: "running", pending: false }];
  fixture.transition("transitionrun", "transform");
  fixture.flushFrame();
  expect(fixture.frames.size).toBe(1);
  fixture.state.box.top = -16.375;
  fixture.state.animations = [];
  fixture.transition("transitionend", "transform");
  fixture.flushFrame();
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-source-top")).toBe("79.25px");
  expect(fixture.frames.size).toBe(0);

  fixture.state.animations = [{ transitionProperty: "filter", playState: "running", pending: false }];
  fixture.transition("transitionrun", "filter");
  fixture.flushFrame();
  fixture.style.filter = "blur(0px)";
  fixture.state.animations = [];
  fixture.transition("transitioncancel", "filter");
  fixture.flushFrame();
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-source-blur")).toBe("0px");
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-blur")).toBe("24px");
  expect(fixture.frames.size).toBe(0);
});

it("replaces the source and blur coherently, then removes listeners, pending work and only owned variables", () => {
  const fixture = sourceFixture();
  fixture.rootStyle.setProperty("--unrelated-token", "keep");
  const view = render(<WallpaperSource source="blob:first" glassBlur={24} />);
  refreshWallpaperSource();
  expect(fixture.frames.size).toBe(1);
  view.rerender(<WallpaperSource source="blob:second" glassBlur={0} />);
  expect(fixture.frames.size).toBe(0);
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-source-image")).toContain("blob:second");
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-blur")).toBe("6px");
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-filter"))
    .toBe(fixture.rootStyle.getPropertyValue("--wallpaper-source-filter"));
  refreshWallpaperSource();
  view.unmount();
  const reads = fixture.rect.mock.calls.length;
  expect(fixture.frames.size).toBe(0);
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-source-image")).toBe("");
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-spread")).toBe("");
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-source-filter")).toBe("");
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-filter")).toBe("");
  expect(fixture.rootStyle.getPropertyValue("--unrelated-token")).toBe("keep");
  refreshWallpaperSource();
  window.dispatchEvent(new Event("resize"));
  fixture.image.dispatchEvent(new Event("load"));
  fixture.transition("transitionend", "transform");
  fixture.flushFrame();
  expect(fixture.rect).toHaveBeenCalledTimes(reads);
  expect(fixture.frames.size).toBe(0);
});

it("keeps one live subscription after StrictMode effect replay", () => {
  const fixture = sourceFixture();
  render(<StrictMode><WallpaperSource source="blob:wallpaper" glassBlur={24} /></StrictMode>);
  const reads = fixture.rect.mock.calls.length;
  refreshWallpaperSource();
  fixture.flushFrame();
  expect(fixture.rect).toHaveBeenCalledTimes(reads + 1);
  expect(fixture.frames.size).toBe(0);
});

it("omits zero and neutral filter passes while preserving saturation and zero-frost refraction", () => {
  const fixture = sourceFixture();
  fixture.style.filter = "none";
  const view = render(<WallpaperSource source="blob:wallpaper" glassBlur={0} glassSaturation={100} />);
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-source-filter")).toBe("none");
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-filter")).toBe("none");
  view.rerender(<WallpaperSource source="blob:wallpaper" glassBlur={0} glassSaturation={100} glassRefraction />);
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-filter"))
    .toBe('url("#wallpaper-glass-card-source")');

  view.rerender(<WallpaperSource source="blob:wallpaper" glassBlur={24} glassSaturation={100} />);
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-filter")).toBe("blur(24px)");
  view.rerender(<WallpaperSource source="blob:wallpaper" glassBlur={0} glassSaturation={130} />);
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-filter")).toBe("saturate(1.3)");
  view.rerender(<WallpaperSource source="blob:wallpaper" glassBlur={0} glassSaturation={130} glassRefraction />);
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-filter"))
    .toBe('saturate(1.3) url("#wallpaper-glass-card-source")');
  expect(fixture.frames.size).toBe(0);
});

it("updates source pass radii on DPR resize without changing its geometry or total frost", () => {
  const fixture = sourceFixture();
  vi.stubGlobal("devicePixelRatio", 1);
  render(<WallpaperSource source="blob:wallpaper" glassBlur={24} />);
  const originalLeft = fixture.rootStyle.getPropertyValue("--wallpaper-source-left");
  const originalBlur = fixture.rootStyle.getPropertyValue("--wallpaper-card-blur");
  vi.stubGlobal("devicePixelRatio", 1.5);
  act(() => { window.dispatchEvent(new Event("resize")); });
  fixture.flushFrame();
  const pre = 2 / 1.5, remainder = Math.sqrt(6 ** 2 - pre ** 2);
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-source-filter")).toBe(`blur(${pre}px) blur(${remainder}px)`);
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-source-left")).toBe(originalLeft);
  expect(fixture.rootStyle.getPropertyValue("--wallpaper-card-blur")).toBe(originalBlur);
  expect(fixture.frames.size).toBe(0);
});
