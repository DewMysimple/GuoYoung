import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { STORAGE_KEY } from "../lib/storage";
import type { BrowserBookmarkTreeNode, BrowserTab, ChromiumExtensionApi } from "../lib/browser-runtime";
import { PopupApp } from "./popup-app";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function tree(label = "本代书签"): BrowserBookmarkTreeNode[] {
  return [{ id: "root", title: "", children: [{ id: "bar", title: label, children: [
    { id: "folder", title: "会话目录", children: [{ id: "site", title: "会话网页", url: "https://fixture.invalid/session/a" }] },
  ] }] }];
}

function installApi(label = "本代页面") {
  const calls: string[] = [];
  const get = vi.fn(async () => { calls.push("store.load"); return { [STORAGE_KEY]: JSON.stringify(createDefaultState()) }; });
  const set = vi.fn(async (_items: Record<string, unknown>): Promise<void> => undefined);
  const query = vi.fn(async (): Promise<BrowserTab[]> => { calls.push("tabs.query"); return [{ title: label, url: "https://fixture.invalid/current?Case=Keep#Part" }]; });
  const getTree = vi.fn(async () => { calls.push("bookmarks.getTree"); return tree(); });
  const remove = vi.fn(async (_id: string) => undefined);
  const removeTree = vi.fn(async (_id: string) => undefined);
  const api: ChromiumExtensionApi = {
    runtime: { id: label, getURL: path => `chrome-extension://session/${path}` },
    storage: { local: { get, set } }, tabs: { query }, bookmarks: { getTree, remove, removeTree },
  };
  Object.defineProperty(globalThis, "chrome", { configurable: true, writable: true, value: api });
  return { api, get, set, query, getTree, remove, removeTree, calls };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (globalThis as typeof globalThis & { chrome?: ChromiumExtensionApi }).chrome;
});

