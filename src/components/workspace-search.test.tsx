import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSearch } from "./workspace-search";

describe("WorkspaceSearch composition", () => {
  it("updates preedit text while leaving candidate keys to the IME and preventing submission", () => {
    const change = vi.fn(), submit = vi.fn(), key = vi.fn();
    render(<WorkspaceSearch value="" label="收藏搜索" onChange={change} onSubmit={submit} inputProps={{ onKeyDown: key }} />);
    const input = screen.getByRole("searchbox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "k'i'mi" } });
    expect(change).toHaveBeenCalledWith("k'i'mi");
    fireEvent.keyDown(input, { key: "ArrowDown", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.submit(screen.getByRole("search"));
    expect(key).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input, { target: { value: "Kimi" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(key).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(key).toHaveBeenCalledTimes(1);
    fireEvent.submit(screen.getByRole("search"));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
