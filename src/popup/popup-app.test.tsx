import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { STORAGE_KEY } from "../lib/storage";
import { PopupApp } from "./popup-app";

function installChromeMock(options: {
  tab?: { id?: number; title: string; url: string };
  withoutGithubHome?: boolean;
} = {}) {
  const baseState = createDefaultState();
  const state = options.withoutGithubHome
    ? {
        ...baseState,
        sites: baseState.sites.filter((site) => site.id !== "github"),
      }
    : baseState;
  const set = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const removeTree = vi.fn().mockResolvedValue(undefined);
  const bookmarkTree = [{
    id: "root",
    title: "",
    children: [{
      id: "bar",
      title: "收藏夹栏",
      children: [{
        id: "work",
        parentId: "bar",
        title: "工作",
        children: [{
          id: "notion",
          parentId: "work",
          title: "Notion",
          url: "https://notion.so",
        }],
      }],
    }],
  }];
  (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
    runtime: {
      id: "test-extension",
      getURL: (path: string) => `chrome-extension://test-extension${path}`,
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ [STORAGE_KEY]: JSON.stringify(state) }),
        set,
      },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{
        id: options.tab?.id ?? 7,
        title: options.tab?.title ?? "OpenAI Developers",
        url: options.tab?.url ?? "https://platform.openai.com/docs",
      }]),
    },
    bookmarks: {
      getTree: vi.fn().mockResolvedValue(bookmarkTree),
      remove,
      removeTree,
    },
  };
  const chrome = (globalThis as typeof globalThis & { chrome: { storage: { local: { get: ReturnType<typeof vi.fn> } }; bookmarks: { getTree: ReturnType<typeof vi.fn> } } }).chrome;
  return { set, remove, removeTree, get: chrome.storage.local.get, getTree: chrome.bookmarks.getTree };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
});

