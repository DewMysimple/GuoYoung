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
let frames: Map<number, FrameRequestCallback>, resize: ResizeObserverCallback;
let readOffsets: string[], bounds: ReturnType<typeof vi.spyOn>;
const windowDescriptors = { scrollY: Object.getOwnPropertyDescriptor(window, "scrollY")!, innerHeight: Object.getOwnPropertyDescriptor(window, "innerHeight")! };
const OriginalResizeObserver = window.ResizeObserver;

function Fixture({ disabled = false, appearance = DEFAULT_APPEARANCE, shellWidth = 1000 }: {
  disabled?: boolean; appearance?: AppearanceSettings; shellWidth?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  return <LayoutSettingsContext value={appearance}>
    <div className="app-shell" style={{ width: shellWidth, "--card-safe-width": `${getMinimumCardWidth(appearance)}px` } as CSSProperties}>
    <style>{`.app-shell { padding-right: 0px; --group-nav-gap: 20px; --page-padding: 20px; }
      .group-section-nav { width: 140px; }`}</style>
    <header className="topbar" />
    <main>
      <input aria-label="Unrelated input" />
      <div ref={container}>{groups.map(group => <section key={group.id} data-group-sort-section-id={group.id} />)}</div>
      <GroupSectionNav groups={groups} containerRef={container} disabled={disabled} gap={20} settingsDisabled={false} onGapChange={() => {}} />
    </main>
    </div>
    <aside data-testid="portal"><button>Unrelated action</button></aside>
  </LayoutSettingsContext>;
}

function flushFrame() {
  act(() => {
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(0);
  });
}

beforeEach(() => {
  position = 0; mainLeft = 300; paintedNavLeft = undefined; readOffsets = []; frames = new Map();
  let sequence = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
  window.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {} unobserve() {} disconnect() {}
  };
  Object.defineProperties(window, { scrollY: { configurable: true, get: () => position }, innerHeight: { configurable: true, value: 600 } });
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(1200);
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
    if (index !== -1) return rect(mainLeft, [0, 900, 950][index] - position);
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

  it("does not measure document groups for input or Portal interactions that do not scroll the document", () => {
    render(<Fixture />);
    bounds.mockClear();
    fireEvent.keyDown(screen.getByLabelText("Unrelated input"), { key: "a" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Unrelated action" }));
    fireEvent.wheel(screen.getByTestId("portal"), { deltaY: 120 });
    flushFrame();
    expect(bounds).not.toHaveBeenCalled();

    position = 300;
    fireEvent.scroll(window); flushFrame();
    expect(bounds).toHaveBeenCalled();
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
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 600, behavior: "smooth" });
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
