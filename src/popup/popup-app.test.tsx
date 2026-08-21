import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { STORAGE_KEY } from "../lib/storage";
import { PopupApp } from "./popup-app";

function installChromeMock() {
  const state = createDefaultState();
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
        id: 7,
        title: "OpenAI Developers",
        url: "https://platform.openai.com/docs",
      }]),
    },
    bookmarks: {
      getTree: vi.fn().mockResolvedValue(bookmarkTree),
      remove,
      removeTree,
    },
  };
  return { set, remove, removeTree };
}

afterEach(() => {
  cleanup();
  delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
});

describe("toolbar popup", () => {
  it("reads the active tab and adds it to the shared homepage state", async () => {
    const { set } = installChromeMock();
    const user = userEvent.setup();
    render(<PopupApp />);
    expect(await screen.findByText("OpenAI Developers")).toBeInTheDocument();
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
});