describe("toolbar popup", () => {
  it("keeps an unsaved addition retryable when storage rejects the write", async () => {
    const { set } = installChromeMock();
    set.mockRejectedValueOnce(new Error("write failed"));
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "添加到主页" }));
    expect(await screen.findByText("保存失败，请稍后重试。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加到主页" }));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("已添加到主页。")).toBeInTheDocument();
  });

  it("shows a load failure instead of an endless loading screen", async () => {
    const { get } = installChromeMock();
    get.mockRejectedValue(new Error("read failed"));
    render(<PopupApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent("无法读取扩展数据");
    expect(screen.queryByText("正在读取收藏…")).not.toBeInTheDocument();
  });

  it("can still save the current page when the independent bookmark read fails", async () => {
    const { getTree, set } = installChromeMock();
    getTree.mockRejectedValue(new Error("bookmarks unavailable"));
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "添加到主页" }));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
  });
  it("reads the active tab and adds it to the shared homepage state", async () => {
    const { set } = installChromeMock();
    const user = userEvent.setup();
    render(<PopupApp />);
    expect(await screen.findByRole("textbox", { name: /网站名称/ })).toHaveValue("OpenAI Developers");
    expect(screen.queryByText("当前网页")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "保存到网站收藏" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加到主页" }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const saved = JSON.parse(set.mock.calls.at(-1)![0][STORAGE_KEY]);
    expect(saved.sites.some((site: { url: string }) => site.url === "https://platform.openai.com/docs")).toBe(true);
  });

  it("imports a selected bookmark folder and deletes it only after confirmation", async () => {
    const { set, removeTree } = installChromeMock();
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: /浏览器书签/ }));
    await user.click(screen.getByRole("checkbox", { name: "选择 工作" }));
    await user.click(screen.getByRole("button", { name: /添加到主页/ }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const imported = JSON.parse(set.mock.calls.at(-1)![0][STORAGE_KEY]);
    expect(imported.groups.some((group: { name: string }) => group.name === "工作")).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: "选择 工作" }));
    await user.click(screen.getByRole("button", { name: "删除" }));
    const confirm = screen.getByRole("alertdialog", { name: "删除浏览器原生书签？" });
    expect(within(confirm).getByText(/1 个网站和 1 个文件夹/)).toBeInTheDocument();
    expect(removeTree).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(removeTree).toHaveBeenCalledWith("work"));
  });

  it("deletes only matching sites when a filtered folder is selected", async () => {
    const { remove, removeTree } = installChromeMock();
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "浏览器书签" }));
    await user.type(screen.getByRole("textbox", { name: "搜索书签或网址" }), "Notion");
    expect(screen.getByText("Notion")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "收起 工作" }));
    expect(screen.queryByText("Notion")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开 工作" }));
    expect(screen.getByText("Notion")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "选择 工作" }));
    await user.click(screen.getByRole("button", { name: "删除" }));
    const confirm = screen.getByRole("alertdialog", { name: "删除浏览器原生书签？" });
    expect(within(confirm).getByText(/1 个网站和 0 个文件夹/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("notion"));
    expect(removeTree).not.toHaveBeenCalled();
  });

  it("detects a GitHub page and limits the destination to GitHub groups", async () => {
    const { set } = installChromeMock({
      tab: {
        title: "DewMysimple/GuoYoung",
        url: "https://github.com/DewMysimple/GuoYoung",
      },
    });
    const user = userEvent.setup();
    render(<PopupApp />);

    expect(await screen.findByRole("textbox", { name: /网站名称/ })).toHaveValue("DewMysimple/GuoYoung");
    await user.click(screen.getByRole("button", { name: "添加到 GitHub 分组" }));
    const groupMenu = screen.getByRole("listbox", { name: "添加到 GitHub 分组" });
    expect(within(groupMenu).getByRole("option", { name: "其他" })).toBeInTheDocument();
    expect(within(groupMenu).queryByRole("option", { name: "开发" })).not.toBeInTheDocument();
    await user.click(within(groupMenu).getByRole("option", { name: "其他" }));

    await user.click(screen.getByRole("button", { name: "添加到 GitHub" }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const saved = JSON.parse(set.mock.calls.at(-1)![0][STORAGE_KEY]);
    expect(saved.sites.find((site: { url: string }) => site.url.includes("DewMysimple"))?.groupId).toBe(
      "github-other",
    );
  });

  it("imports loose browser bookmarks into the selected homepage group while viewing GitHub", async () => {
    const { getTree, set } = installChromeMock({ tab: { title: "GitHub repo", url: "https://github.com/acme/repo" } });
    getTree.mockResolvedValue([{ id: "root", title: "", children: [{ id: "bar", title: "收藏夹栏", children: [
      { id: "loose", parentId: "bar", title: "普通网站", url: "https://example.org" },
    ] }] }]);
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "浏览器书签" }));
    await user.click(screen.getByRole("button", { name: "默认分组" }));
    await user.click(screen.getByRole("option", { name: "开发" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 普通网站" }));
    await user.click(screen.getByRole("button", { name: /添加到主页/ }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const saved = JSON.parse(set.mock.calls.at(-1)![0][STORAGE_KEY]);
    expect(saved.sites.find((site: { url: string }) => site.url === "https://example.org")?.groupId).toBe("develop");
  });

  it("treats the GitHub root as the shared homepage entry", async () => {
    const { set } = installChromeMock({
      withoutGithubHome: true,
      tab: { title: "GitHub", url: "https://github.com/" },
    });
    const user = userEvent.setup();
    render(<PopupApp />);

    expect(await screen.findByRole("button", { name: "添加到主页并同步顶部入口" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加到主页并同步顶部入口" }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const saved = JSON.parse(set.mock.calls.at(-1)![0][STORAGE_KEY]);
    expect(saved.sites.find((site: { url: string }) => site.url === "https://github.com")?.groupId).toBe(
      "search",
    );
  });
});
