import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSearch } from "./workspace-search";

afterEach(cleanup);

describe("WorkspaceSearch clear focus", () => {
  it.each(["mouse", "{Enter}", " "])("returns typing to the real input after clearing with %s and preserves caller events", async activation => {
    const user = userEvent.setup();
    const focus = vi.fn(), blur = vi.fn(), key = vi.fn(), submit = vi.fn(event => event.preventDefault());
    function Search() {
      const [value, setValue] = useState("prior query");
      return <WorkspaceSearch value={value} onChange={setValue} label="收藏搜索" onSubmit={submit}
        inputProps={{ onFocus: focus, onBlur: blur, onKeyDown: key }} />;
    }
    render(<Search />);
    const search = screen.getByRole("searchbox");
    expect(search).not.toHaveFocus();
    await user.click(search);
    if (activation === "mouse") await user.click(screen.getByRole("button", { name: "清空搜索" }));
    else {
      await user.tab();
      expect(screen.getByRole("button", { name: "清空搜索" })).toHaveFocus();
      await user.keyboard(activation);
    }
    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
    expect(screen.queryByRole("button", { name: "清空搜索" })).toBeNull();
    expect(focus).toHaveBeenCalledTimes(2);
    expect(blur).toHaveBeenCalledTimes(1);
    await user.keyboard("next query");
    expect(search).toHaveValue("next query");
    expect(key).toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not claim focus on unrelated rerenders", async () => {
    const user = userEvent.setup();
    function Search({ value }: { value: string }) {
      return <><button>另一个控件</button><WorkspaceSearch value={value} onChange={() => {}} label="收藏搜索" /></>;
    }
    const view = render(<Search value="" />);
    const other = screen.getByRole("button", { name: "另一个控件" });
    await user.click(other);
    view.rerender(<Search value="changed elsewhere" />);
    expect(other).toHaveFocus();
  });
});

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
