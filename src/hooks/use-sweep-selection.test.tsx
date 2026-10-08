import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { intersectSelectionPath, useSweepSelection } from "./use-sweep-selection";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Harness({ enabled = true, select = vi.fn() }) {
  const sweep = useSweepSelection({ enabled, onToggle: select,
    itemSelector: "[data-site-dnd-id]", idAttribute: "data-site-dnd-id", ignoreSelector: ".card-actions" });
  return <div ref={sweep.containerRef} {...sweep.handlers}>
    {["a", "b", "c"].map(id => <article key={id} data-site-dnd-id={id}>
      <button onClick={() => select(["click"])}>{id}</button>
    </article>)}
  </div>;
}
function pointer(target: Element | Window, type: string, x: number, y: number, extra: MouseEventInit & { pointerType?: string; pointerId?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, ...extra });
  Object.defineProperties(event, { pointerId: { value: extra.pointerId ?? 1 }, pointerType: { value: extra.pointerType ?? "mouse" } });
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
  pointer(window, "pointermove", 290, -10);
  pointer(window, "pointermove", 50, -10);
  pointer(window, "pointermove", 50, 50);
  pointer(window, "pointermove", 70, 60);
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
