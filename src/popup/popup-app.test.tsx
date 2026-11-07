import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { STORAGE_KEY } from "../lib/storage";
import { addGroupToState } from "../lib/site-state";
import type { SiteCollectionState } from "../types";
import { PopupApp } from "./popup-app";

function installChromeMock(options: {
  tab?: { id?: number; title: string; url: string; favIconUrl?: string };
  withoutGithubHome?: boolean;
  state?: SiteCollectionState;
} = {}) {
  const baseState = options.state ?? createDefaultState();
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
        favIconUrl: options.tab?.favIconUrl,
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

async function chooseQuickGroup(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: "收藏到分组" }));
  await user.click(screen.getByRole("option", { name }));
}

it("applies the shared independent overlay material in both popup tabs with clear zero-blur cards", async () => {
  const user = userEvent.setup();
  const state = createDefaultState();
  state.wallpaper = { ...state.wallpaper, glassTransparency: 100, glassBlur: 0,
    glassSaturation: 100, overlayTransparency: 42, overlayBlur: 17,
    overlayBackdropDim: 0, overlayReadabilityProtection: false };
  installChromeMock({ state });
  render(<PopupApp />);
  await screen.findByRole("textbox", { name: "网站名称" });
  const root = document.documentElement;
  expect(root.dataset.glassSurface).toBe("popup");
  expect(root.style.getPropertyValue("--card-glass-filter")).toBe("none");
  expect(root.style.getPropertyValue("--card-glass-opacity")).toBe("0%");
  expect(root.style.getPropertyValue("--overlay-glass-filter")).toBe("blur(17px)");
  expect(root.style.getPropertyValue("--overlay-glass-opacity")).toBe("58%");
  await user.click(screen.getByRole("button", { name: "浏览器书签" }));
  await screen.findByRole("button", { name: "导入到分组" });
  expect(root.style.getPropertyValue("--overlay-glass-filter")).toBe("blur(17px)");
  expect(root.style.getPropertyValue("--overlay-glass-opacity")).toBe("58%");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
});

