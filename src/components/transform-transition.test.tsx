import type { ComponentProps } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CardSurface } from "./card-primitives";
import { SortableGroupSection } from "./sortable-group-section";

const sortable = vi.hoisted(() => ({
  setNodeRef: vi.fn(), listeners: {}, isDragging: false,
  transform: { x: 12, y: 24, scaleX: 1, scaleY: 1 } as { x: number; y: number; scaleX: number; scaleY: number } | null,
  transition: "transform 160ms ease",
}));
vi.mock("@dnd-kit/sortable", () => ({ useSortable: () => sortable }));
vi.mock("./group-section-header", () => ({ GroupSectionHeader: () => <header>Group</header> }));

afterEach(() => {
  cleanup(); vi.restoreAllMocks();
  sortable.transform = { x: 12, y: 24, scaleX: 1, scaleY: 1 };
});

function transition(target: HTMLElement, type: "transitionrun" | "transitionend" | "transitioncancel",
  propertyName = "transform", pseudoElement = "") {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { propertyName: { value: propertyName }, pseudoElement: { value: pseudoElement } });
  act(() => { target.dispatchEvent(event); });
}

it("marks only the card's own transform, preserves consumer callbacks and survives the rerender that removes a drag transform", () => {
  const onTransitionRun = vi.fn(), onTransitionEnd = vi.fn(), onTransitionCancel = vi.fn();
  const handlers = { onTransitionRun, onTransitionEnd, onTransitionCancel };
  const view = render(<CardSurface {...handlers} style={{ transform: "translateY(30px)" }}><span>Icon</span></CardSurface>);
  const card = view.container.querySelector("article")!, child = card.querySelector("span")!;
  expect(card).toHaveAttribute("data-has-transform", "true");
  transition(child, "transitionrun");
  transition(card, "transitionrun", "opacity");
  transition(card, "transitionrun", "transform", "::before");
  expect(card).not.toHaveAttribute("data-transform-transition");
  transition(card, "transitionrun");
  expect(card).toHaveAttribute("data-transform-transition", "true");
  expect(card.style.transform).toBe("translateY(30px)");

  view.rerender(<CardSurface {...handlers} className="resting" style={{}}><span>Icon</span></CardSurface>);
  expect(card.style.transform).toBe("");
  expect(card).not.toHaveAttribute("data-has-transform");
  expect(card).toHaveAttribute("data-transform-transition", "true");
  transition(child, "transitionend");
  transition(card, "transitionend", "transform", "::after");
  transition(card, "transitioncancel", "opacity");
  expect(card).toHaveAttribute("data-transform-transition", "true");
  transition(card, "transitionend");
  expect(card).not.toHaveAttribute("data-transform-transition");
  expect(onTransitionRun).toHaveBeenCalledTimes(4);
  expect(onTransitionEnd).toHaveBeenCalledTimes(3);
  expect(onTransitionCancel).toHaveBeenCalledOnce();
});

it("derives the card transform marker from the passed style without changing that style", () => {
  const view = render(<CardSurface style={{ transform: "none", opacity: .26 }} />);
  const card = view.container.querySelector("article")!;
  expect(card).not.toHaveAttribute("data-has-transform");
  expect(card.style.transform).toBe("none");
  expect(card.style.opacity).toBe("0.26");
  // Even an identity transform establishes the fixed-background boundary.
  view.rerender(<CardSurface style={{ transform: "translate3d(0px, 0px, 0px)", opacity: .78 }} />);
  expect(card).toHaveAttribute("data-has-transform", "true");
  expect(card.style.transform).toBe("translate3d(0px, 0px, 0px)");
  expect(card.style.opacity).toBe("0.78");
  view.rerender(<CardSurface />);
  expect(card).not.toHaveAttribute("data-has-transform");
});

it("does not let an old cancel/end event clear an active replacement transition", () => {
  const view = render(<CardSurface />), card = view.container.querySelector("article")!;
  const replacement = {
    transitionProperty: "transform", playState: "running" as AnimationPlayState, pending: false,
    effect: { target: card, pseudoElement: null as string | null },
  };
  card.getAnimations = () => [replacement as unknown as CSSTransition];
  transition(card, "transitionrun");
  transition(card, "transitioncancel");
  transition(card, "transitionend");
  expect(card).toHaveAttribute("data-transform-transition", "true");
  replacement.playState = "paused";
  transition(card, "transitioncancel");
  expect(card).toHaveAttribute("data-transform-transition", "true");
  replacement.playState = "finished";
  transition(card, "transitionend");
  expect(card).not.toHaveAttribute("data-transform-transition");

  replacement.playState = "running";
  replacement.effect.pseudoElement = "::before";
  transition(card, "transitionrun");
  transition(card, "transitioncancel");
  expect(card).not.toHaveAttribute("data-transform-transition");
});

it("keeps the group ancestor marked through its return without changing dnd-kit's transform or reacting to card events", () => {
  const noop = () => {};
  const props: ComponentProps<typeof SortableGroupSection> = {
    group: { id: "group", name: "Group", icon: "star", workspace: "main", order: 0,
      isProtected: false, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    disabled: false, count: 1, insertDisabled: false, actionsDisabled: false, onInsert: noop,
    onManage: noop, groupSelected: false, selectionMode: "none", onToggleGroupSelected: noop,
    onEnterGroupSelection: noop, allSitesSelected: false, onToggleSiteSelectionMode: noop,
    onToggleAllSites: noop, children: <CardSurface />,
  };
  const view = render(<SortableGroupSection {...props} />);
  const section = view.container.querySelector("section")!, card = view.container.querySelector("article")!;
  const transform = section.style.transform;
  expect(transform).toContain("12px");
  expect(section).toHaveAttribute("data-has-transform", "true");
  transition(card, "transitionrun");
  expect(card).toHaveAttribute("data-transform-transition", "true");
  expect(section).not.toHaveAttribute("data-transform-transition");
  transition(section, "transitionrun");
  expect(section.style.transform).toBe(transform);
  sortable.transform = null;
  view.rerender(<SortableGroupSection {...props} />);
  expect(section.style.transform).toBe("");
  expect(section).not.toHaveAttribute("data-has-transform");
  expect(section).toHaveAttribute("data-transform-transition", "true");
  transition(card, "transitioncancel");
  expect(section).toHaveAttribute("data-transform-transition", "true");
  transition(section, "transitioncancel");
  expect(section).not.toHaveAttribute("data-transform-transition");
});
