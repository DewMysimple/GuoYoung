import type { HTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearFaviconResolutionCache } from "./components/favicon";
import { createDefaultState } from "./data/defaults";
import { createGroupExportPayload, serializeExport } from "./lib/data-transfer";
import { STORAGE_KEY } from "./lib/storage";
import { App } from "./App";

function firePointerEvent(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: MouseEventInit & { pointerId: number },
) {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  fireEvent(target, event);
}

async function openTopAddSite(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByRole("button", { name: "添加" }));
  await user.click(screen.getByRole("menuitem", { name: /添加网站/ }));
}

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, ...props }: HTMLAttributes<HTMLElement>) => {
          const {
            initial: _initial,
            animate: _animate,
            exit: _exit,
            layout: _layout,
            transition: _transition,
            ...htmlProps
          } = props as HTMLAttributes<HTMLElement> & Record<string, unknown>;
          const Tag = tag as keyof HTMLElementTagNameMap;
          return <Tag {...htmlProps}>{children}</Tag>;
        },
    },
  ),
  useReducedMotion: () => true,
}));

describe("App", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    delete (
      globalThis as typeof globalThis & {
        chrome?: unknown;
      }
    ).chrome;
    localStorage.clear();
    clearFaviconResolutionCache();
  });

  it("shows the Mysimple brand without a duplicate page heading", () => {
    render(<App />);

    expect(
      screen.getByRole("link", { name: "Mysimple 首页" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "WebSite" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "搜索网页或筛选收藏" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开收藏主页" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开历史记录" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 GitHub 收藏" })).toBeInTheDocument();
  });

  it("switches between the main collection and the GitHub workspace", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
    expect(screen.getByRole("heading", { name: "全部 GitHub" })).toBeInTheDocument();
    const githubEntry = screen.getByRole("region", { name: "GitHub 官方主页" });
    expect(githubEntry).toBeInTheDocument();
    expect(within(githubEntry).getByRole("button", { name: "刷新仓库" })).toBeInTheDocument();
    expect(githubEntry.querySelector(".github-home-entry-full-link")).toHaveAttribute(
      "href",
      "https://github.com",
    );
    expect(screen.queryByText("GitHub 收藏已整理")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 GitHub 收藏" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "打开收藏主页" }));
    expect(screen.getByRole("heading", { name: "全部网站" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开 GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开收藏主页" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("searches the whole collection from every collection page and restores the group context", async () => {
    const state = createDefaultState();
    state.sites.push({
      ...state.sites[0],
      id: "cross-workspace-repo",
      name: "Acme Secret Repo",
      url: "https://github.com/acme/secret-repo",
      groupId: "github-other",
      globalOrder: state.sites.length,
    });
    state.sites.push({
      ...state.sites[0],
      id: "main-workspace-link",
      name: "Main Workspace Reference",
      url: "https://example.com/main-reference",
      groupId: "other",
      globalOrder: state.sites.length + 1,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
    const search = screen.getByRole("searchbox", { name: "搜索网页或筛选收藏" });
    fireEvent.change(search, { target: { value: "main-reference" } });
    expect(screen.getByRole("link", { name: "打开 Main Workspace Reference" })).toBeInTheDocument();
    expect(screen.getByTestId("site-card-main-workspace-link")).toHaveTextContent("收藏主页");
    expect(screen.getByRole("heading", { name: "全库搜索" })).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "搜索网页或筛选收藏" }),
      { target: { value: "secret-repo" } },
    );
    expect(screen.getByRole("link", { name: "打开 Acme Secret Repo" })).toBeInTheDocument();
    expect(screen.getByTestId("site-card-cross-workspace-repo")).toHaveTextContent("GitHub");
    expect(
      within(screen.getByRole("region", { name: "GitHub 官方主页" })).getByRole(
        "button",
        { name: "刷新仓库" },
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清空搜索" }));
    await user.click(screen.getByRole("button", { name: "打开收藏主页" }));
    await user.click(screen.getByRole("tab", { name: /开发/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索网页或筛选收藏" }), {
      target: { value: "main-reference" },
    });
    expect(screen.getByRole("link", { name: "打开 Main Workspace Reference" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "全库搜索" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清空搜索" }));
    expect(screen.getByRole("tab", { name: /开发/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "开发" })).toBeInTheDocument();
  });

  it("previews a GitHub author and imports the confirmed repositories into its group", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ login: "acme", type: "Organization", name: "Acme" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [
          {
            id: 101,
            name: "one",
            full_name: "acme/one",
            html_url: "https://github.com/acme/one",
            private: false,
            fork: false,
            archived: false,
          },
        ],
      } as Response);
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", fetchMock);

    try {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
      await user.click(screen.getByRole("button", { name: "导入 GitHub 作者仓库" }));

      const dialog = screen.getByRole("dialog", { name: "导入作者仓库" });
      await user.type(within(dialog).getByLabelText("作者或组织主页"), "https://github.com/acme");
      await user.click(within(dialog).getByRole("button", { name: "读取仓库" }));
      await waitFor(() => expect(within(dialog).getByText("acme/one")).toBeInTheDocument());
      expect(within(dialog).getByText("可添加 1")).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "确认添加 1 项" }));
      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
        expect(saved.sites.some((site: { url: string }) => site.url === "https://github.com/acme/one")).toBe(true);
        expect(saved.groups.some((group: { name: string; githubImportSource?: { login: string } }) =>
          group.name === "acme" && group.githubImportSource?.login === "acme",
        )).toBe(true);
      });
      expect(screen.getByRole("heading", { name: "acme" })).toBeInTheDocument();
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("refreshes every imported GitHub author from the fixed entry", async () => {
    const state = createDefaultState();
    const githubOther = state.groups.find((group) => group.id === "github-other")!;
    state.groups.push({
      ...githubOther,
      id: "github-octo",
      name: "octo",
      order: githubOther.order + 1,
      githubImportSource: {
        login: "octo",
        profileUrl: "https://github.com/octo",
        entityType: "user",
      },
    });
    state.groups = state.groups.map((group) =>
      group.id === "github-other"
        ? {
            ...group,
            githubImportSource: {
              login: "acme",
              profileUrl: "https://github.com/acme",
              entityType: "organization" as const,
            },
          }
        : group,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ login: "acme", type: "Organization", name: "Acme" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [
          {
            id: 201,
            name: "acme-repo",
            full_name: "acme/acme-repo",
            html_url: "https://github.com/acme/acme-repo",
            private: false,
            fork: false,
            archived: false,
          },
        ],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ login: "octo", type: "User", name: "Octo" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [
          {
            id: 202,
            name: "octo-repo",
            full_name: "octo/octo-repo",
            html_url: "https://github.com/octo/octo-repo",
            private: false,
            fork: false,
            archived: false,
          },
        ],
      } as Response);
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", fetchMock);

    try {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
      await user.click(screen.getByRole("button", { name: "刷新仓库" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
        expect(saved.sites.some((site: { url: string }) => site.url === "https://github.com/acme/acme-repo")).toBe(true);
        expect(saved.sites.some((site: { url: string }) => site.url === "https://github.com/octo/octo-repo")).toBe(true);
      });
      expect(screen.queryByRole("dialog", { name: "导入作者仓库" })).not.toBeInTheDocument();
      const refreshReport = screen.getByRole("dialog", { name: "GitHub 刷新详情" });
      expect(within(refreshReport).getByText("Acme")).toBeInTheDocument();
      expect(within(refreshReport).getByText("acme/acme-repo")).toBeInTheDocument();
      expect(within(refreshReport).getByText("Octo")).toBeInTheDocument();
      expect(within(refreshReport).getByText("octo/octo-repo")).toBeInTheDocument();
      const summaryStats = refreshReport.querySelectorAll(".github-refresh-stat strong");
      expect(summaryStats[1]).toHaveTextContent("2");
      expect(screen.getByText(/已刷新 2 个作者仓库/)).toBeInTheDocument();
      await user.click(within(refreshReport).getByRole("button", { name: "知道了" }));
      expect(screen.queryByRole("dialog", { name: "GitHub 刷新详情" })).not.toBeInTheDocument();
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("moves a GitHub result back to the homepage when edited from the homepage", async () => {
    const state = createDefaultState();
    state.sites.push({
      ...state.sites[0],
      id: "editable-github-repo",
      name: "Editable GitHub Repo",
      url: "https://github.com/acme/editable",
      groupId: "github-other",
      globalOrder: state.sites.length,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const user = userEvent.setup();
    render(<App />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索网页或筛选收藏" }), {
      target: { value: "editable" },
    });
    await user.click(screen.getByRole("button", { name: "编辑 Editable GitHub Repo" }));
    const dialog = screen.getByRole("dialog", { name: "编辑网站" });
    fireEvent.change(within(dialog).getByLabelText("网站地址"), {
      target: { value: "example.com/new-place" },
    });
    await user.click(within(dialog).getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.sites.find((site: { id: string }) => site.id === "editable-github-repo"))
        .toMatchObject({ url: "https://example.com/new-place", groupId: "other" });
    });
  });

  it("rejects a non-GitHub URL when adding inside the GitHub workspace", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
    await openTopAddSite(user);
    const dialog = screen.getByRole("dialog", { name: "添加网站" });
    await user.type(within(dialog).getByLabelText("网站名称"), "Example");
    await user.type(within(dialog).getByLabelText("网站地址"), "example.com");
    await user.click(within(dialog).getByRole("button", { name: /^添加网站$/ }));

    expect(
      within(dialog).getByText("GitHub 页面只允许添加 github.com 及其子域名"),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("heading", { name: "全部 GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "打开 Example" })).not.toBeInTheDocument();
  });

  it("previews and persists a custom brand name and visibility", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.change(screen.getByLabelText("品牌名称"), {
      target: { value: "My Workspace" },
    });
    expect(
      screen.getByRole("link", { name: "My Workspace 首页" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("My Workspace · 网站收藏");

    await user.click(screen.getByRole("checkbox", { name: "显示 Logo" }));
    const topbar = document.querySelector(".topbar") as HTMLElement;
    expect(topbar.querySelector(".brand-mark")).toBeNull();

    await user.click(
      screen.getByRole("checkbox", { name: "显示品牌名称" }),
    );
    expect(topbar.querySelector(".brand")).toBeNull();
    await user.click(
      screen.getByRole("checkbox", { name: "显示品牌名称" }),
    );
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.brand).toMatchObject({
        name: "My Workspace",
        showLogo: false,
        showName: true,
      });
    });
  });

  it("closes clean settings outside and warns before discarding dirty settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.pointerDown(screen.getByTestId("settings-outside-dismiss-layer"));
    expect(screen.queryByRole("dialog", { name: "设置" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.change(screen.getByLabelText("品牌名称"), {
      target: { value: "未保存品牌" },
    });
    fireEvent.pointerDown(screen.getByTestId("settings-outside-dismiss-layer"));
    const warning = screen.getByRole("alertdialog", {
      name: "放弃未保存的设置？",
    });
    expect(document.querySelector(".settings-panel")).toBeInTheDocument();
    await user.click(
      within(warning).getByRole("button", { name: "继续编辑" }),
    );
    expect(screen.getByLabelText("品牌名称")).toHaveValue("未保存品牌");

    fireEvent.pointerDown(screen.getByTestId("settings-outside-dismiss-layer"));
    await user.click(
      within(
        screen.getByRole("alertdialog", { name: "放弃未保存的设置？" }),
      ).getByRole("button", { name: "放弃更改" }),
    );
    expect(screen.queryByRole("dialog", { name: "设置" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Mysimple 首页" }),
    ).toBeInTheDocument();
  });

  it("opens the trash shortcut directly on the data section", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开回收站" }));

    const dialog = screen.getByRole("dialog", { name: "设置" });
    expect(
      within(dialog).getByRole("tab", { name: /数据/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByText("链接回收站")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "收起" }),
    ).toBeInTheDocument();
  });

  it("keeps settings open while the page wallpaper adjustment mode is active", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("tab", { name: /壁纸/ }));
    fireEvent.change(screen.getByLabelText("网络图片地址"), {
      target: { value: "https://example.com/wallpaper.jpg" },
    });
    await user.click(screen.getByRole("button", { name: "在页面拖动调整" }));
    expect(screen.queryByTestId("settings-outside-dismiss-layer")).toBeNull();
    const canvas = screen.getByRole("application", {
      name: /拖动壁纸调整位置/,
    });
    firePointerEvent(canvas, "pointerdown", {
      pointerId: 15,
      button: 0,
      clientX: 120,
      clientY: 120,
    });
    firePointerEvent(canvas, "pointerup", {
      pointerId: 15,
      button: 0,
      clientX: 120,
      clientY: 120,
    });
    expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
  });

  it("previews a network logo and falls back when it cannot load", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("radio", { name: "网络地址" }));
    fireEvent.change(screen.getByLabelText("网络 Logo 地址"), {
      target: { value: "https://example.com/logo.png" },
    });

    const topbar = document.querySelector(".topbar") as HTMLElement;
    const logo = topbar.querySelector(".brand-mark-custom img") as HTMLImageElement;
    expect(logo).toHaveAttribute("src", "https://example.com/logo.png");
    fireEvent.error(logo);
    expect(topbar.querySelector(".brand-mark-custom")).toBeNull();
    expect(topbar.querySelector(".brand-mark svg")).toBeInTheDocument();
  });

  it("shows a flat default grid and searches within the selected group", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("link", { name: "打开 GitHub" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /设计/ }));
    expect(screen.getByRole("link", { name: "打开 Figma" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "打开 GitHub" }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "搜索网页或筛选收藏" }),
      {
      target: { value: "GitHub" },
      },
    );
    await waitFor(() => {
      expect(
        screen.queryByText("没有找到匹配的网站"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "打开 GitHub" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "在设计分组添加网站" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /全部/ }));
    expect(
      await screen.findByRole("link", { name: "打开 GitHub" }),
    ).toBeInTheDocument();
  });

  it("reuses a resolved favicon after switching away from its group", async () => {
    const user = userEvent.setup();
    render(<App />);
    const githubCard = screen.getByTestId("site-card-github");
    const githubImage = () =>
      githubCard.querySelector("img") as HTMLImageElement;

    expect(githubImage().src).toBe("https://github.com/favicon.ico");
    fireEvent.load(githubImage());

    await user.click(screen.getByRole("tab", { name: /设计/ }));
    expect(screen.queryByTestId("site-card-github")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /开发/ }));

    const restoredImage = screen
      .getByTestId("site-card-github")
      .querySelector("img") as HTMLImageElement;
    expect(restoredImage.src).toBe("https://github.com/favicon.ico");
    expect(
      screen
        .getByTestId("site-card-github")
        .querySelector(".favicon-letter"),
    ).toBeNull();
  });

  it("adds a custom site and persists it", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openTopAddSite(user);
    const dialog = screen.getByRole("dialog", { name: "添加网站" });
    await user.type(screen.getByLabelText("网站名称"), "OpenAI");
    await user.type(screen.getByLabelText("网站地址"), "openai.com");
    await user.click(
      within(dialog).getByRole("button", { name: /^添加网站$/ }),
    );

    expect(await screen.findByRole("link", { name: "打开 OpenAI" })).toBeInTheDocument();
    await waitFor(() => {
      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toContain("OpenAI");
      expect(stored).toContain('"version":14');
    });
  });

  it("offers website and group creation from the top Add menu", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "添加" }));
    expect(
      screen.getByRole("menuitem", { name: /添加网站/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /新建分组/ }));
    expect(
      screen.getByRole("dialog", { name: "新建分组" }),
    ).toBeInTheDocument();
  });

  it("deletes a site only after two clicks on the same delete action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "删除 Google" }));
    expect(screen.getByRole("link", { name: "打开 Google" })).toBeInTheDocument();
    const confirmDelete = screen.getByRole("button", {
      name: "再次点击删除 Google",
    });
    expect(confirmDelete).toHaveClass("is-delete-armed");
    await user.click(confirmDelete);
    expect(
      screen.queryByRole("link", { name: "打开 Google" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("alertdialog", { name: "删除这个网站？" }),
    ).not.toBeInTheDocument();
  });

  it("cancels the armed site deletion after two seconds", async () => {
    vi.useFakeTimers();
    try {
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "删除 Bing" }));
      expect(
        screen.getByRole("button", { name: "再次点击删除 Bing" }),
      ).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(2001));
      expect(screen.getByRole("button", { name: "删除 Bing" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "打开 Bing" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("enters a discoverable multi-select mode and clears it on Done", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "多选" }));
    await user.click(screen.getByRole("button", { name: "选择 Google" }));
    await user.click(screen.getByRole("button", { name: "选择 Bing" }));
    expect(screen.getByRole("button", { name: "取消选择 Google" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "完成 2" })).toBeInTheDocument();
    const googleToggle = screen.getByRole("button", {
      name: "取消选择 Google",
    });
    expect(googleToggle).toHaveClass("site-selection-toggle");
    expect(googleToggle.closest(".site-card")).toHaveAttribute(
      "data-site-dnd-id",
      "google",
    );
    await user.click(screen.getByRole("button", { name: "完成 2" }));
    expect(screen.queryByRole("button", { name: "取消选择 Google" })).toBeNull();
    expect(screen.getByRole("link", { name: "打开 Google" })).toBeInTheDocument();
  });

  it("selects the inclusive site range with Shift from the first clicked card", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "多选" }));
    await user.click(screen.getByRole("button", { name: "选择 Google" }));
    fireEvent.click(screen.getByRole("button", { name: "选择 CodePen" }), {
      shiftKey: true,
    });

    expect(screen.getByRole("button", { name: "取消选择 Google" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "取消选择 Bing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消选择 GitHub" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "取消选择 Stack Overflow" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消选择 CodePen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成 5" })).toBeInTheDocument();
  });

  it("loads selectable icon sources while adding a valid website", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openTopAddSite(user);
    const dialog = screen.getByRole("dialog", { name: "添加网站" });
    fireEvent.change(within(dialog).getByLabelText("网站地址"), {
      target: { value: "bilibili.com" },
    });

    expect(
      await within(dialog).findByRole("radio", { name: "使用品牌图标" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("radio", { name: "使用自动图标" }),
    ).toBeInTheDocument();
  });

  it("prefills the add form when an external link is dropped on an add card", () => {
    render(<App />);
    const addCard = screen.getByRole("button", {
      name: "在搜索分组添加网站",
    });
    const dataTransfer = {
      types: ["text/uri-list", "text/html"],
      getData: (type: string) => {
        if (type === "text/uri-list") {
          return "https://www.xiaohongshu.com/explore";
        }
        if (type === "text/html") {
          return '<a href="https://www.xiaohongshu.com/explore">小红书</a>';
        }
        return "";
      },
    };

    fireEvent.dragEnter(addCard, { dataTransfer });
    expect(addCard).toHaveTextContent("松开以预添加");
    fireEvent.drop(addCard, { dataTransfer });

    const dialog = screen.getByRole("dialog", { name: "添加网站" });
    expect(within(dialog).getByLabelText("网站地址")).toHaveValue(
      "https://www.xiaohongshu.com/explore",
    );
    expect(within(dialog).getByLabelText("网站名称")).toHaveValue("小红书");
    expect(within(dialog).getByRole("radio", { name: "搜索" })).toBeChecked();
    expect(screen.queryByRole("link", { name: "打开 小红书" })).not.toBeInTheDocument();
  });

  it("sorts temporarily and persists the grouped display mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /手动排列/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "名称 Z–A" }));
    const names = Array.from(document.querySelectorAll(".site-grid .site-name")).map(
      (node) => node.textContent,
    );
    expect(names).toEqual(
      [...names].sort((a, b) =>
        (b ?? "").localeCompare(a ?? "", "zh-CN", { sensitivity: "base" }),
      ),
    );
    const transferHandle = screen.getAllByRole("button", {
      name: /拖动 .+ 更换分组/,
    })[0];
    expect(transferHandle).toBeEnabled();
    expect(transferHandle.closest(".site-card")).toHaveAttribute(
      "data-drag-mode",
      "transfer",
    );

    await user.click(screen.getByRole("button", { name: /名称 Z–A/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "手动排列" }));
    await user.click(screen.getByRole("button", { name: "显示" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "按分组显示" }),
    );
    expect(screen.getByRole("heading", { level: 3, name: "搜索" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "开发" })).toBeInTheDocument();
    expect(document.querySelectorAll(".grouped-site-track")).toHaveLength(6);
    expect(
      screen.getByRole("button", { name: "在开发分组添加网站" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toContain('"displayMode":"grouped"');
    });

    fireEvent.change(
      screen.getByRole("searchbox", { name: "搜索网页或筛选收藏" }),
      { target: { value: "GitHub" } },
    );
    expect(screen.getByRole("heading", { level: 2, name: "全库搜索" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "开发" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "搜索" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the homepage and GitHub display modes independent", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "显示" }));
    await user.click(screen.getByRole("menuitemradio", { name: "按分组显示" }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.displayModeByWorkspace).toEqual({ main: "grouped", github: "flat" });
    });

    await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
    expect(screen.getByRole("button", { name: "显示" })).toHaveTextContent("显示");
    expect(screen.getByRole("button", { name: "显示" }).querySelector("svg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "显示" }));
    expect(screen.getByRole("menuitemradio", { name: "全部平铺" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("menuitemradio", { name: "按分组显示" }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.displayModeByWorkspace).toEqual({ main: "grouped", github: "grouped" });
    });

    await user.click(screen.getByRole("button", { name: "打开收藏主页" }));
    await user.click(screen.getByRole("button", { name: "显示" }));
    expect(screen.getByRole("menuitemradio", { name: "按分组显示" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("manages the shared GitHub homepage from its GitHub workspace entry", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
    await user.click(screen.getByRole("button", { name: "管理 GitHub 官方主页" }));
    expect(screen.queryByRole("menuitem", { name: "放回收藏主页" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /撤销上次整理/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "删除官方入口" }));
    expect(screen.getByRole("menuitem", { name: "再次点击删除官方入口" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "再次点击删除官方入口" }));

    expect(screen.getByRole("button", { name: "添加官方主页" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "打开收藏主页" }));
    expect(screen.queryByTestId("site-card-github")).not.toBeInTheDocument();
  });

  it("opens the author repository flow from the GitHub home refresh action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
    const githubEntry = screen.getByRole("region", { name: "GitHub 官方主页" });
    const refreshButton = within(githubEntry).getByRole("button", { name: "刷新仓库" });
    expect(refreshButton).toHaveAttribute("title", "刷新仓库");

    await user.click(refreshButton);
    expect(screen.getByRole("dialog", { name: "导入作者仓库" })).toBeInTheDocument();
  });

  it("records a real link click and places the hottest site first", async () => {
    const user = userEvent.setup();
    render(<App />);

    const githubLink = screen.getByRole("link", { name: "打开 GitHub" });
    fireEvent.click(githubLink);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.version).toBe(14);
      expect(
        stored.sites.find((site: { id: string }) => site.id === "github")
          .clickCount,
      ).toBe(1);
    });

    await user.click(screen.getByRole("button", { name: /手动排列/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "热量排列" }));

    expect(
      Array.from(document.querySelectorAll(".site-grid > .site-card")).map(
        (card) => card.getAttribute("data-testid"),
      ),
    ).toEqual(expect.arrayContaining(["site-card-github", "site-card-google"]));
    expect(document.querySelector(".site-grid > .site-card")).toHaveAttribute(
      "data-testid",
      "site-card-github",
    );
    expect(screen.getByLabelText("访问次数 1")).toBeInTheDocument();
    const card = screen.getByTestId("site-card-github");
    expect(
      Array.from(card.querySelector(".site-card-link")?.children ?? []).map(
        (element) => element.className,
      ),
    ).toEqual(["site-name-row", "site-domain", "site-click-count"]);
    expect(card.querySelector(".site-heat-count")).toBeNull();
  });

  it("restores the selected sort mode on a new app session and shows click counts", async () => {
    const user = userEvent.setup();
    const firstSession = render(<App />);

    await user.click(screen.getByRole("button", { name: /手动排列/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "热量排列" }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.sortModeByWorkspace.main).toBe("heat");
    });

    firstSession.unmount();
    render(<App />);

    expect(screen.getByRole("button", { name: /热量排列/ })).toBeInTheDocument();
    expect(screen.getByTestId("site-card-google")).toHaveTextContent("0");
    expect(screen.getByTestId("site-card-google")).not.toHaveTextContent("热量");
    expect(screen.getByTestId("site-card-google")).not.toHaveTextContent("次");
  });

  it("enters, switches, and cancels grouped link/group multi-select from one button", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "显示" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "按分组显示" }),
    );

    expect(screen.queryByRole("button", { name: "多选" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /多选 .+ 网站/ })).toHaveLength(6);

    expect(document.querySelectorAll(".grouped-site-select-group")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "多选 搜索 网站" }));
    expect(screen.getByRole("button", { name: "选择 搜索 网站" })).toHaveTextContent("选择");
    expect(screen.getByRole("button", { name: "选择 搜索 网站" })).toHaveClass("pending");
    expect(screen.getByRole("button", { name: "管理 搜索 分组" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑 Google" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除 Google" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "选择 Google" })).not.toBeInTheDocument();
    expect(document.querySelectorAll(".group-selection-trigger")).toHaveLength(6);

    await user.click(screen.getByRole("heading", { level: 3, name: "搜索" }));
    expect(screen.getByRole("button", { name: "取消选择 搜索 分组" })).toHaveClass(
      "group-selection-trigger",
    );
    expect(
      screen.getByRole("button", { name: "取消选择 搜索 分组" }).querySelector("svg"),
    ).toBeInTheDocument();
    const designGroupCheckbox = screen.getByRole("button", { name: "选择 设计 分组" });
    expect(designGroupCheckbox).toBeInTheDocument();
    expect(designGroupCheckbox.querySelector("svg")).toBeNull();
    expect(screen.getByRole("button", { name: "管理 搜索 分组" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "切换到链接多选 搜索 网站" })).toHaveTextContent("切换");
    expect(screen.getByRole("button", { name: "切换到链接多选 开发 网站" })).toHaveTextContent("切换");
    expect(
      screen.getByTestId("site-card-google").querySelector(".site-card-full-link"),
    ).toHaveAttribute("aria-disabled", "true");

    await user.click(screen.getByRole("heading", { level: 3, name: "搜索" }));
    expect(screen.queryByRole("button", { name: "取消选择 搜索 分组" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 搜索 分组" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 搜索 网站" })).toHaveClass("pending");

    await user.click(screen.getByRole("button", { name: "选择 搜索 网站" }));
    expect(screen.getAllByRole("button", { name: /多选 .+ 网站/ })).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /选择 .+ 网站/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "多选 搜索 网站" }));
    fireEvent.click(screen.getByTestId("site-card-google"));
    expect(screen.getByRole("button", { name: "取消选择 Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑 Google" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除 Google" })).toBeDisabled();
    expect(
      screen.getByRole("heading", { level: 3, name: "搜索" }).closest(
        ".grouped-site-header-main",
      ),
    ).toHaveClass("is-selection-locked");
    expect(screen.getByRole("button", { name: "管理 搜索 分组" })).toBeDisabled();
    expect(document.querySelectorAll(".group-selection-trigger")).toHaveLength(6);
    expect(
      screen.getByRole("button", { name: "搜索 分组选择在链接多选时不可用" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "切换到分组多选 搜索 网站" })).toHaveTextContent("切换");

    fireEvent.click(screen.getByTestId("site-card-google"));
    expect(screen.queryByRole("button", { name: "取消选择 Google" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 搜索 网站" })).toHaveClass("pending");
    fireEvent.click(screen.getByTestId("site-card-google"));
    expect(screen.getByRole("button", { name: "取消选择 Google" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "切换到分组多选 搜索 网站" }));
    expect(screen.queryByRole("button", { name: "取消选择 Google" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 搜索 网站" })).toHaveTextContent("选择");
    await user.click(screen.getByRole("button", { name: "选择 搜索 网站" }));
    expect(screen.getByRole("button", { name: "多选 搜索 网站" })).toHaveTextContent("多选");
    await user.click(screen.getByRole("button", { name: "多选 搜索 网站" }));

    await user.click(screen.getByRole("heading", { level: 3, name: "设计" }));
    expect(screen.getByRole("button", { name: "切换到链接多选 设计 网站" })).toHaveTextContent("切换");

    await user.click(document.querySelector(".page-container")!);
    expect(screen.getAllByRole("button", { name: /多选 .+ 网站/ })).toHaveLength(6);
    expect(document.querySelector(".is-group-selected")).toBeNull();
  });

  it("enters group multi-select when a group title is double-clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "显示" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "按分组显示" }),
    );

    await user.dblClick(screen.getByRole("heading", { level: 3, name: "搜索" }));

    const searchSection = screen
      .getByRole("heading", { level: 3, name: "搜索" })
      .closest(".grouped-site-section");
    expect(searchSection).toHaveClass("is-group-selected");
    expect(
      screen.getByRole("button", { name: "取消选择 搜索 分组" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "切换到链接多选 搜索 网站" }),
    ).toHaveTextContent("切换");
  });

  it("selects the inclusive group range with Shift", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "显示" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "按分组显示" }),
    );
    await user.click(screen.getByRole("button", { name: "多选 搜索 网站" }));
    await user.click(screen.getByRole("heading", { level: 3, name: "搜索" }));
    fireEvent.click(screen.getByRole("heading", { level: 3, name: "学习" }), {
      shiftKey: true,
    });

    for (const name of ["搜索", "开发", "设计", "影音", "学习"]) {
      expect(
        screen.getByRole("button", { name: `取消选择 ${name} 分组` }),
      ).toBeInTheDocument();
    }
  });

  it("creates groups before or after a header and limits Other to before", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "显示" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "按分组显示" }),
    );
    expect(screen.queryByText("在此添加分组")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "在 开发 附近添加分组" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "在“开发”前添加" }),
    );
    const dialog = screen.getByRole("dialog", { name: "新建分组" });
    expect(within(dialog).getByText(/创建在“开发”之前/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("分组名称"), "中间分组");
    await user.click(within(dialog).getByRole("button", { name: "创建分组" }));

    expect(screen.getByRole("tab", { name: /全部/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as {
        groups: Array<{ name: string; order: number; workspace?: string }>;
      };
      expect(
        stored.groups
          .filter((group) => group.workspace === "main")
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((group) => group.name)
          .slice(0, 3),
      ).toEqual(["搜索", "中间分组", "开发"]);
    });

    await user.click(
      screen.getByRole("button", { name: "在 搜索 附近添加分组" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "在“搜索”后添加" }),
    );
    const afterDialog = screen.getByRole("dialog", { name: "新建分组" });
    expect(within(afterDialog).getByText(/创建在“搜索”之后/)).toBeInTheDocument();
    await user.click(within(afterDialog).getByRole("button", { name: "取消" }));

    await user.click(
      screen.getByRole("button", { name: "在 其他 附近添加分组" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "在“其他”前添加" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "在“其他”后添加" }),
    ).not.toBeInTheDocument();
  });

  it("does not activate grouped section sorting with Space or Enter", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "显示" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "按分组显示" }),
    );
    const header = document.querySelector<HTMLElement>(
      '[data-group-sort-section-id="design"] .grouped-site-header',
    );
    expect(header).not.toBeNull();
    expect(header).not.toHaveAttribute("tabindex");
    fireEvent.click(header!);
    fireEvent.keyDown(header!, { key: " " });
    fireEvent.keyDown(header!, { key: "Enter" });
    expect(document.querySelector(".is-group-sorting")).toBeNull();
    expect(screen.queryByTestId("group-sort-vertical-drag-preview")).toBeNull();
  });

  it("allows sorting in All and disables it only while searching", () => {
    render(<App />);
    const dragButton = screen.getByRole("button", {
      name: "拖动 GitHub 调整顺序",
    });
    expect(dragButton).toBeEnabled();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "搜索网页或筛选收藏" }),
      {
      target: { value: "GitHub" },
      },
    );
    expect(
      screen.getByRole("button", { name: "搜索时无法排序" }),
    ).toBeDisabled();
  });

  it("confirms and moves a duplicate URL instead of creating another card", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openTopAddSite(user);
    const dialog = screen.getByRole("dialog", { name: "添加网站" });
    await user.type(screen.getByLabelText("网站名称"), "另一个 GitHub");
    await user.type(screen.getByLabelText("网站地址"), "github.com/");
    await user.click(
      within(dialog).getByRole("button", { name: /^添加网站$/ }),
    );

    expect(screen.getByText(/这个网站已经收藏在/)).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "移动并更新" }),
    );
    await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
    expect(screen.getByText("另一个 GitHub")).toBeInTheDocument();
  });

  it("uses the selected preset label when a new group name is blank", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "新建分组" }));
    const dialog = screen.getByRole("dialog", { name: "新建分组" });
    await user.click(within(dialog).getByRole("radio", { name: "数据库" }));
    expect(within(dialog).getByText("留空将使用“数据库”")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "创建分组" }));
    expect(screen.getByRole("tab", { name: /数据库/ })).toHaveAttribute("aria-selected", "true");
  });

  it("uses the browser default search provider when Enter is pressed", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    (
      globalThis as typeof globalThis & {
        chrome?: unknown;
      }
    ).chrome = {
      runtime: { id: "test-extension" },
      search: { query },
    };
    render(<App />);

    const search = screen.getByRole("searchbox", {
      name: "搜索网页或筛选收藏",
    });
    fireEvent.change(search, { target: { value: "React 拖拽" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => {
      expect(query).toHaveBeenCalledWith({
        text: "React 拖拽",
        disposition: "CURRENT_TAB",
      });
    });
  });

  it("shows saved search history and lets one item be removed", async () => {
    const stored = createDefaultState();
    stored.searchHistory = [
      {
        query: "history query",
        searchedAt: "2026-07-30T00:00:00.000Z",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const user = userEvent.setup();
    render(<App />);
    const search = screen.getByRole("searchbox", {
      name: "搜索网页或筛选收藏",
    });

    fireEvent.focus(search);
    expect(screen.getByText("最近搜索")).toBeInTheDocument();
    expect(screen.getByRole("option")).toHaveTextContent("history query");
    await user.click(
      screen.getByRole("button", { name: "删除搜索记录 history query" }),
    );
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("previews appearance changes and rolls them back on cancel", async () => {
    const user = userEvent.setup();
    render(<App />);
    const shell = document.querySelector(".app-shell") as HTMLElement;
    expect(shell.style.getPropertyValue("--card-min-width")).toBe("160px");
    expect(shell.style.getPropertyValue("--font-scale")).toBe("1");

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("button", { name: "紧凑" }));
    expect(shell.style.getPropertyValue("--card-min-width")).toBe("140px");
    expect(shell.style.getPropertyValue("--font-scale")).toBe("0.95");

    await user.click(screen.getByRole("button", { name: /高级微调/ }));
    fireEvent.change(screen.getByRole("slider", { name: "界面字号" }), {
      target: { value: "112" },
    });
    expect(shell.style.getPropertyValue("--font-scale")).toBe("1.12");
    await user.click(screen.getByRole("tab", { name: "品牌" }));
    fireEvent.change(screen.getByRole("slider", { name: "Logo 字号" }), {
      target: { value: "150" },
    });
    await user.click(screen.getByRole("tab", { name: "卡片" }));
    fireEvent.change(screen.getByRole("slider", { name: "卡片文字比例" }), {
      target: { value: "110" },
    });
    expect(shell.style.getPropertyValue("--brand-font-scale")).toBe("1.68");
    expect(shell.style.getPropertyValue("--card-font-scale")).toBe("1.232");

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(shell.style.getPropertyValue("--card-min-width")).toBe("160px");
    expect(shell.style.getPropertyValue("--font-scale")).toBe("1");
    expect(shell.style.getPropertyValue("--brand-font-scale")).toBe("1");
    expect(shell.style.getPropertyValue("--card-font-scale")).toBe("1");

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("button", { name: "紧凑" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toContain('"cardWidth":140');
    });
  });

  it("previews continuous wallpaper position, zoom, and topbar material", async () => {
    const user = userEvent.setup();
    render(<App />);
    const shell = document.querySelector(".app-shell") as HTMLElement;

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("tab", { name: /壁纸/ }));
    fireEvent.change(screen.getByLabelText("网络图片地址"), {
      target: { value: "https://example.com/wallpaper.jpg" },
    });
    await user.click(screen.getByRole("button", { name: "在页面拖动调整" }));

    const canvas = screen.getByRole("application", {
      name: /拖动壁纸调整位置/,
    });
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    fireEvent.wheel(canvas, { deltaY: -100 });

    expect(shell.style.getPropertyValue("--wallpaper-position-x")).toBe("49%");
    await waitFor(() => {
      expect(shell.style.getPropertyValue("--wallpaper-zoom")).toBe("1.08");
    });

    fireEvent.change(screen.getByRole("slider", { name: /背景透明度/ }), {
      target: { value: "42" },
    });
    expect(shell.style.getPropertyValue("--topbar-background")).toContain("42%");

    await user.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toContain('"positionX":49');
      expect(localStorage.getItem(STORAGE_KEY)).toContain('"zoom":108');
    });
  });

  it("offers the expanded icon library including Database", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "新建分组" }));
    expect(
      within(screen.getByRole("dialog", { name: "新建分组" })).getByRole(
        "radio",
        { name: "数据库" },
      ),
    ).toBeInTheDocument();
  });

  it("validates an import and replaces data only after confirmation", async () => {
    const imported = createDefaultState();
    imported.sites = imported.sites.filter((site) => site.id === "google");
    const file = new File([serializeExport(imported)], "favorites.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve(serializeExport(imported)),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("tab", { name: /数据/ }));
    await user.click(
      within(screen.getByRole("dialog", { name: "设置" })).getByRole(
        "button",
        { name: "导入" },
      ),
    );
    const importInput = screen.getByLabelText("选择要导入的收藏文件");
    Object.defineProperty(importInput, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(importInput);

    const confirm = await screen.findByRole("alertdialog", {
      name: "导入并替换收藏？",
    });
    expect(within(confirm).getByText(/1 个网站/)).toBeInTheDocument();
    expect(screen.getByTestId("site-card-github")).toBeInTheDocument();

    await user.click(
      within(confirm).getByRole("button", { name: "确认导入" }),
    );
    expect(
      screen.queryByRole("link", { name: "打开 GitHub" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开 Google" })).toBeInTheDocument();
    expect(screen.getByText("收藏数据已成功导入。")).toBeInTheDocument();
  });

  it("shows an error without changing data for an invalid import", async () => {
    const file = new File(["{broken"], "broken.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve("{broken"),
    });
    const user = userEvent.setup();
    render(<App />);

    const importInput = screen.getByLabelText("选择要导入的收藏文件");
    Object.defineProperty(importInput, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(importInput);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "文件不是有效的 JSON 格式",
    );
    expect(screen.getByRole("link", { name: "打开 GitHub" })).toBeInTheDocument();
  });

  it("fills the site name from a familiar address", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openTopAddSite(user);
    await user.type(screen.getByLabelText("网站地址"), "douyin.com");
    expect(screen.getByLabelText("网站名称")).toHaveValue("抖音");
  });

  it("adds a site directly to the selected group", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: /设计/ }));
    await user.click(
      screen.getByRole("button", { name: "在设计分组添加网站" }),
    );
    expect(screen.getByRole("radio", { name: "设计" })).toBeChecked();
    await user.type(screen.getByLabelText("网站地址"), "canva.com");
    const dialog = screen.getByRole("dialog", { name: "添加网站" });
    await user.click(
      within(dialog).getByRole("button", { name: /^添加网站$/ }),
    );
    expect(await screen.findByRole("link", { name: "打开 Canva" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "设计", level: 2 }),
    ).toBeInTheDocument();
  });

  it("creates, selects, and renames a custom group", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "新建分组" }));
    let dialog = screen.getByRole("dialog", { name: "新建分组" });
    expect(dialog.querySelector(".new-group-dialog-scroll")).toBeInTheDocument();
    expect(document.querySelector(".group-dialog-overlay")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("分组名称"), "工作");
    await user.click(within(dialog).getByRole("radio", { name: "工作" }));
    await user.click(within(dialog).getByRole("button", { name: "创建分组" }));

    expect(screen.getByRole("tab", { name: /工作/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "工作", level: 2 }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "管理分组" }));
    dialog = screen.getByRole("dialog", { name: "管理分组" });
    await user.click(within(dialog).getByRole("button", { name: /工作 0 个网站/ }));
    const nameInput = within(dialog).getByDisplayValue("工作");
    await user.clear(nameInput);
    await user.type(nameInput, "项目");
    await user.click(within(dialog).getByRole("button", { name: "保存分组" }));
    expect(screen.getByRole("tab", { name: /项目/ })).toBeInTheDocument();
  });

  it("opens the pressed group after a 450ms long press", async () => {
    render(<App />);
    const designTab = screen.getByRole("tab", { name: /设计/ });

    vi.useFakeTimers();
    try {
      firePointerEvent(designTab, "pointerdown", {
        button: 0,
        pointerId: 7,
        clientX: 40,
        clientY: 20,
      });
      await act(() => vi.advanceTimersByTimeAsync(449));
      expect(
        screen.queryByRole("dialog", { name: "管理分组" }),
      ).not.toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(1));
      const dialog = screen.getByRole("dialog", { name: "管理分组" });
      expect(within(dialog).getByDisplayValue("设计")).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels group long press after moving more than 8px", async () => {
    render(<App />);
    const searchTab = screen.getByRole("tab", { name: /搜索/ });

    vi.useFakeTimers();
    try {
      firePointerEvent(searchTab, "pointerdown", {
        button: 0,
        pointerId: 8,
        clientX: 20,
        clientY: 20,
      });
      firePointerEvent(searchTab, "pointermove", {
        pointerId: 8,
        clientX: 29,
        clientY: 20,
      });
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(
        screen.queryByRole("dialog", { name: "管理分组" }),
      ).not.toBeInTheDocument();

      firePointerEvent(searchTab, "pointerup", { pointerId: 8 });
      fireEvent.click(searchTab);
      expect(searchTab).toHaveAttribute("aria-selected", "false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes targeted group management when the same press becomes a drag", async () => {
    render(<App />);
    const designTab = screen.getByRole("tab", { name: /设计/ });

    vi.useFakeTimers();
    try {
      firePointerEvent(designTab, "pointerdown", {
        button: 0,
        pointerId: 9,
        clientX: 40,
        clientY: 20,
      });
      await act(() => vi.advanceTimersByTimeAsync(450));
      expect(
        screen.getByRole("dialog", { name: "管理分组" }),
      ).toBeInTheDocument();

      firePointerEvent(designTab, "pointermove", {
        pointerId: 9,
        clientX: 49,
        clientY: 20,
      });
      expect(
        screen.queryByRole("dialog", { name: "管理分组" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the matching group from its grouped heading action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "显示" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "按分组显示" }),
    );
    await user.click(screen.getByRole("button", { name: "管理 设计 分组" }));

    const dialog = screen.getByRole("dialog", { name: "管理分组" });
    expect(within(dialog).getByDisplayValue("设计")).toBeEnabled();
    expect(within(dialog).getAllByRole("radio")).toHaveLength(48);
    expect(
      within(dialog)
        .getByRole("button", { name: "删除这个分组" })
        .closest(".group-editor-summary"),
    ).toBeInTheDocument();
  });

  it("imports a group resource package into the selected group without replacing the collection", async () => {
    const user = userEvent.setup();
    const payload = createGroupExportPayload(createDefaultState(), "design");
    payload.sites = [
      {
        name: "Shared Example",
        url: "https://shared-example.com",
        iconSource: "auto",
        order: 0,
      },
      {
        name: "Google duplicate",
        url: "https://www.google.com",
        order: 1,
      },
    ];
    const file = new File([JSON.stringify(payload)], "design.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve(JSON.stringify(payload)),
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: "管理分组" }));
    const dialog = screen.getByRole("dialog", { name: "管理分组" });
    await user.click(within(dialog).getByRole("button", { name: "导入资源" }));
    const importInput = screen.getByLabelText("选择要导入的分组资源包");
    Object.defineProperty(importInput, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(importInput);

    const confirm = await screen.findByRole("alertdialog", {
      name: "导入分组资源？",
    });
    expect(within(confirm).getByText(/新增 1 个，重复跳过 1 个/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "确认导入" }));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.sites.some((site: { name: string; groupId: string }) =>
      site.name === "Shared Example" && site.groupId === "search",
    )).toBe(true);
    expect(stored.sites.filter((site: { url: string }) =>
      site.url.toLocaleLowerCase() === "https://www.google.com",
    )).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "管理分组" })).toBeInTheDocument();
  });

  it("keeps Other protected in group management", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "管理分组" }));
    const dialog = screen.getByRole("dialog", { name: "管理分组" });
    await user.click(within(dialog).getByRole("button", { name: /其他 0 个网站/ }));
    expect(within(dialog).getByDisplayValue("其他")).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "受保护分组不能移动" }),
    ).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "删除这个分组" })).not.toBeInTheDocument();
  });

  it("lets one site use its official brand icon", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "编辑 哔哩哔哩" }),
    );
    const dialog = screen.getByRole("dialog", { name: "编辑网站" });
    await user.click(
      within(dialog).getByRole("radio", { name: "使用品牌图标" }),
    );
    expect(
      within(dialog).getByTestId("favicon-selected-brand"),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "保存修改" }),
    );

    expect(
      within(screen.getByTestId("site-card-bilibili")).getByTestId(
        "favicon-selected-brand",
      ),
    ).toBeInTheDocument();
  });

  it("deletes a group after two clicks and moves its sites to trash", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "新建分组" }));
    let dialog = screen.getByRole("dialog", { name: "新建分组" });
    await user.type(within(dialog).getByLabelText("分组名称"), "临时");
    await user.click(within(dialog).getByRole("button", { name: "创建分组" }));

    await user.click(
      screen.getByRole("button", { name: "在临时分组添加网站" }),
    );
    await user.type(screen.getByLabelText("网站地址"), "canva.com");
    dialog = screen.getByRole("dialog", { name: "添加网站" });
    await user.click(
      within(dialog).getByRole("button", { name: /^添加网站$/ }),
    );

    await user.click(screen.getByRole("button", { name: "管理分组" }));
    dialog = screen.getByRole("dialog", { name: "管理分组" });
    await user.click(within(dialog).getByRole("button", { name: /临时 1 个网站/ }));
    await user.click(
      within(dialog).getByRole("button", { name: "删除这个分组" }),
    );
    expect(
      screen.queryByRole("alertdialog", { name: "删除这个分组？" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "再次点击删除这个分组",
      }),
    ).toHaveClass("is-delete-armed");
    await user.click(
      within(dialog).getByRole("button", {
        name: "再次点击删除这个分组",
      }),
    );
    expect(
      screen.queryByRole("dialog", { name: "管理分组" }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole("tab", { name: /全部/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("link", { name: "打开 Canva" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("tab", { name: "数据" }));
    await user.click(screen.getByRole("button", { name: "查看" }));
    expect(screen.getByText("Canva")).toBeInTheDocument();
  });

  it("returns to All after deleting the focused group", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: /学习/ }));
    await user.click(screen.getByRole("button", { name: "管理分组" }));
    const dialog = screen.getByRole("dialog", { name: "管理分组" });
    await user.click(within(dialog).getByRole("button", { name: /学习 2 个网站/ }));
    await user.click(
      within(dialog).getByRole("button", { name: "删除这个分组" }),
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "再次点击删除这个分组",
      }),
    );
    expect(
      screen.queryByRole("dialog", { name: "管理分组" }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole("tab", { name: /全部/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("tab", { name: /学习/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "打开 维基百科" })).not.toBeInTheDocument();
  });

  it("resets the direct group deletion after two seconds", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "新建分组" }));
    let dialog = screen.getByRole("dialog", { name: "新建分组" });
    await user.type(within(dialog).getByLabelText("分组名称"), "空分组");
    await user.click(within(dialog).getByRole("button", { name: "创建分组" }));
    await user.click(screen.getByRole("button", { name: "管理分组" }));
    dialog = screen.getByRole("dialog", { name: "管理分组" });
    await user.click(within(dialog).getByRole("button", { name: /空分组 0 个网站/ }));
    vi.useFakeTimers();
    try {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "删除这个分组" }),
      );
      expect(
        within(dialog).getByRole("button", {
          name: "再次点击删除这个分组",
        }),
      ).toHaveClass("is-delete-armed");
      await act(() => vi.advanceTimersByTimeAsync(2001));
      expect(
        within(dialog).getByRole("button", { name: "删除这个分组" }),
      ).not.toHaveClass("is-delete-armed");
    } finally {
      vi.useRealTimers();
    }

    await user.click(
      within(dialog).getByRole("button", { name: "删除这个分组" }),
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "再次点击删除这个分组",
      }),
    );
    expect(
      screen.queryByRole("dialog", { name: "管理分组" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /空分组/ })).not.toBeInTheDocument();
  });
});
