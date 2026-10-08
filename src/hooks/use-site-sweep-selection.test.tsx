import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { intersectSelectionPath, useSiteSweepSelection } from "./use-site-sweep-selection";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Harness({ enabled = true, select = vi.fn() }) {
  const sweep = useSiteSweepSelection(enabled, select);
  return <div ref={sweep.containerRef} {...sweep.handlers}>
    {["a", "b", "c"].map(id => <article key={id} data-site-dnd-id={id}>
      <button onClick={() => select(["click"])}>{id}</button>
    </article>)}
  </div>;
}
function pointer(target: Element | Window, type: string, x: number, y: number, extra = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, ...extra });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
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

it("toggles only touched cards once per press and suppresses the release click", () => {
  const { select, cards } = setup();
  pointer(cards[0], "pointerdown", 50, 50);
  pointer(window, "pointermove", 52, 50);
  expect(select).not.toHaveBeenCalled();
  pointer(window, "pointermove", 50, -10);
  pointer(window, "pointermove", 290, -10);
  pointer(window, "pointermove", 290, 50);
  pointer(window, "pointermove", 290, 80);
  expect(select.mock.calls).toEqual([[["a"]], [["c"]]]);
  pointer(window, "pointerup", 290, 80);
  fireEvent.click(cards[2].querySelector("button")!, { detail: 1 });
  pointer(window, "pointermove", 170, 50);
  expect(select.mock.calls).toEqual([[["a"]], [["c"]]]);
  pointer(cards[1], "pointerdown", 170, 50);
  pointer(window, "pointerup", 170, 50);
  fireEvent.click(cards[1].querySelector("button")!, { detail: 1 });
  expect(select).toHaveBeenLastCalledWith(["click"]);
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
