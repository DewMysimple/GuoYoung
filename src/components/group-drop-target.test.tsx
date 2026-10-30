import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GROUPS } from "../data/defaults";
import { GroupDropTab } from "./group-drop-target";

const sortable = vi.hoisted(() => ({
  isDragging: false,
  keyDown: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    isDragging: sortable.isDragging,
    attributes: {},
    listeners: { onKeyDown: sortable.keyDown },
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
  }),
}));

function pointer(target: Element, type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", x = 20, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, button, clientX: x, clientY: 20 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(target, event);
}

function setupTab() {
  const select = vi.fn(), manage = vi.fn(), sortIntent = vi.fn();
  const props = {
    group: DEFAULT_GROUPS.find((group) => group.id === "search")!,
    count: 2, selected: false, dragActive: false, dragOver: false, sortDisabled: false,
    onSelect: select, onManage: manage, onSortIntent: sortIntent,
  };
  const view = render(<GroupDropTab {...props} />);
  return { ...view, select, manage, sortIntent, props, tab: screen.getByRole("tab", { name: /搜索/ }) };
}

describe("GroupDropTab click lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sortable.isDragging = false;
    sortable.keyDown.mockReset();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("suppresses the delayed release click after a long drag is cancelled, then accepts a new pointer click", async () => {
    const view = setupTab();
    pointer(view.tab, "pointerdown");
    pointer(view.tab, "pointermove", 29);
    sortable.isDragging = true;
    view.rerender(<GroupDropTab {...view.props} />);
    await act(() => vi.advanceTimersByTimeAsync(1400));
    pointer(view.tab, "pointerdown", 29, 2);
    fireEvent.keyDown(view.tab, { key: "Escape" });
    sortable.isDragging = false;
    view.rerender(<GroupDropTab {...view.props} />);
    await act(() => vi.advanceTimersByTimeAsync(140));
    pointer(view.tab, "pointerup", 29);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(view.tab, { detail: 1 });
    expect(view.select).not.toHaveBeenCalled();

    pointer(view.tab, "pointerdown");
    pointer(view.tab, "pointerup");
    fireEvent.click(view.tab, { detail: 1 });
    expect(view.select).toHaveBeenCalledTimes(1);
  });

  it("keeps long-press suppression through a long hold and consumes a count-zero click from the same release", async () => {
    const { tab, manage, select } = setupTab();
    pointer(tab, "pointerdown");
    await act(() => vi.advanceTimersByTimeAsync(450));
    expect(manage).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    pointer(tab, "pointerup");
    fireEvent.click(tab);
    expect(select).not.toHaveBeenCalled();
  });

  it("does not swallow a fresh pointer click after cancellation produces no click", async () => {
    const { tab, select } = setupTab();
    pointer(tab, "pointerdown");
    pointer(tab, "pointermove", 29);
    pointer(tab, "pointercancel", 29);
    await act(() => vi.advanceTimersByTimeAsync(1400));
    pointer(tab, "pointerdown");
    pointer(tab, "pointerup");
    fireEvent.click(tab, { detail: 1 });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it.each(["Enter", " "])("preserves independent keyboard activation and the sortable %j handler after cancellation without a click", (key) => {
    const { tab, select } = setupTab();
    pointer(tab, "pointerdown");
    pointer(tab, "pointermove", 29);
    pointer(tab, "pointercancel", 29);
    fireEvent.keyDown(tab, { key });
    expect(sortable.keyDown).toHaveBeenCalledTimes(1);
    expect(sortable.keyDown.mock.calls[0][0].key).toBe(key);
    fireEvent.click(tab);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("allows independent assistive activation after a cancelled pointer has no release click", async () => {
    const { tab, select } = setupTab();
    pointer(tab, "pointerdown");
    pointer(tab, "pointermove", 29);
    pointer(tab, "pointerup", 29);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(tab, { detail: 0 });
    expect(select).toHaveBeenCalledTimes(1);
  });
});
