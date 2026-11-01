import type { HTMLAttributes } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { clearFaviconResolutionCache } from "../components/favicon";
import { createDefaultState } from "../data/defaults";
import { createSiteHubStore, type SiteHubStore } from "../lib/state-store";
import { STORAGE_KEY } from "../lib/storage";

let restoreStorageWrite: (() => void) | undefined;

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy({}, {
    get: (_target, tag: string) => ({ children, ...props }: HTMLAttributes<HTMLElement>) => {
      const { initial: _initial, animate: _animate, exit: _exit, layout: _layout,
        transition: _transition, ...htmlProps } = props as HTMLAttributes<HTMLElement> & Record<string, unknown>;
      const Tag = tag as keyof HTMLElementTagNameMap;
      return <Tag {...htmlProps}>{children}</Tag>;
    },
  }),
  useReducedMotion: () => true,
}));

function searchInput() {
  return screen.getByRole("searchbox", { name: "搜索网页或筛选收藏" });
}

function setup() {
  const state = createDefaultState();
  state.searchHistory = [{ query: "synthetic history", searchedAt: "2026-10-31T00:00:00.000Z" }];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const store = createSiteHubStore({}, localStorage);
  const query = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", { runtime: { id: "synthetic-search-provider" }, search: { query } });
  return { state, store, query, user: userEvent.setup() };
}

describe("collection search session through the real App", () => {
  beforeEach(() => {
    localStorage.clear();
    clearFaviconResolutionCache();
    window.history.replaceState(null, "");
  });
  afterEach(() => {
    cleanup();
    restoreStorageWrite?.();
    restoreStorageWrite = undefined;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "");
  });

  it("returns to the original workspace All if the search origin group disappears", async () => {
    const { state, store, user, query } = setup();
    let receive: Parameters<NonNullable<SiteHubStore["subscribe"]>>[0] | undefined;
    store.subscribe = listener => { receive = listener; return () => {}; };
    const save = vi.spyOn(store, "save");
    render(<App store={store} />);
    await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
    await user.click(screen.getByRole("tab", { name: /仓库/ }));
    await act(async () => {});
    save.mockClear();
    fireEvent.change(searchInput(), { target: { value: "synthetic" } });
    expect(screen.getByRole("heading", { name: "全库搜索" })).toBeInTheDocument();

    const next = { ...state, groups: state.groups.filter(group => group.id !== "github-repositories") };
    act(() => receive?.({ state: next, recovered: false }));
    await user.click(screen.getByRole("button", { name: "清空搜索" }));
    expect(screen.queryByRole("tab", { name: /仓库/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 GitHub 收藏" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "全部 GitHub" })).toBeInTheDocument();
    expect(searchInput()).toHaveFocus();
    expect(query).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    { target: "group", heading: "设计" },
    { target: "home", heading: "全部网站" },
    { target: "github", heading: "全部 GitHub" },
  ])("abandons the old group origin when navigating to $target during search", async ({ target, heading }) => {
    const { store, user, query } = setup();
    render(<App store={store} />);
    await user.click(screen.getByRole("tab", { name: /开发/ }));
    fireEvent.change(searchInput(), { target: { value: "synthetic" } });
    if (target === "group") await user.click(screen.getByRole("tab", { name: /设计/ }));
    else await user.click(screen.getByRole("button", { name: target === "home" ? "打开收藏主页" : "打开 GitHub 收藏" }));
    expect(searchInput()).toHaveValue("");
    expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    fireEvent.change(searchInput(), { target: { value: "second synthetic" } });
    await user.click(screen.getByRole("button", { name: "清空搜索" }));
    expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps the query and origin across browser Back from Data, while the Data back button returns home", async () => {
    const { store, user, query } = setup();
    render(<App store={store} />);
    await user.click(screen.getByRole("tab", { name: /开发/ }));
    fireEvent.change(searchInput(), { target: { value: "synthetic" } });
    await user.click(screen.getByRole("button", { name: "打开数据" }));
    expect(screen.queryByRole("searchbox", { name: "搜索网页或筛选收藏" })).not.toBeInTheDocument();
    // The App's popstate path receives the prior page state from browser Back.
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: null })));
    expect(searchInput()).toHaveValue("synthetic");
    await user.click(screen.getByRole("button", { name: "清空搜索" }));
    expect(screen.getByRole("tab", { name: /开发/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.change(searchInput(), { target: { value: "second synthetic" } });
    await user.click(screen.getByRole("button", { name: "打开数据" }));
    await user.click(screen.getByRole("button", { name: "返回收藏" }));
    expect(searchInput()).toHaveValue("");
    expect(screen.getByRole("heading", { name: "全部网站" })).toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
  });

  it("clears collection search history without submitting or deleting any collection", async () => {
    const { state, store, user, query } = setup();
    render(<App store={store} />);
    await user.click(searchInput());
    expect(screen.getByRole("listbox", { name: "最近搜索" })).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("button", { name: "清空" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("listbox", { name: "最近搜索" })).not.toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).searchHistory).toEqual([]));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.sites).toEqual(state.sites);
    expect(saved.groups).toEqual(state.groups);
    expect(query).not.toHaveBeenCalled();
  });

  it("still searches once when the real storage adapter rejects history, then retries only the save", async () => {
    const { store, user, query } = setup();
    render(<App store={store} />);
    const originalSetItem = Storage.prototype.setItem;
    let failOnce = true;
    const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === STORAGE_KEY && failOnce) {
        failOnce = false;
        throw new Error("synthetic quota failure");
      }
      originalSetItem.call(this, key, value);
    });
    restoreStorageWrite = () => writes.mockRestore();
    const save = vi.spyOn(store, "save");
    fireEvent.change(searchInput(), { target: { value: "  synthetic failure  " } });
    await user.click(screen.getByRole("button", { name: "搜索网页" }));
    expect(await screen.findByText("搜索已发起，但这条历史记录未能保存。")).toBeInTheDocument();
    expect(screen.queryByText("无法调用浏览器搜索，请稍后重试。")).not.toBeInTheDocument();
    expect(query).toHaveBeenCalledExactlyOnceWith({ text: "synthetic failure", disposition: "CURRENT_TAB" });
    expect(save).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "重试保存" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "重试保存" })).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).searchHistory[0].query).toBe("synthetic failure");
  });

  it("reports browser search failure independently after successfully saving history once", async () => {
    const { store, user, query } = setup();
    query.mockRejectedValueOnce(new Error("synthetic provider failure"));
    render(<App store={store} />);
    await act(async () => {});
    const save = vi.spyOn(store, "save");
    fireEvent.change(searchInput(), { target: { value: "synthetic provider" } });
    await user.click(searchInput());
    await user.keyboard("{Enter}");
    expect(await screen.findByText("无法调用浏览器搜索，请稍后重试。")).toBeInTheDocument();
    expect(screen.queryByText("搜索已发起，但这条历史记录未能保存。")).not.toBeInTheDocument();
    expect(query).toHaveBeenCalledExactlyOnceWith({ text: "synthetic provider", disposition: "CURRENT_TAB" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).searchHistory[0].query).toBe("synthetic provider");
  });
});
