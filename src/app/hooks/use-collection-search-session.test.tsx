import { StrictMode, useState, type FocusEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../../data/defaults";
import { searchWeb } from "../../lib/browser-search";
import type { SiteWorkspace } from "../../types";
import { useCollectionSearchSession, type CollectionSearchSessionOptions } from "./use-collection-search-session";

vi.mock("../../lib/browser-search", () => ({ searchWeb: vi.fn() }));
const search = vi.mocked(searchWeb);

function options(): CollectionSearchSessionOptions {
  return {
    activeWorkspace: "main", activeGroupId: "develop", groups: createDefaultState().groups,
    searchHistory: ["first history", "second history"].map(query => ({ query, searchedAt: "2026-11-01T00:00:00.000Z" })),
    setActiveWorkspace: vi.fn(), setActiveGroupId: vi.fn(),
    recordSearch: vi.fn().mockResolvedValue(undefined), onNotice: vi.fn(),
  };
}

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLInputElement>;
}

function formEvent() {
  return { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>;
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Value>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => { search.mockReset().mockResolvedValue(true); });
afterEach(cleanup);

describe("useCollectionSearchSession", () => {
  it("owns only idle session state and performs no search or save on StrictMode mount", () => {
    const input = options();
    const { result } = renderHook(() => useCollectionSearchSession(input), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    expect(result.current).toMatchObject({ query: "", historyOpen: false, historyIndex: -1 });
    expect(input.recordSearch).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(input.setActiveWorkspace).not.toHaveBeenCalled();
    expect(input.setActiveGroupId).not.toHaveBeenCalled();
  });

  it.each([
    { workspace: "main" as const, groupId: "develop" },
    { workspace: "github" as const, groupId: "github-repositories" },
  ])("coordinates $workspace group to global search and restores its first origin synchronously", ({ workspace, groupId }) => {
    const input = options();
    const { result } = renderHook(() => {
      const [activeWorkspace, setActiveWorkspace] = useState<SiteWorkspace>(workspace);
      const [activeGroupId, setActiveGroupId] = useState(groupId);
      const session = useCollectionSearchSession({ ...input, activeWorkspace, activeGroupId,
        setActiveWorkspace: next => { input.setActiveWorkspace(next); setActiveWorkspace(next); },
        setActiveGroupId: next => { input.setActiveGroupId(next); setActiveGroupId(next); },
      });
      return { session, activeWorkspace, activeGroupId };
    });
    act(() => {
      result.current.session.setCollectionQuery("  first query  ");
      expect(input.setActiveGroupId).toHaveBeenLastCalledWith("all");
    });
    expect(result.current.session.query).toBe("  first query  ");
    expect(result.current.activeGroupId).toBe("all");
    act(() => result.current.session.setCollectionQuery("second query"));
    expect(input.setActiveGroupId).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.session.setCollectionQuery("");
      expect(input.setActiveWorkspace).toHaveBeenLastCalledWith(workspace);
      expect(input.setActiveGroupId).toHaveBeenLastCalledWith(groupId);
    });
    expect(result.current.activeWorkspace).toBe(workspace);
    expect(result.current.activeGroupId).toBe(groupId);
    expect(input.recordSearch).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it("uses latest group membership when restoring and falls back to the origin workspace All", () => {
    const input = { ...options(), activeWorkspace: "github" as const, activeGroupId: "github-repositories" };
    const { result, rerender } = renderHook(props => useCollectionSearchSession(props), { initialProps: input as CollectionSearchSessionOptions });
    act(() => result.current.setCollectionQuery("query"));
    rerender({ ...input, activeWorkspace: "main", activeGroupId: "all",
      groups: input.groups.filter(group => group.id !== "github-repositories"),
    });
    act(() => result.current.setCollectionQuery("   "));
    expect(input.setActiveWorkspace).toHaveBeenLastCalledWith("github");
    expect(input.setActiveGroupId).toHaveBeenLastCalledWith("all");
    expect(result.current.query).toBe("   ");
    expect(input.recordSearch).not.toHaveBeenCalled();
  });

  it("discards an origin explicitly while preserving history UI until its own dismissal", () => {
    const input = options();
    const { result, rerender } = renderHook(props => useCollectionSearchSession(props), { initialProps: input });
    act(() => result.current.handleSearchFocus());
    act(() => result.current.handleSearchKeyDown(keyEvent("ArrowDown")));
    act(() => result.current.setCollectionQuery("query"));
    act(() => result.current.resetCollectionQuery());
    expect(result.current).toMatchObject({ query: "", historyOpen: true, historyIndex: 0 });
    rerender({ ...input, activeWorkspace: "github", activeGroupId: "github-docs" });
    act(() => result.current.setCollectionQuery(""));
    expect(input.setActiveWorkspace).not.toHaveBeenCalled();
    act(() => result.current.setCollectionQuery("new query"));
    act(() => result.current.setCollectionQuery(""));
    expect(input.setActiveWorkspace).toHaveBeenLastCalledWith("github");
    expect(input.setActiveGroupId).toHaveBeenLastCalledWith("github-docs");
    act(() => result.current.dismissHistory());
    expect(result.current).toMatchObject({ historyOpen: false, historyIndex: 0 });
  });

  it("does not start a global search or submit whitespace-only text", () => {
    const input = options();
    const { result } = renderHook(() => useCollectionSearchSession(input));
    const event = formEvent();
    act(() => result.current.setCollectionQuery("   "));
    act(() => result.current.handleSearchSubmit(event));
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(result.current.query).toBe("   ");
    expect(input.setActiveGroupId).not.toHaveBeenCalled();
    expect(input.recordSearch).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it("bounds history keyboard selection, resets on focus and Escape, and ignores inactive contexts", () => {
    const input = options();
    const { result, rerender } = renderHook(props => useCollectionSearchSession(props), { initialProps: input });
    const closed = keyEvent("ArrowDown");
    act(() => result.current.handleSearchKeyDown(closed));
    expect(closed.preventDefault).not.toHaveBeenCalled();
    act(() => result.current.handleSearchFocus());
    for (let count = 0; count < 4; count++) act(() => result.current.handleSearchKeyDown(keyEvent("ArrowDown")));
    expect(result.current.historyIndex).toBe(1);
    for (let count = 0; count < 4; count++) act(() => result.current.handleSearchKeyDown(keyEvent("ArrowUp")));
    expect(result.current.historyIndex).toBe(-1);
    act(() => result.current.handleSearchKeyDown(keyEvent("ArrowDown")));
    act(() => result.current.handleSearchKeyDown(keyEvent("Escape")));
    expect(result.current).toMatchObject({ historyOpen: false, historyIndex: -1 });
    act(() => result.current.handleSearchFocus());
    act(() => result.current.setCollectionQuery("filter"));
    const nonempty = keyEvent("ArrowDown");
    act(() => result.current.handleSearchKeyDown(nonempty));
    expect(nonempty.preventDefault).not.toHaveBeenCalled();
    act(() => result.current.resetCollectionQuery());
    rerender({ ...input, searchHistory: [] });
    const empty = keyEvent("ArrowDown");
    act(() => result.current.handleSearchKeyDown(empty));
    expect(empty.preventDefault).not.toHaveBeenCalled();
  });

  it.each(["keyboard", "mouse"])("activates the actual history text once through %s", async method => {
    const input = options();
    const { result } = renderHook(() => useCollectionSearchSession(input));
    act(() => result.current.handleSearchFocus());
    if (method === "keyboard") {
      act(() => result.current.handleSearchKeyDown(keyEvent("ArrowDown")));
      expect(result.current.query).toBe("");
      const event = keyEvent("Enter");
      await act(async () => result.current.handleSearchKeyDown(event));
      expect(event.preventDefault).toHaveBeenCalledOnce();
    } else await act(async () => result.current.activateHistoryQuery("first history"));
    expect(result.current).toMatchObject({ query: "first history", historyOpen: false });
    expect(input.recordSearch).toHaveBeenCalledExactlyOnceWith("first history");
    expect(search).toHaveBeenCalledExactlyOnceWith("first history");
  });

  it("does not silently reselect a different history entry after the selected entry disappears", () => {
    const input = options();
    const { result, rerender } = renderHook(props => useCollectionSearchSession(props), { initialProps: input });
    act(() => result.current.handleSearchFocus());
    act(() => result.current.handleSearchKeyDown(keyEvent("ArrowDown")));
    act(() => result.current.handleSearchKeyDown(keyEvent("ArrowDown")));
    rerender({ ...input, searchHistory: input.searchHistory.slice(0, 1) });
    const event = keyEvent("Enter");
    act(() => result.current.handleSearchKeyDown(event));
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(result.current.historyIndex).toBe(1);
    expect(result.current.query).toBe("");
    expect(search).not.toHaveBeenCalled();
    expect(input.recordSearch).not.toHaveBeenCalled();
    act(() => result.current.handleSearchFocus());
    expect(result.current.historyIndex).toBe(-1);
  });

  it("keeps history while focus stays inside the panel and handles quick blur then focus synchronously", () => {
    const input = options();
    const { result } = renderHook(() => useCollectionSearchSession(input));
    const panel = document.createElement("div");
    panel.className = "search-panel";
    const searchInput = document.createElement("input"), historyButton = document.createElement("button");
    panel.append(searchInput, historyButton);
    act(() => result.current.handleSearchFocus());
    act(() => result.current.handleSearchKeyDown(keyEvent("ArrowDown")));
    act(() => result.current.handleSearchBlur({ currentTarget: searchInput, relatedTarget: historyButton } as unknown as FocusEvent<HTMLElement>));
    expect(result.current).toMatchObject({ historyOpen: true, historyIndex: 0 });
    act(() => result.current.handleSearchBlur({ currentTarget: historyButton, relatedTarget: null } as unknown as FocusEvent<HTMLElement>));
    expect(result.current).toMatchObject({ historyOpen: false, historyIndex: 0 });
    act(() => {
      result.current.handleSearchBlur({ currentTarget: searchInput, relatedTarget: null } as unknown as FocusEvent<HTMLElement>);
      result.current.handleSearchFocus();
    });
    expect(result.current).toMatchObject({ historyOpen: true, historyIndex: -1 });
  });

  it("starts browser search without waiting for history save and leaves later navigation intact", async () => {
    const input = options();
    const saving = deferred<void>(), searching = deferred<boolean>();
    vi.mocked(input.recordSearch).mockReturnValue(saving.promise);
    search.mockReturnValue(searching.promise);
    const { result } = renderHook(() => useCollectionSearchSession(input));
    act(() => result.current.setCollectionQuery("  pending word  "));
    act(() => result.current.handleSearchSubmit(formEvent()));
    expect(input.recordSearch).toHaveBeenCalledExactlyOnceWith("pending word");
    expect(search).toHaveBeenCalledExactlyOnceWith("pending word");
    act(() => result.current.resetCollectionQuery());
    await act(async () => { saving.resolve(); searching.resolve(true); });
    expect(result.current.query).toBe("");
    expect(input.onNotice).not.toHaveBeenCalled();
    expect(input.setActiveWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    { historyFails: true, searchFails: false, notices: ["搜索已发起，但这条历史记录未能保存。"] },
    { historyFails: false, searchFails: true, notices: ["无法调用浏览器搜索，请稍后重试。"] },
    { historyFails: true, searchFails: true, notices: ["搜索已发起，但这条历史记录未能保存。", "无法调用浏览器搜索，请稍后重试。"] },
  ])("preserves independent failure paths (history=$historyFails, search=$searchFails)", async ({ historyFails, searchFails, notices }) => {
    const input = options();
    if (historyFails) vi.mocked(input.recordSearch).mockRejectedValueOnce(new Error("synthetic save failure"));
    if (searchFails) search.mockRejectedValueOnce(new Error("synthetic search failure"));
    const { result } = renderHook(() => useCollectionSearchSession(input));
    act(() => result.current.handleSearchFocus());
    act(() => result.current.setCollectionQuery("  exact word  "));
    await act(async () => result.current.handleSearchSubmit(formEvent()));
    expect(result.current.historyOpen).toBe(false);
    expect(input.recordSearch).toHaveBeenCalledExactlyOnceWith("exact word");
    expect(search).toHaveBeenCalledExactlyOnceWith("exact word");
    expect(vi.mocked(input.onNotice).mock.calls.map(([notice]) => notice))
      .toEqual(notices.map(message => ({ kind: "error", message })));
  });
});