describe("toolbar popup", () => {
  it("labels a child by its path and saves the current page into that child via extension storage", async () => {
    const state = addGroupToState(createDefaultState(), "灵感", "palette", "child", undefined, undefined, "main", "design");
    const { set } = installChromeMock({ state });
    const user = userEvent.setup();
    render(<PopupApp />);
    await chooseQuickGroup(user, "设计 / 灵感");
    const save = screen.getByRole("button", { name: "收藏当前网页" });
    await user.click(save);
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    const saved: SiteCollectionState = JSON.parse(set.mock.calls[0][0][STORAGE_KEY]);
    expect(saved.groups.find(group => group.id === "child")?.parentId).toBe("design");
    expect(saved.sites.find(site => site.url === "https://platform.openai.com/docs")?.groupId).toBe("child");
  });

  it("remembers a child target on reopen without replacing the saved group of a known site", async () => {
    const state = addGroupToState(createDefaultState(), "灵感", "palette", "child", undefined, undefined, "main", "design");
    const user = userEvent.setup();
    const first = installChromeMock({ state });
    const initialPopup = render(<PopupApp />);
    await chooseQuickGroup(user, "设计 / 灵感");
    await user.click(screen.getByRole("button", { name: "收藏当前网页" }));
    await waitFor(() => expect(first.set).toHaveBeenCalledTimes(1));
    const saved: SiteCollectionState = JSON.parse(first.set.mock.calls[0][0][STORAGE_KEY]);
    initialPopup.unmount();

    installChromeMock({ state: saved, tab: { title: "新网页", url: "https://example.org/new-popup-page" } });
    const nextPopup = render(<PopupApp />);
    expect(await screen.findByRole("button", { name: "收藏到分组" })).toHaveTextContent("设计 / 灵感");
    expect(screen.getByText("最近使用的分组")).toBeVisible();
    nextPopup.unmount();

    installChromeMock({ state: saved, tab: { title: "浏览器标题", url: state.sites[0].url } });
    render(<PopupApp />);
    expect(await screen.findByRole("button", { name: "收藏到分组" })).toHaveTextContent("搜索");
    expect(screen.getByRole("button", { name: "保存修改" })).toBeVisible();
  });

  it("creates a group and adds the current page in one write based on the latest collection", async () => {
    const state = createDefaultState();
    state.sites[0].note = "保留已有备注";
    const { get, set } = installChromeMock({ state });
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "新建分组" }));
    const input = screen.getByRole("textbox", { name: "新分组名称" });
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: "新建分组并添加" })).toBeDisabled();
    await user.type(input, "  工作资料  ");
    expect(set).not.toHaveBeenCalled();
    const fresh = {
      ...state,
      groups: [...state.groups, { ...state.groups[0], id: "concurrent", name: "其他窗口新增", order: 99 }],
      appearance: { ...state.appearance, fontScale: 105 },
    };
    get.mockResolvedValue({ [STORAGE_KEY]: JSON.stringify(fresh) });
    await user.click(screen.getByRole("button", { name: "新建分组并添加" }));
    expect(await screen.findByText("已新建“工作资料”，并添加当前网站。")).toBeInTheDocument();
    expect(set).toHaveBeenCalledTimes(1);
    const saved: SiteCollectionState = JSON.parse(set.mock.calls[0][0][STORAGE_KEY]);
    const group = saved.groups.find(group => group.name === "工作资料");
    expect(group).toMatchObject({ workspace: "main", icon: "folder", isProtected: false });
    expect(saved.groups).toHaveLength(fresh.groups.length + 1);
    expect(saved.groups.some(group => group.id === "concurrent")).toBe(true);
    expect(saved.sites.find(site => site.url === "https://platform.openai.com/docs")?.groupId).toBe(group?.id);
    expect(saved.sites).toHaveLength(fresh.sites.length + 1);
    expect(saved.sites.find(site => site.id === state.sites[0].id)?.note).toBe("保留已有备注");
    expect(saved.appearance.fontScale).toBe(105);
    expect(screen.queryByRole("textbox", { name: "新分组名称" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收藏到分组" })).toHaveTextContent("工作资料");
  });

  it("cancels group drafts by button, Escape or selecting an existing group without writing", async () => {
    const { set } = installChromeMock();
    const user = userEvent.setup();
    render(<PopupApp />);
    const trigger = await screen.findByRole("button", { name: "新建分组" });
    await user.click(trigger);
    await user.type(screen.getByRole("textbox", { name: "新分组名称" }), "不保存");
    await user.click(screen.getByRole("button", { name: "取消新建分组" }));
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByRole("textbox", { name: "新分组名称" })).toHaveValue("");
    await user.type(screen.getByRole("textbox", { name: "新分组名称" }), "也不保存{Escape}");
    expect(screen.queryByRole("textbox", { name: "新分组名称" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.type(screen.getByRole("textbox", { name: "新分组名称" }), "临时分组");
    await chooseQuickGroup(user, "开发");
    expect(screen.queryByRole("textbox", { name: "新分组名称" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收藏到分组" })).toHaveTextContent("开发");
    expect(screen.getByRole("button", { name: "收藏当前网页" })).toBeEnabled();
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects a same-workspace group created after opening the popup", async () => {
    const state = createDefaultState();
    const { get, set } = installChromeMock({ state });
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "新建分组" }));
    await user.type(screen.getByRole("textbox", { name: "新分组名称" }), "  MY TEAM  ");
    const fresh = { ...state, groups: [...state.groups, {
      ...state.groups[0], id: "latest-team", name: "My Team", order: 99,
    }] };
    get.mockResolvedValue({ [STORAGE_KEY]: JSON.stringify(fresh) });
    await user.click(screen.getByRole("button", { name: "新建分组并添加" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("已经有同名分组");
    expect(screen.getByRole("textbox", { name: "新分组名称" })).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "收藏到分组" }));
    expect(screen.getByRole("option", { name: "My Team" })).toBeInTheDocument();
    expect(set).not.toHaveBeenCalled();
  });

  it("creates GitHub groups in the detected workspace even when the homepage has the same group name", async () => {
    const { set } = installChromeMock({ tab: { title: "仓库", url: "https://github.com/acme/repo" } });
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "新建分组" }));
    await user.type(screen.getByRole("textbox", { name: "新分组名称" }), "开发{Enter}");
    expect(await screen.findByText("已新建“开发”，并添加当前网站。")).toBeInTheDocument();
    expect(set).toHaveBeenCalledTimes(1);
    const saved: SiteCollectionState = JSON.parse(set.mock.calls[0][0][STORAGE_KEY]);
    const group = saved.groups.find(group => group.workspace === "github" && group.name === "开发");
    expect(group).toBeDefined();
    expect(group?.id).not.toBe("develop");
    expect(saved.sites.find(site => site.url === "https://github.com/acme/repo")?.groupId).toBe(group?.id);
    expect(JSON.parse(localStorage.getItem("site-hub:popup-preferences")!).lastGithubGroupId).toBe(group?.id);
  });

  it("only creates the destination after confirming a duplicate and preserves its note and identity", async () => {
    const state = createDefaultState();
    const existing = state.sites.find(site => site.id === "google")!;
    existing.note = "已有网站的备注";
    existing.clickCount = 9;
    const { set } = installChromeMock({ state, tab: { title: "新的 Google 名称", url: existing.url } });
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "新建分组" }));
    await user.type(screen.getByRole("textbox", { name: "新分组名称" }), "新的搜索组");
    await user.click(screen.getByRole("button", { name: "新建分组并添加" }));
    expect(await screen.findByText(/再次确认会新建“新的搜索组”/)).toBeInTheDocument();
    expect(set).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认新建并移动" }));
    expect(await screen.findByText("已新建“新的搜索组”，并移动更新现有收藏。")).toBeInTheDocument();
    expect(set).toHaveBeenCalledTimes(1);
    const saved: SiteCollectionState = JSON.parse(set.mock.calls[0][0][STORAGE_KEY]);
    const group = saved.groups.find(group => group.name === "新的搜索组");
    expect(saved.sites).toHaveLength(state.sites.length);
    expect(saved.groups).toHaveLength(state.groups.length + 1);
    expect(saved.sites.find(site => site.id === existing.id)).toMatchObject({
      name: existing.name, groupId: group?.id, note: existing.note, clickCount: 9, createdAt: existing.createdAt,
    });
  });

  it("requires confirmation when another window saves the current page before group creation", async () => {
    const state = createDefaultState();
    const { get, set } = installChromeMock({ state });
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "新建分组" }));
    await user.type(screen.getByRole("textbox", { name: "新分组名称" }), "资料");
    get.mockResolvedValue({ [STORAGE_KEY]: JSON.stringify({ ...state, sites: [...state.sites, {
      ...state.sites[0], id: "concurrent-site", url: "https://platform.openai.com/docs", note: "别处新增的备注",
    }] }) });
    await user.click(screen.getByRole("button", { name: "新建分组并添加" }));
    expect(await screen.findByRole("button", { name: "确认新建并移动" })).toBeEnabled();
    expect(set).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认新建并移动" }));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    const saved: SiteCollectionState = JSON.parse(set.mock.calls[0][0][STORAGE_KEY]);
    expect(saved.sites.filter(site => site.url === "https://platform.openai.com/docs")).toHaveLength(1);
    expect(saved.sites.find(site => site.id === "concurrent-site")?.note).toBe("别处新增的备注");
    expect(saved.groups).toHaveLength(state.groups.length + 1);
  });

  it("keeps a failed group-and-site write retryable without first saving an empty group", async () => {
    const { set } = installChromeMock();
    set.mockRejectedValueOnce(new Error("write failed"));
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "新建分组" }));
    await user.type(screen.getByRole("textbox", { name: "新分组名称" }), "稍后重试");
    await user.click(screen.getByRole("button", { name: "新建分组并添加" }));
    expect(await screen.findByText("保存失败，请稍后重试。")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "新分组名称" })).toHaveValue("稍后重试");
    await user.click(screen.getByRole("button", { name: "收藏到分组" }));
    expect(screen.queryByRole("option", { name: "稍后重试" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(set).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "新建分组并添加" }));
    expect(await screen.findByText("已新建“稍后重试”，并添加当前网站。")).toBeInTheDocument();
    expect(set).toHaveBeenCalledTimes(2);
    for (const call of set.mock.calls) {
      const candidate: SiteCollectionState = JSON.parse(call[0][STORAGE_KEY]);
      const matchingGroups = candidate.groups.filter(group => group.name === "稍后重试");
      expect(matchingGroups).toHaveLength(1);
      expect(candidate.sites.some(site => site.groupId === matchingGroups[0].id)).toBe(true);
    }
  });

  it("disables new groups for browser pages that cannot be bookmarked", async () => {
    const { set } = installChromeMock({ tab: { title: "扩展", url: "chrome://extensions" } });
    render(<PopupApp />);
    expect(await screen.findByRole("button", { name: "新建分组" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "收藏当前网页" })).toBeDisabled();
    expect(set).not.toHaveBeenCalled();
  });

  it("keeps an unsaved addition retryable when storage rejects the write", async () => {
    const { set } = installChromeMock();
    set.mockRejectedValueOnce(new Error("write failed"));
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "收藏当前网页" }));
    expect(await screen.findByText("保存失败，请稍后重试。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "收藏当前网页" }));
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
    await user.click(await screen.findByRole("button", { name: "收藏当前网页" }));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
  });
  it("saves the current tab URL intact without mistaking a case variant for an existing bookmark", async () => {
    const state = createDefaultState();
    const existing = { ...state.sites[0], id: "case-variant", name: "Lowercase document",
      url: "https://example.com/guide?ID=AbC#installation/" };
    state.sites.push(existing);
    const url = "https://example.com/Guide?ID=AbC#installation/";
    const { set } = installChromeMock({ state, tab: { title: "Anchored document", url } });
    const user = userEvent.setup();
    render(<PopupApp />);

    await user.click(await screen.findByRole("button", { name: "收藏当前网页" }));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    const saved: SiteCollectionState = JSON.parse(set.mock.calls[0][0][STORAGE_KEY]);
    expect(saved.sites.find((site) => site.name === "Anchored document")?.url).toBe(url);
    expect(saved.sites.find((site) => site.id === existing.id)?.url).toBe(existing.url);
    expect(saved.sites).toHaveLength(state.sites.length + 1);
    expect(screen.queryByRole("button", { name: "确认移动并更新" })).not.toBeInTheDocument();
  });

  it("reads the active tab and adds it to the shared homepage state", async () => {
    const { set } = installChromeMock({
      tab: {
        title: "OpenAI Developers",
        url: "https://platform.openai.com/docs",
        favIconUrl: "https://platform.openai.com/favicon.ico",
      },
    });
    const user = userEvent.setup();
    render(<PopupApp />);
    expect(await screen.findByRole("textbox", { name: /网站名称/ })).toHaveValue("OpenAI Developers");
    expect(screen.getByTestId("popup-target-icon").querySelector("img"))
      .toHaveAttribute("src", "https://platform.openai.com/favicon.ico");
    expect(screen.getByRole("button", { name: "收藏到分组" })).toHaveTextContent("搜索");
    await chooseQuickGroup(user, "开发");
    expect(screen.getByRole("button", { name: "收藏到分组" })).toHaveTextContent("开发");
    expect(screen.getByRole("heading", { name: "当前网页" })).toBeVisible();
    expect(screen.getByText("platform.openai.com", { exact: true })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "收藏当前网页" }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const saved = JSON.parse(set.mock.calls.at(-1)![0][STORAGE_KEY]);
    expect(saved.sites.find((site: { url: string }) => site.url === "https://platform.openai.com/docs")?.groupId).toBe("develop");
  });

  it("adds a note to the current website directly from quick add", async () => {
    const { set } = installChromeMock({ tab: { title: "设计文档", url: "https://example.com/design-notes" } });
    const user = userEvent.setup();
    render(<PopupApp />);
    const note = await screen.findByRole("textbox", { name: "网站备注" });
    expect(note).toHaveValue("");
    await user.type(note, "项目资料{Enter}第二行");
    await user.click(screen.getByRole("button", { name: "收藏当前网页" }));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    const saved: SiteCollectionState = JSON.parse(set.mock.calls[0][0][STORAGE_KEY]);
    expect(saved.sites.find(site => site.url === "https://example.com/design-notes")?.note).toBe("项目资料\n第二行");
  });

  it("loads and updates an existing website note in quick add", async () => {
    const state = createDefaultState();
    const existing = state.sites[0];
    existing.note = "原备注";
    existing.customIconUrl = "https://example.com/saved-icon.png";
    existing.iconSource = "custom";
    const { set } = installChromeMock({ state, tab: { title: "更新后的名称", url: existing.url } });
    const user = userEvent.setup();
    render(<PopupApp />);
    const note = await screen.findByRole("textbox", { name: "网站备注" });
    expect(note).toHaveValue("原备注");
    await user.clear(note);
    await user.type(note, "弹窗里更新的备注");
    expect(screen.getByRole("textbox", { name: "网站名称" })).toHaveValue(existing.name);
    expect(screen.getByRole("button", { name: "收藏到分组" })).toHaveTextContent("搜索");
    await chooseQuickGroup(user, "开发");
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    const saved: SiteCollectionState = JSON.parse(set.mock.calls[0][0][STORAGE_KEY]);
    expect(saved.sites).toHaveLength(state.sites.length);
    expect(saved.sites.find(site => site.id === existing.id)).toMatchObject({
      name: existing.name, note: "弹窗里更新的备注", groupId: "develop",
      customIconUrl: existing.customIconUrl, iconSource: "custom",
    });
  });

  it("preserves the current stored group when another window moves a site during a note-only edit", async () => {
    const state = createDefaultState();
    const existing = state.sites[0];
    const { get, set } = installChromeMock({ state, tab: { title: "Google", url: existing.url } });
    const user = userEvent.setup();
    render(<PopupApp />);
    const note = await screen.findByRole("textbox", { name: "网站备注" });
    await user.type(note, "新的备注");
    const moved = { ...state, sites: state.sites.map(site => site.id === existing.id
      ? { ...site, groupId: "media", name: "刚改过的名字" } : site) };
    get.mockResolvedValue({ [STORAGE_KEY]: JSON.stringify(moved) });
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    const saved: SiteCollectionState = JSON.parse(set.mock.calls[0][0][STORAGE_KEY]);
    expect(saved.sites.find(site => site.id === existing.id)).toMatchObject({
      groupId: "media", name: "刚改过的名字", note: "新的备注",
    });
  });

  it("opens bookmark folders as separate card views and uses the browser favicon", async () => {
    installChromeMock();
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: /浏览器书签/ }));

    expect(screen.queryByText("整理已有书签")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开书签文件夹 工作" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "打开书签文件夹 收藏夹栏" }));
    await user.click(screen.getByRole("button", { name: "打开书签文件夹 工作" }));

    const bookmarkCard = screen.getByTestId("bookmark-card-notion");
    expect(within(bookmarkCard).getByRole("button", { name: "选择 Notion" })).toBeInTheDocument();
    const favicon = bookmarkCard.querySelector("img");
    expect(favicon?.getAttribute("src")).toContain("/_favicon/?pageUrl=https%3A%2F%2Fnotion.so&size=64");
    expect(bookmarkCard.querySelector(".favicon-frame")).toHaveClass("favicon-large");
    expect(screen.getByRole("button", { name: "返回上一级书签文件夹" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "返回上一级书签文件夹" }));
    expect(screen.getByRole("button", { name: "打开书签文件夹 工作" })).toBeInTheDocument();
    expect(screen.queryByTestId("bookmark-card-notion")).not.toBeInTheDocument();
  });

  it("copies selected folder links into a chosen child and routes native management to the full page", async () => {
    const state = addGroupToState(createDefaultState(), "灵感", "palette", "child", undefined, undefined, "main", "design");
    const { set, remove, removeTree } = installChromeMock({ state });
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: /浏览器书签/ }));
    await user.click(screen.getByRole("button", { name: "打开书签文件夹 收藏夹栏" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 工作" }));
    await user.click(screen.getByRole("button", { name: "导入到分组" }));
    await user.click(screen.getByRole("option", { name: "设计 / 灵感" }));
    await user.click(screen.getByRole("button", { name: "导入所选" }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const imported = JSON.parse(set.mock.calls.at(-1)![0][STORAGE_KEY]);
    expect(imported.groups).toHaveLength(state.groups.length);
    expect(imported.sites.find((site: { url: string }) => site.url === "https://notion.so")?.groupId).toBe("child");
    expect(screen.getByRole("link", { name: "完整书签管理" }))
      .toHaveAttribute("href", "chrome-extension://test-extension/index.html?data=bookmarks");
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    expect(removeTree).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("site-hub:popup-preferences")!).lastBookmarkGroupId).toBe("child");
  });

  it("shows matching bookmarks as cards without expanding their parent folders", async () => {
    installChromeMock();
    const user = userEvent.setup();
    render(<PopupApp />);
    await user.click(await screen.findByRole("button", { name: "浏览器书签" }));
    await user.type(screen.getByRole("textbox", { name: "搜索书签或网址" }), "Notion");
    expect(screen.getByTestId("bookmark-card-notion")).toBeVisible();
    expect(screen.queryByTestId("bookmark-card-work")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /展开|收起/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "选择 Notion" }));
    expect(screen.getByText("已选择", { exact: false })).toHaveTextContent("已选择 1 项");
    expect(screen.getByRole("button", { name: "导入所选" })).toBeEnabled();
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
    await user.click(screen.getByRole("button", { name: "收藏到 GitHub 分组" }));
    expect(screen.getByRole("option", { name: "其他" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "开发" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "其他" }));

    await user.click(screen.getByRole("button", { name: "收藏当前网页" }));
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
    await user.click(screen.getByRole("button", { name: "打开书签文件夹 收藏夹栏" }));
    await user.click(screen.getByRole("button", { name: "导入到分组" }));
    await user.click(screen.getByRole("option", { name: "开发" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 普通网站" }));
    await user.click(screen.getByRole("button", { name: "导入所选" }));
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

    expect(await screen.findByRole("button", { name: "收藏当前网页" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "收藏当前网页" }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const saved = JSON.parse(set.mock.calls.at(-1)![0][STORAGE_KEY]);
    expect(saved.sites.find((site: { url: string }) => site.url === "https://github.com")?.groupId).toBe(
      "search",
    );
  });
});
