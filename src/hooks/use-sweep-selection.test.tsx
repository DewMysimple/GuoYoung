import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { intersectSelectionPath, useSweepSelection } from "./use-sweep-selection";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Harness({ enabled = true, select = vi.fn() }) {
  const sweep = useSweepSelection({ enabled, onToggle: select,
    itemSelector: "[data-site-dnd-id]", idAttribute: "data-site-dnd-id", ignoreSelector: ".card-actions" });
  return <div ref={sweep.containerRef} {...sweep.handlers}>
    {["a", "b", "c", "d"].map(id => <article key={id} data-site-dnd-id={id}>
      <button onClick={() => select(["click"])}>{id}</button>
    </article>)}
  </div>;
}
function pointer(target: Element | Window, type: string, x: number, y: number, extra: MouseEventInit & { pointerType?: string; pointerId?: number; samples?: { clientX: number; clientY: number }[] } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, ...extra });
  Object.defineProperties(event, { pointerId: { value: extra.pointerId ?? 1 }, pointerType: { value: extra.pointerType ?? "mouse" } });
  if (extra.samples) Object.defineProperty(event, "getCoalescedEvents", { value: () => extra.samples });
  fireEvent(target, event);
}
function setup() {
  const select = vi.fn();
  const view = render(<Harness select={select} />);
  const cards = [...view.container.querySelectorAll("article")];
  cards.forEach((card, index) => vi.spyOn(card, "getBoundingClientRect").mockReturnValue(new DOMRect(index * 120, 0, 100, 100)));
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn((x: number, y: number) =>
    cards.find(card => { const r = card.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }) ?? null) });
  return { select, view, cards };
}

it("intersects the travelled segment without filling its bounding box or extending past its endpoints", () => {
  const rect = new DOMRect(120, 0, 100, 100);
  expect(intersectSelectionPath({ x: 0, y: 50 }, { x: 340, y: 50 }, rect)).toEqual({ x: 170, y: 50 });
  expect(intersectSelectionPath({ x: 340, y: 50 }, { x: 0, y: 50 }, rect)).toEqual({ x: 170, y: 50 });
  expect(intersectSelectionPath({ x: 50, y: 50 }, { x: 100, y: 50 }, rect)).toBeNull();
  expect(intersectSelectionPath({ x: 0, y: 0 }, { x: 340, y: 340 }, rect)).toBeNull();
  expect(intersectSelectionPath({ x: 170, y: 50 }, { x: 170, y: 50 }, rect)).toEqual({ x: 170, y: 50 });
});

it("toggles on re-entry in the same press, ignores movement inside and suppresses the release click", () => {
  const { select, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50);
  pointer(window, "pointermove", 52, 50);
  expect(select).not.toHaveBeenCalled();
  pointer(window, "pointermove", 50, -10);
  pointer(window, "pointermove", 290, -10);
  pointer(window, "pointermove", 290, 50);
  pointer(window, "pointermove", 290, 80);
  expect(select.mock.calls).toEqual([[["a"]], [["c"]]]);
  // Exit perpendicular to the incoming path, then re-enter A through the gap.
  pointer(window, "pointermove", 350, 80);
  pointer(window, "pointermove", 350, -10);
  pointer(window, "pointermove", 50, -10);
  pointer(window, "pointermove", 50, 50);
  pointer(window, "pointermove", 30, 60);
  expect(select.mock.calls).toEqual([[["a"]], [["c"]], [["a"]]]);
  pointer(window, "pointerup", 290, 80);
  fireEvent.click(cards[2].querySelector("button")!, { detail: 1 });
  pointer(window, "pointermove", 170, 50);
  expect(select.mock.calls).toEqual([[["a"]], [["c"]], [["a"]]]);
  pointer(cards[1], "pointerdown", 170, 50);
  pointer(window, "pointerup", 170, 50);
  fireEvent.click(cards[1].querySelector("button")!, { detail: 1 });
  expect(select).toHaveBeenLastCalledWith(["click"]);
});

it("retoggles every item crossed on a fast return path without releasing", () => {
  const { select, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50);
  pointer(window, "pointermove", 350, 50);
  pointer(window, "pointermove", -10, 50);
  pointer(window, "pointermove", 350, 50);
  expect(select.mock.calls).toEqual([[["a", "b", "c"]], [["c", "b", "a"]], [["a", "b", "c"]]]);
});

