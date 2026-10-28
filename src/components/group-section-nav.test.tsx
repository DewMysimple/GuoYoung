import { useRef, type CSSProperties } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppearanceSettings, SiteGroup } from "../types";
import { GroupSectionNav } from "./group-section-nav";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { getMinimumCardWidth } from "../lib/layout";
import { LayoutSettingsContext } from "./site-grid-layout";

// Desktop geometry is supplied below; jsdom does not evaluate viewport media queries.
vi.mock("./group-section-nav.css", () => ({}));

const groups: SiteGroup[] = ["first", "short", "last"].map((id, order) => ({
  id, name: id, icon: "star", workspace: "main", isProtected: false, order,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
}));
const rect = (left = 0, top = 0, width = 140, height = 40) =>
  ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON() {} } as DOMRect);
let position = 0, mainLeft = 300, paintedNavLeft: number | undefined;
let documentHeight = 1200, sectionTops = [0, 900, 950];
let frames: Map<number, FrameRequestCallback>, resize: ResizeObserverCallback;
let readOffsets: string[], bounds: ReturnType<typeof vi.spyOn>;
let frameTime = 0;
const windowDescriptors = { scrollY: Object.getOwnPropertyDescriptor(window, "scrollY")!, innerHeight: Object.getOwnPropertyDescriptor(window, "innerHeight")! };
const OriginalResizeObserver = window.ResizeObserver;

function Fixture({ disabled = false, appearance = DEFAULT_APPEARANCE, shellWidth = 1000, hasNotes = false }: {
  disabled?: boolean; appearance?: AppearanceSettings; shellWidth?: number; hasNotes?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  return <LayoutSettingsContext value={appearance}>
    <div className="app-shell" style={{ width: shellWidth, "--card-safe-width": `${getMinimumCardWidth(appearance, hasNotes)}px` } as CSSProperties}>
    <style>{`.app-shell { padding-right: 0px; --group-nav-gap: 20px; --page-padding: 20px; }
      .group-section-nav { width: 140px; }`}</style>
    <header className="topbar" />
    <main>
      <input aria-label="Unrelated input" />
      <div ref={container}>{groups.map(group => <section key={group.id} data-group-sort-section-id={group.id} />)}</div>
      <GroupSectionNav groups={groups} containerRef={container} disabled={disabled} gap={20} settingsDisabled={false} onGapChange={() => {}} hasNotes={hasNotes} />
    </main>
    </div>
    <aside data-testid="portal"><button>Unrelated action</button></aside>
  </LayoutSettingsContext>;
}

function flushFrame(milliseconds = 16) {
  act(() => {
    frameTime += milliseconds;
    const pending = [...frames.entries()];
    for (const [id, callback] of pending) {
      if (!frames.delete(id)) continue;
      callback(frameTime);
    }
  });
}

function finishNavigation() {
  for (let index = 0; frames.size && index < 2000; index++) flushFrame();
  expect(frames.size).toBe(0);
}

beforeEach(() => {
  position = 0; mainLeft = 300; paintedNavLeft = undefined; readOffsets = []; frames = new Map();
  documentHeight = 1200; sectionTops = [0, 900, 950];
  frameTime = 0;
  let sequence = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
  window.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {} unobserve() {} disconnect() {}
  };
  Object.defineProperties(window, { scrollY: { configurable: true, get: () => position }, innerHeight: { configurable: true, value: 600 } });
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockImplementation(() => documentHeight);
  vi.spyOn(window, "scrollTo").mockImplementation((options: ScrollToOptions | number) => {
    if (typeof options === "object") position = options.top ?? position;
  });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([rect()] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(140);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.matches(".app-shell") ? parseFloat(this.style.width) : 140;
  });
  bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const nav = document.querySelector<HTMLElement>(".group-section-nav");
    if (this.matches(".topbar, [data-group-sort-section-id]")) readOffsets.push(nav?.style.left ?? "");
    if (this === document.documentElement) return rect(12, 0, 1000, 1200);
    if (this.matches("main")) return rect(mainLeft);
    if (this.matches(".topbar")) return rect(0, 0, 1000, 100);
    if (this.matches(".group-section-nav")) return rect(paintedNavLeft ?? 12 + parseFloat(this.style.left || "0"), 120);
    const index = groups.findIndex(group => group.id === this.dataset.groupSortSectionId);
    if (index !== -1) return rect(mainLeft, sectionTops[index] - position);
    return rect(0, 120, 140, 300);
  });
});

afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  window.ResizeObserver = OriginalResizeObserver;
  Object.defineProperties(window, windowDescriptors);
});

