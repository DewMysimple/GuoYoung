import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGroupNavigationScroll } from "./group-navigation-scroll";

let position: number, time: number, sequence: number;
let frames: Map<number, FrameRequestCallback>;
const descriptors = {
  scrollY: Object.getOwnPropertyDescriptor(window, "scrollY")!,
  innerHeight: Object.getOwnPropertyDescriptor(window, "innerHeight")!,
};

function tick(milliseconds = 16) {
  time += milliseconds;
  const pending = [...frames.entries()];
  for (const [id, frame] of pending) {
    if (!frames.delete(id)) continue;
    frame(time);
  }
}
function finish() {
  for (let index = 0; frames.size && index < 2000; index++) tick();
  expect(frames.size).toBe(0);
}

beforeEach(() => {
  position = 0; time = 0; sequence = 0; frames = new Map();
  Object.defineProperties(window, {
    scrollY: { configurable: true, get: () => position },
    innerHeight: { configurable: true, value: 1000 },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback); return sequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(window, "scrollTo").mockImplementation((options: ScrollToOptions | number) => {
    if (typeof options === "object") position = options.top ?? position;
  });
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  Object.defineProperties(window, descriptors);
});

describe("group navigation scroll pacing", () => {
  it("bounds long journey speed instead of compressing it into a fixed duration", () => {
    const motion = createGroupNavigationScroll();
    motion.to(8000, false);
    const samples: number[] = [];
    for (let index = 0; index < 125; index++) { tick(); samples.push(position); }
    expect(position).toBeGreaterThan(2500);
    expect(position).toBeLessThan(3600);
    expect(samples.every((value, index) => !index || value >= samples[index - 1])).toBe(true);
    expect(samples.every((value, index) => !index || value - samples[index - 1] <= 28.8 + 0.001)).toBe(true);
    finish();
    expect(position).toBe(8000);
  });

  it("replaces an in-flight journey from its actual position and only reaches the last target", () => {
    const motion = createGroupNavigationScroll();
    motion.to(8000, false);
    for (let index = 0; index < 40; index++) tick();
    const before = position;
    motion.to(100, false);
    expect(frames.size).toBe(1);
    expect(position).toBe(before);
    tick(); tick();
    expect(position).toBeLessThan(before);
    finish();
    expect(position).toBe(100);
  });

  it("does not jump over groups after a delayed frame and stops without residual writes", () => {
    const motion = createGroupNavigationScroll();
    motion.to(8000, false);
    for (let index = 0; index < 40; index++) tick();
    const before = position;
    tick(2000);
    expect(position - before).toBeLessThanOrEqual(90 + 0.001);
    motion.cancel();
    const calls = vi.mocked(window.scrollTo).mock.calls.length;
    tick(); tick();
    expect(window.scrollTo).toHaveBeenCalledTimes(calls);
    expect(frames.size).toBe(0);
  });

  it("honors reduced motion immediately and cancels any earlier journey", () => {
    const motion = createGroupNavigationScroll();
    motion.to(8000, false);
    tick(); tick();
    motion.to(4000, true);
    expect(position).toBe(4000);
    expect(frames.size).toBe(0);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 4000, behavior: "instant" });
  });
});