it("does not let a larger CSS hit area skip the next item's geometric crossing", () => {
  const { select, cards } = setup();
  vi.mocked(document.elementFromPoint).mockImplementation((x, y) =>
    cards.find(card => {
      const r = card.getBoundingClientRect();
      return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4;
    }) ?? null);
  pointer(cards[0], "pointerdown", 50, 50);
  // The pseudo-element belongs to B, but the path has not entered its rect.
  pointer(window, "pointermove", 118, 50);
  pointer(window, "pointermove", 238, 50);
  pointer(window, "pointermove", 358, 50);
  pointer(window, "pointermove", 410, 50);
  expect(select.mock.calls.flatMap(([ids]) => ids)).toEqual(["a", "b", "c", "d"]);
});

it.each([1, 8, 120])("toggles ABCD and all four on an immediate centre return at %i steps", steps => {
  const { select, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50);
  const traverse = (from: number, to: number) => {
    for (let i = 1; i <= steps; i++) pointer(window, "pointermove", from + (to - from) * i / steps, 50);
  };
  traverse(50, 410);
  expect(select.mock.calls.flatMap(([ids]) => ids)).toEqual(["a", "b", "c", "d"]);
  traverse(410, 50);
  expect(select.mock.calls.flatMap(([ids]) => ids)).toEqual(["a", "b", "c", "d", "d", "c", "b", "a"]);
  traverse(50, 410);
  expect(select.mock.calls.flatMap(([ids]) => ids)).toEqual(["a", "b", "c", "d", "d", "c", "b", "a", "a", "b", "c", "d"]);
});

it.each([3, 10])("does not retoggle a departed turning item after a sideways exit with %ipx retreat", retreat => {
  const { select, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50);
  pointer(window, "pointermove", 170, 50);
  expect(select).toHaveBeenCalledExactlyOnceWith(["a", "b"]);
  // Leave B sideways before retreating far enough to qualify as a turn.
  pointer(window, "pointermove", 170 - retreat, 110);
  pointer(window, "pointermove", 150, 110);
  expect(select).toHaveBeenCalledExactlyOnceWith(["a", "b"]);
});

it("uses the cross-item direction even when the final item is entered from above", () => {
  const { select, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50);
  pointer(window, "pointermove", 290, 50);
  pointer(window, "pointermove", 350, -10);
  pointer(window, "pointermove", 410, -10);
  pointer(window, "pointermove", 410, 50);
  expect(select.mock.calls.flatMap(([ids]) => ids)).toEqual(["a", "b", "c", "d"]);
  pointer(window, "pointermove", 50, 50);
  expect(select.mock.calls.flatMap(([ids]) => ids)).toEqual(["a", "b", "c", "d", "d", "c", "b", "a"]);
});

it("filters turn jitter, accumulates a slow retreat and keeps uneven samples deterministic", () => {
  const { select, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50);
  for (const x of [52, 100, 118, 120, 121, 219, 220, 238, 240, 241, 340, 360, 410]) pointer(window, "pointermove", x, 50);
  expect(select.mock.calls.flatMap(([ids]) => ids)).toEqual(["a", "b", "c", "d"]);
  for (const x of [409, 408, 410, 409, 408, 407, 406, 405]) pointer(window, "pointermove", x, 50);
  expect(select.mock.calls.flatMap(([ids]) => ids)).toEqual(["a", "b", "c", "d"]);
  for (const x of [404, 403, 359, 340, 290, 239, 220, 170, 119, 100, 50]) pointer(window, "pointermove", x, 50);
  expect(select.mock.calls.flatMap(([ids]) => ids)).toEqual(["a", "b", "c", "d", "d", "c", "b", "a"]);
});

it("does not repeatedly toggle movement confined to one item", () => {
  const { select, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50);
  for (const [x, y] of [[20, 20], [80, 80], [20, 80], [80, 20], [50, 50]]) pointer(window, "pointermove", x, y);
  expect(select).toHaveBeenCalledExactlyOnceWith(["a"]);
});

it("preserves every pass within a coalesced pointer event rather than deduplicating the batch", () => {
  const { select, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50);
  pointer(window, "pointermove", 410, 50, { samples: [410, 50, 410].map(clientX => ({ clientX, clientY: 50 })) });
  expect(select.mock.calls).toEqual([[["a", "b", "c", "d"]], [["d", "c", "b", "a"]], [["a", "b", "c", "d"]]]);
});