describe("group navigation measurement boundaries", () => {
  it("rechecks the navigation budget when square-card text grows without a resize notification", () => {
    const smallText = { ...DEFAULT_APPEARANCE, cardShape: "square" as const, cardFontScale: 140, fontScale: 70 };
    const largeText = { ...smallText, fontScale: 130 };
    expect(getMinimumCardWidth(smallText)).toBe(158);
    expect(getMinimumCardWidth(largeText)).toBeCloseTo(215.765);
    // 390px fits the 358px navigation/card budget with small text, but cannot
    // fit the enlarged 415.765px budget. The mocked RO never emits a callback.
    const view = render(<Fixture appearance={smallText} shellWidth={390} />);
    const nav = screen.getByRole("navigation", { name: "分组定位" });
    expect(nav).not.toHaveAttribute("data-compact");
    view.rerender(<Fixture appearance={largeText} shellWidth={390} />);
    expect(nav).toHaveAttribute("data-compact");
    view.rerender(<Fixture appearance={smallText} shellWidth={390} />);
    expect(nav).not.toHaveAttribute("data-compact");
  });

  it("caches document positions across scrolling and ignores unrelated input or Portal interactions", () => {
    render(<Fixture />);
    bounds.mockClear();
    readOffsets = [];
    fireEvent.keyDown(screen.getByLabelText("Unrelated input"), { key: "a" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Unrelated action" }));
    fireEvent.wheel(screen.getByTestId("portal"), { deltaY: 120 });
    flushFrame();
    expect(bounds).not.toHaveBeenCalled();

    position = 600;
    fireEvent.scroll(window); flushFrame();
    // Moving the active button may measure the rail's own scrollable list;
    // document sections and the topbar must still use their cached positions.
    expect(readOffsets).toEqual([]);
    expect(screen.getByRole("button", { name: "定位到 last" })).toHaveAttribute("aria-current", "location");
  });

  it("rechecks the rail budget when notes appear or are hidden without a resize notification", () => {
    const appearance = { ...DEFAULT_APPEARANCE, cardShape: "square" as const, fontScale: 130, cardFontScale: 140, showSiteNotes: true };
    const plainWidth = getMinimumCardWidth(appearance);
    const noteWidth = getMinimumCardWidth(appearance, true);
    expect(noteWidth).toBeGreaterThan(plainWidth);
    const shellWidth = 200 + (plainWidth + noteWidth) / 2;
    const view = render(<Fixture appearance={appearance} shellWidth={shellWidth} />);
    const nav = screen.getByRole("navigation", { name: "分组定位" });
    expect(nav).not.toHaveAttribute("data-compact");
    view.rerender(<Fixture appearance={appearance} shellWidth={shellWidth} hasNotes />);
    expect(nav).toHaveAttribute("data-compact");
    view.rerender(<Fixture appearance={{ ...appearance, showSiteNotes: false }} shellWidth={shellWidth} hasNotes />);
    expect(nav).not.toHaveAttribute("data-compact");
  });

  it("reads all document geometry before moving the navigation rail", () => {
    render(<Fixture />);
    const nav = screen.getByRole("navigation", { name: "分组定位" });
    expect(nav.style.left).toBe("128px");
    readOffsets = []; mainLeft = 360;
    fireEvent(window, new Event("resize")); flushFrame();
    expect(readOffsets.length).toBeGreaterThan(0);
    expect(readOffsets.every(value => value === "128px")).toBe(true);
    expect(nav.style.left).toBe("188px");
  });

  it("keeps the stable root origin when the painted rail rectangle lags behind its inline position", () => {
    render(<Fixture />);
    const nav = screen.getByRole("navigation", { name: "分组定位" });
    expect(nav.style.left).toBe("128px");
    // During a layout transition, Chromium can report the preceding painted
    // rail rectangle after its next inline left has already been written.
    paintedNavLeft = 140;
    mainLeft = 360;
    fireEvent(window, new Event("resize")); flushFrame();
    expect(nav.style.left).toBe("188px");
    fireEvent(window, new Event("resize")); flushFrame();
    expect(nav.style.left).toBe("188px");
    mainLeft = 420;
    fireEvent(window, new Event("resize")); flushFrame();
    expect(nav.style.left).toBe("248px");
  });

  it("preserves a short clicked destination at the document bottom until actual user navigation", () => {
    render(<Fixture />);
    const short = screen.getByRole("button", { name: "定位到 short" });
    fireEvent.click(short);
    finishNavigation();
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 600, behavior: "instant" });
    fireEvent.scroll(window); flushFrame();
    expect(short).toHaveAttribute("aria-current", "location");

    // User scroll intent releases the clicked destination; the subsequent
    // document scroll supplies geometry. Returning must not revive the old lock.
    fireEvent.wheel(document.body, { deltaY: -120 });
    position = 450;
    fireEvent.scroll(window); flushFrame();
    expect(screen.getByRole("button", { name: "定位到 first" })).toHaveAttribute("aria-current", "location");
    position = 600; fireEvent.scroll(window); flushFrame();
    expect(screen.getByRole("button", { name: "定位到 last" })).toHaveAttribute("aria-current", "location");
    position = 0; fireEvent.scroll(window); flushFrame();
    expect(screen.getByRole("button", { name: "定位到 first" })).toHaveAttribute("aria-current", "location");
  });

  it("keeps long navigation smooth and holds the latest target through intermediate scroll and observer notifications", () => {
    documentHeight = 6000; sectionTops = [0, 900, 5000];
    render(<Fixture />);
    const last = screen.getByRole("button", { name: "定位到 last" });
    fireEvent.click(last);
    for (let index = 0; index < 30; index++) flushFrame();
    expect(position).toBeGreaterThan(0);
    expect(position).toBeLessThan(600);
    const before = position;
    fireEvent.scroll(window); flushFrame();
    act(() => resize([], {} as ResizeObserver)); flushFrame();
    expect(last).toHaveAttribute("aria-current", "location");
    expect(position).toBeGreaterThan(before);
    expect(position).toBeLessThan(700);

    const short = screen.getByRole("button", { name: "定位到 short" });
    fireEvent.click(short);
    fireEvent.scroll(window); flushFrame();
    expect(short).toHaveAttribute("aria-current", "location");
    finishNavigation();
    expect(position).toBe(776);
  });

  it("retargets a moved destination smoothly after layout changes", () => {
    documentHeight = 6000; sectionTops = [0, 900, 5000];
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "定位到 last" }));
    for (let index = 0; index < 30; index++) flushFrame();
    sectionTops[2] += 200;
    act(() => resize([], {} as ResizeObserver)); flushFrame();
    finishNavigation();
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 5076, behavior: "instant" });
    expect(screen.getByRole("button", { name: "定位到 last" })).toHaveAttribute("aria-current", "location");
  });

  it("stops queued scrolling at the actual position for manual input and unmount", () => {
    documentHeight = 6000; sectionTops = [0, 900, 5000];
    const view = render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "定位到 last" }));
    flushFrame(); flushFrame();
    position = 1500;
    fireEvent.wheel(document.body, { deltaY: -120 });
    const calls = vi.mocked(window.scrollTo).mock.calls.length;
    flushFrame();
    expect(window.scrollTo).toHaveBeenCalledTimes(calls);
    expect(position).toBe(1500);
    expect(screen.getByRole("button", { name: "定位到 short" })).toHaveAttribute("aria-current", "location");

    fireEvent.click(screen.getByRole("button", { name: "定位到 last" }));
    position = 2000;
    fireEvent.scroll(window);
    view.unmount();
    expect(position).toBe(2000);
    expect(frames.size).toBe(0);
  });

  it("keeps the clicked short group highlighted between navigation pointerdown and click", () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    render(<Fixture />);
    const short = screen.getByRole("button", { name: "定位到 short" });
    const first = screen.getByRole("button", { name: "定位到 first" });
    fireEvent.click(short);
    expect(position).toBe(600);
    fireEvent.pointerDown(first.querySelector("span")!);
    fireEvent.scroll(window); flushFrame();
    expect(short).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("button", { name: "定位到 last" })).not.toHaveAttribute("aria-current");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-current", "location");
    expect(position).toBe(0);
  });

  it("keeps navigation keyboard activation stable but allows other scroll keys to interrupt", () => {
    render(<Fixture />);
    const short = screen.getByRole("button", { name: "定位到 short" });
    fireEvent.click(short);
    fireEvent.keyDown(short, { key: " " });
    flushFrame();
    expect(short).toHaveAttribute("aria-current", "location");
    fireEvent.keyDown(short, { key: "PageDown" });
    flushFrame();
    expect(screen.getByRole("button", { name: "定位到 first" })).toHaveAttribute("aria-current", "location");
    expect(frames.size).toBe(0);
  });

  it("does not measure document sections during an animated journey", () => {
    documentHeight = 6000; sectionTops = [0, 900, 5000];
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "定位到 last" }));
    readOffsets = [];
    for (let index = 0; index < 40; index++) {
      flushFrame();
      fireEvent.scroll(window);
    }
    expect(position).toBeGreaterThan(0);
    expect(readOffsets).toEqual([]);
  });

  it.each(["pointerdown", "touchstart", "PageUp", "Escape"])("interrupts an active journey on external %s", input => {
    documentHeight = 6000; sectionTops = [0, 900, 5000];
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "定位到 last" }));
    for (let index = 0; index < 30; index++) flushFrame();
    const stoppedAt = position;
    if (input === "pointerdown") fireEvent.pointerDown(document.body);
    else if (input === "touchstart") fireEvent.touchStart(document.body);
    else fireEvent.keyDown(document.body, { key: input });
    for (let index = 0; index < 20; index++) flushFrame();
    expect(position).toBe(stoppedAt);
    expect(screen.getByRole("button", { name: "定位到 first" })).toHaveAttribute("aria-current", "location");
    expect(frames.size).toBe(0);
  });

  it("remeasures on observed layout changes and keeps navigation disabled during dragging", () => {
    const { rerender } = render(<Fixture />);
    mainLeft = 420;
    act(() => resize([], {} as ResizeObserver)); flushFrame();
    expect(screen.getByRole("navigation").style.left).toBe("248px");
    rerender(<Fixture disabled />);
    const short = screen.getByRole("button", { name: "定位到 short" });
    expect(short).toBeDisabled();
    fireEvent.click(short);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
