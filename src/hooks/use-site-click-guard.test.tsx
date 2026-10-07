import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSiteClickGuard } from "./use-site-click-guard";

afterEach(cleanup);

function pointer(target: Element, type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(target, event);
}

function Harness({ onOpen = vi.fn(), selection = false }) {
  const guard = useSiteClickGuard();
  return <div {...guard.handlers}>
    <article className="site-card"><a className="site-card-full-link" href="https://example.com" onClick={event => event.preventDefault()}>link</a></article>
    <article className={`site-card ${selection ? "is-selection-mode" : ""}`} data-site-dnd-id={selection ? "a" : undefined}>
      <button className="site-card-full-link" onClick={onOpen}>button</button>
    </article>
  </div>;
}

it("a fresh press on a history-style button clears suppression left by a preceding drag", () => {
  const onOpen = vi.fn();
  const view = render(<Harness onOpen={onOpen} />);
  const link = view.getByText("link"), button = view.getByText("button");
  pointer(link, "pointerdown", 0);
  pointer(link, "pointermove", 51);
  pointer(link, "pointerup", 51);
  pointer(button, "pointerdown", 100);
  pointer(button, "pointerup", 100);
  fireEvent.click(button);
  expect(onOpen).toHaveBeenCalledOnce();
});

it("collection sweep cards leave release-click ownership to the selection gesture", () => {
  const onOpen = vi.fn();
  const view = render(<Harness onOpen={onOpen} selection />);
  const button = view.getByText("button");
  pointer(button, "pointerdown", 0);
  pointer(button, "pointermove", 80);
  pointer(button, "pointerup", 80);
  fireEvent.click(button);
  expect(onOpen).toHaveBeenCalledOnce();
});