it("ignores items clipped outside their scrolling ancestor even when that ancestor is hit", () => {
  const { select, view, cards } = setup();
  const container = cards[0].parentElement!;
  container.style.overflow = "hidden";
  Object.defineProperties(container, { clientWidth: { value: 100 }, clientHeight: { value: 100 } });
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
  cards.forEach((card, index) => vi.mocked(card.getBoundingClientRect).mockReturnValue(new DOMRect(0, index * 120, 100, 100)));
  vi.mocked(document.elementFromPoint).mockImplementation((_x, y) => y < 100 ? cards[0] : view.container);
  pointer(cards[0], "pointerdown", 50, 50);
  pointer(window, "pointermove", 50, 170);
  expect(select).toHaveBeenCalledExactlyOnceWith(["a"]);
});

it.each(["ancestor", "overlay"] as const)("checks rounded-corner visibility against an %s", visibility => {
  const { select, view, cards } = setup();
  const overlay = document.createElement("div");
  vi.mocked(document.elementFromPoint).mockImplementation((x, y) => {
    // The partial crossing's midpoint is in B's rounded corner.
    if (x > 120 && x < 160 && y < 10) return visibility === "ancestor" ? view.container : overlay;
    return cards.find(card => {
      const r = card.getBoundingClientRect();
      return x > r.left && x < r.right && y > r.top && y < r.bottom;
    }) ?? null;
  });
  pointer(cards[0], "pointerdown", 50, 5);
  pointer(window, "pointermove", 150, 5);
  expect(select).toHaveBeenCalledExactlyOnceWith(visibility === "ancestor" ? ["a", "b"] : ["a"]);
});

it("only starts on enabled mouse items, preserving actions, touch and secondary clicks", () => {
  const { select, cards } = setup();
  const button = cards[0].querySelector("button")!;
  button.className = "card-actions";
  pointer(button, "pointerdown", 50, 50);
  pointer(window, "pointermove", 350, 50);
  pointer(cards[0], "pointerdown", 50, 50, { button: 2 });
  pointer(window, "pointermove", 350, 50);
  pointer(cards[0], "pointerdown", 50, 50, { pointerType: "touch" });
  pointer(window, "pointermove", 350, 50);
  expect(select).not.toHaveBeenCalled();
});

it("catches fast crossings, ignores occluded cards and reads the latest callback", () => {
  const { select, view, cards } = setup();
  const latest = vi.fn();
  view.rerender(<Harness select={latest} />);
  vi.mocked(document.elementFromPoint).mockImplementation((x, y) => x > 120 && x < 220 ? null : cards.find(card => {
    const r = card.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= 0 && y <= 100;
  }) ?? null);
  pointer(cards[0], "pointerdown", 50, 50);
  pointer(window, "pointermove", 290, 50);
  expect(latest).toHaveBeenCalledExactlyOnceWith(["a", "c"]);
  expect(select).not.toHaveBeenCalled();
});

it.each(["pointercancel", "blur", "pagehide", "hidden", "escape", "disabled"])("ends the session on %s without selecting after resume", reason => {
  const { select, view, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50);
  pointer(window, "pointermove", 60, 50);
  if (reason === "disabled") view.rerender(<Harness enabled={false} select={select} />);
  else if (reason === "hidden") {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
  }
  else if (reason === "escape") fireEvent.keyDown(window, { key: "Escape" });
  else if (reason === "pointercancel") pointer(window, reason, 60, 50);
  else fireEvent(window, new Event(reason));
  pointer(window, "pointermove", 290, 50);
  expect(select).toHaveBeenCalledExactlyOnceWith(["a"]);
});

it("keeps reverse crossings in pointer order so the final card is the next Shift anchor", () => {
  const { select, cards } = setup();
  pointer(cards[2], "pointerdown", 290, 50);
  pointer(window, "pointermove", 50, 50);
  expect(select).toHaveBeenCalledExactlyOnceWith(["c", "b", "a"]);
});

it("keeps Shift clicks and stationary clicks in the existing click path", () => {
  const { select, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50, { shiftKey: true });
  pointer(window, "pointermove", 290, 50);
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(cards[0].querySelector("button")!, { detail: 0 });
  expect(select).toHaveBeenCalledExactlyOnceWith(["click"]);
});