describe("popup bookmark session assembly baseline", () => {
  it("waits for the original allSettled transaction and applies one generation after all three reads", async () => {
    const fixture = installApi();
    const pending = deferred<BrowserBookmarkTreeNode[]>();
    fixture.getTree.mockImplementation(() => { fixture.calls.push("bookmarks.getTree"); return pending.promise; });
    render(<PopupApp />);
    expect(fixture.calls).toEqual(["store.load", "tabs.query", "bookmarks.getTree"]);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("正在读取收藏…")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "网站名称" })).not.toBeInTheDocument();
    await act(async () => pending.resolve(tree("完整读取书签")));
    expect(await screen.findByRole("textbox", { name: "网站名称" })).toHaveValue("本代页面");
    await userEvent.click(screen.getByRole("button", { name: "浏览器书签" }));
    expect(screen.getByRole("button", { name: "打开书签文件夹 完整读取书签" })).toBeInTheDocument();
    expect(fixture.get).toHaveBeenCalledTimes(1);
    expect(fixture.query).toHaveBeenCalledTimes(1);
    expect(fixture.getTree).toHaveBeenCalledTimes(1);
    expect(fixture.set).not.toHaveBeenCalled();
  });

  it("ignores an old api and store generation when its delayed tree finishes after replacement", async () => {
    const old = installApi("旧页面");
    const pending = deferred<BrowserBookmarkTreeNode[]>();
    old.getTree.mockReturnValue(pending.promise);
    const view = render(<PopupApp />);
    const current = installApi("新页面");
    current.getTree.mockResolvedValue(tree("新代书签"));
    view.rerender(<PopupApp />);
    expect(await screen.findByRole("textbox", { name: "网站名称" })).toHaveValue("新页面");
    await userEvent.click(screen.getByRole("button", { name: "浏览器书签" }));
    await act(async () => pending.resolve(tree("旧代书签")));
    expect(screen.getByRole("button", { name: "打开书签文件夹 新代书签" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开书签文件夹 旧代书签" })).not.toBeInTheDocument();
    expect(current.get).toHaveBeenCalledTimes(1);
    expect(current.getTree).toHaveBeenCalledTimes(1);
    expect(old.set).not.toHaveBeenCalled();
    expect(current.set).not.toHaveBeenCalled();
  });

  it("ignores old rejected read notices after api replacement and late results after unmount", async () => {
    const old = installApi("旧页面");
    const pending = deferred<BrowserBookmarkTreeNode[]>();
    old.getTree.mockReturnValue(pending.promise);
    const oldView = render(<PopupApp />);
    const current = installApi("现行页面");
    oldView.rerender(<PopupApp />);
    expect(await screen.findByRole("textbox", { name: "网站名称" })).toHaveValue("现行页面");
    await act(async () => pending.reject(new Error("old bookmark read failed")));
    expect(screen.queryByText("无法读取浏览器书签。")).not.toBeInTheDocument();
    oldView.unmount();
    const abandoned = deferred<BrowserBookmarkTreeNode[]>();
    current.getTree.mockReturnValueOnce(abandoned.promise);
    const abandonedView = render(<PopupApp />);
    abandonedView.unmount();
    const reopened = installApi("重新打开页面");
    reopened.getTree.mockResolvedValue(tree("重新打开书签"));
    render(<PopupApp />);
    expect(await screen.findByRole("textbox", { name: "网站名称" })).toHaveValue("重新打开页面");
    await act(async () => abandoned.resolve(tree("已卸载书签")));
    await userEvent.click(screen.getByRole("button", { name: "浏览器书签" }));
    expect(screen.getByRole("button", { name: "打开书签文件夹 重新打开书签" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开书签文件夹 已卸载书签" })).not.toBeInTheDocument();
    expect(reopened.getTree).toHaveBeenCalledTimes(1);
  });

  it("does not initialize a failed collection tree and retries all reads with the current result", async () => {
    const fixture = installApi();
    fixture.get.mockRejectedValueOnce(new Error("collection failed"));
    fixture.getTree.mockResolvedValueOnce(tree("未应用书签")).mockResolvedValueOnce(tree("重试书签"));
    render(<PopupApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent("无法读取扩展数据");
    expect(screen.queryByRole("button", { name: "浏览器书签" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重新读取" }));
    expect(await screen.findByRole("textbox", { name: "网站名称" })).toHaveValue("本代页面");
    await userEvent.click(screen.getByRole("button", { name: "浏览器书签" }));
    expect(screen.getByRole("button", { name: "打开书签文件夹 重试书签" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开书签文件夹 未应用书签" })).not.toBeInTheDocument();
    expect(fixture.get).toHaveBeenCalledTimes(2);
    expect(fixture.query).toHaveBeenCalledTimes(2);
    expect(fixture.getTree).toHaveBeenCalledTimes(2);
    expect(fixture.set).not.toHaveBeenCalled();
  });

  it("isolates a tab read failure while bookmarks remain usable and importable", async () => {
    const fixture = installApi();
    fixture.query.mockRejectedValue(new Error("tabs denied"));
    render(<PopupApp />);
    expect(await screen.findByText("无法读取标签页。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收藏当前网页" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "浏览器书签" }));
    await userEvent.click(screen.getByRole("button", { name: "打开书签文件夹 本代书签" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "选择 会话目录" }));
    await userEvent.click(screen.getByRole("button", { name: "导入所选" }));
    expect(await screen.findByText("新增 1 个，跳过 0 个，失败 0 个。")).toBeInTheDocument();
    expect(fixture.set).toHaveBeenCalledTimes(1);
  });

  it("shares one busy state between a deferred bookmark save and quick add", async () => {
    const fixture = installApi();
    const pending = deferred<void>();
    fixture.set.mockReturnValue(pending.promise);
    render(<PopupApp />);
    await userEvent.click(await screen.findByRole("button", { name: "浏览器书签" }));
    await userEvent.click(screen.getByRole("button", { name: "打开书签文件夹 本代书签" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "选择 会话目录" }));
    await userEvent.click(screen.getByRole("button", { name: "导入所选" }));
    await waitFor(() => expect(fixture.set).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "导入所选" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "快速收藏" }));
    expect(screen.getByRole("button", { name: "收藏当前网页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "新建分组" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "收藏当前网页" }));
    expect(fixture.set).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    expect(await screen.findByText("新增 1 个，跳过 0 个，失败 0 个。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收藏当前网页" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "浏览器书签" }));
    expect(screen.getByRole("checkbox", { name: "选择 会话目录" })).not.toBeChecked();
    expect(fixture.set).toHaveBeenCalledTimes(1);
  });
});
