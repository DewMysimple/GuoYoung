import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserHistoryView } from "./browser-history-view";
import type {
  BrowserHistoryItem,
  ChromiumExtensionApi,
} from "../lib/browser-runtime";

function createHistoryApi(items: BrowserHistoryItem[] = []): {
  api: ChromiumExtensionApi;
  emitVisited: (item: BrowserHistoryItem) => void;
  emitRemoved: () => void;
} {
  let visitedListener: ((item: BrowserHistoryItem) => void) | undefined;
  let removedListener: (() => void) | undefined;
  const api: ChromiumExtensionApi = {
    runtime: {
      id: "history-view-test",
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    permissions: {
      contains: vi.fn().mockResolvedValue(true),
      request: vi.fn().mockResolvedValue(true),
    },
    history: {
      search: vi.fn().mockImplementation(async () => items),
      deleteUrl: vi.fn().mockResolvedValue(undefined),
      deleteRange: vi.fn().mockResolvedValue(undefined),
      deleteAll: vi.fn().mockResolvedValue(undefined),
      onVisited: {
        addListener: vi.fn((listener) => {
          visitedListener = listener;
        }),
        removeListener: vi.fn(),
      },
      onVisitRemoved: {
        addListener: vi.fn((listener) => {
          removedListener = listener;
        }),
        removeListener: vi.fn(),
      },
    },
  };
  return {
    api,
    emitVisited: (item) => visitedListener?.(item),
    emitRemoved: () => removedListener?.(),
  };
}

describe("BrowserHistoryView", () => {
  beforeEach(() => { vi.spyOn(window, "scrollTo").mockImplementation(() => {}); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("loads, searches, filters, and opens a browser history item in a new tab", async () => {
    const user = userEvent.setup();
    const history = createHistoryApi([
      {
        id: "github",
        title: "GitHub",
        url: "https://github.com/openai",
        lastVisitTime: Date.now(),
        visitCount: 4,
      },
    ]);
    render(
      <BrowserHistoryView
        api={history.api}
        onBack={vi.fn()}
        onRequestPermission={vi.fn().mockResolvedValue({ granted: true })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });
    const rangeTrigger = screen.getByRole("button", { name: "历史记录时间范围" });
    expect(rangeTrigger).toHaveTextContent("近 7 天");
    await user.click(rangeTrigger);
    expect(screen.getByRole("listbox", { name: "历史记录时间范围选项" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "近 7 天" }));
    await user.click(
      screen.getByRole("button", { name: "查看 GitHub 历史记录" }),
    );
    expect(screen.getByRole("link", { name: "打开历史记录 GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/openai",
    );
    expect(screen.getByRole("link", { name: "打开历史记录 GitHub" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "打开历史记录 GitHub" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );

    await user.type(screen.getByRole("searchbox", { name: "搜索浏览历史" }), "GitHub");
    await waitFor(() => {
      expect(history.api.history!.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: "GitHub" }),
        expect.any(Function),
      );
    });
    await user.click(screen.getByRole("button", { name: "历史记录时间范围" }));
    await user.click(screen.getByRole("option", { name: "今天" }));
    await waitFor(() => {
      expect(history.api.history!.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: "GitHub" }),
        expect.any(Function),
      );
    });
  });

  it("opens a site detail page and uses the homepage-style selection control", async () => {
    const user = userEvent.setup();
    const history = createHistoryApi([
      {
        id: "github-repo",
        title: "Repository",
        url: "https://github.com/openai/repo",
        lastVisitTime: Date.now(),
      },
      {
        id: "github-gist",
        title: "Gist",
        url: "https://gist.github.com/openai/demo",
        lastVisitTime: Date.now() - 1000,
      },
      {
        id: "chatgpt",
        title: "ChatGPT",
        url: "https://chatgpt.com/c/123",
        lastVisitTime: Date.now() - 2000,
      },
    ]);
    render(
      <BrowserHistoryView
        api={history.api}
        onBack={vi.fn()}
        onRequestPermission={vi.fn().mockResolvedValue({ granted: true })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("history-site-card-github.com")).toBeInTheDocument();
      expect(screen.getByTestId("history-site-card-chatgpt.com")).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "打开历史记录 Repository" })).not.toBeInTheDocument();
    vi.spyOn(window, "scrollY", "get").mockReturnValue(250);

    await user.click(
      screen.getByRole("button", { name: "查看 GitHub 历史记录" }),
    );
    expect(screen.getByRole("link", { name: "打开历史记录 Repository" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开历史记录 Gist" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "打开历史记录 ChatGPT" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回历史记录" })).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });

    await user.click(screen.getByRole("button", { name: "返回历史记录" }));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 250, behavior: "instant" });
    expect(screen.getByTestId("history-site-card-chatgpt.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "选择 GitHub 的全部历史记录" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "多选" }));
    await user.click(
      screen.getByRole("button", { name: "选择 GitHub 的全部历史记录" }),
    );
    expect(screen.getByText("已选择 2 条")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "取消选择 GitHub 的全部历史记录" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "查看 GitHub 历史记录" }));
    expect(screen.getByRole("button", { name: "选择 GitHub 的全部历史记录" })).toHaveAttribute("aria-pressed", "false");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "选择 GitHub 的全部历史记录" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看 GitHub 历史记录" }));
    await user.click(screen.getByRole("button", { name: "多选" }));
    const link = screen.getByRole("link", { name: "打开历史记录 Repository" });
    expect(fireEvent.click(link)).toBe(false);
    expect(screen.getByRole("button", { name: "取消选择 Repository" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "删除历史记录 Repository" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "选择 GitHub 的全部历史记录" })).toHaveAttribute("data-indeterminate", "true");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "删除历史记录 Repository" })).toBeEnabled();
  });

  it("keeps the whole range control interactive and closes its rounded menu outside", async () => {
    const user = userEvent.setup();
    const history = createHistoryApi([
      {
        id: "one",
        title: "One",
        url: "https://one.example.com",
        lastVisitTime: Date.now(),
      },
    ]);
    const { container } = render(
      <BrowserHistoryView
        api={history.api}
        onBack={vi.fn()}
        onRequestPermission={vi.fn().mockResolvedValue({ granted: true })}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("history-site-card-example.com")).toBeInTheDocument());
    const trigger = screen.getByRole("button", { name: "历史记录时间范围" });
    expect(container.querySelector(".history-range-icon")).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("listbox", { name: "历史记录时间范围选项" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox", { name: "历史记录时间范围选项" })).not.toBeInTheDocument();

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("option", { name: "近 7 天" })).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(trigger).toHaveTextContent("近 30 天");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "历史记录时间范围选项" })).not.toBeInTheDocument();
  });

  it("returns from a history detail page when the browser back event fires", async () => {
    const user = userEvent.setup();
    const history = createHistoryApi([
      {
        id: "github",
        title: "GitHub",
        url: "https://github.com/openai",
        lastVisitTime: Date.now(),
      },
    ]);
    render(
      <BrowserHistoryView
        api={history.api}
        onBack={vi.fn()}
        onRequestPermission={vi.fn().mockResolvedValue({ granted: true })}
      />,
    );

    await waitFor(() => expect(screen.getByText("GitHub")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "查看 GitHub 历史记录" }));
    expect(screen.getByTestId("history-site-detail-github.com")).toBeInTheDocument();
    fireEvent.popState(window, { state: { siteHubLayer: "browser-history" } });
    await waitFor(() => {
      expect(screen.getByTestId("history-site-card-github.com")).toBeInTheDocument();
      expect(screen.queryByTestId("history-site-detail-github.com")).not.toBeInTheDocument();
    });
  });

  it("retries a failed read without presenting the failure as an empty history", async () => {
    const user = userEvent.setup();
    const history = createHistoryApi([
      { id: "github", title: "GitHub", url: "https://github.com/openai", lastVisitTime: Date.now() },
    ]);
    vi.mocked(history.api.history!.search).mockRejectedValueOnce(new Error("Read failed"));
    render(<BrowserHistoryView api={history.api} onBack={vi.fn()} onRequestPermission={vi.fn()} />);
    expect(await screen.findByText("历史记录读取失败")).toBeInTheDocument();
    expect(screen.queryByText("还没有可显示的历史记录")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新读取" }));
    expect(await screen.findByTestId("history-site-card-github.com")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("deletes selected URLs and refreshes after browser history events", async () => {
    const user = userEvent.setup();
    const history = createHistoryApi([
      { id: "one", title: "One", url: "https://one.example", lastVisitTime: Date.now() },
      { id: "two", title: "Two", url: "https://two.example", lastVisitTime: Date.now() - 1000 },
    ]);
    render(
      <BrowserHistoryView
        api={history.api}
        onBack={vi.fn()}
        onRequestPermission={vi.fn().mockResolvedValue({ granted: true })}
      />,
    );

    await waitFor(() => expect(screen.getByText("One")).toBeInTheDocument());
    await user.click(
      screen.getByRole("button", { name: "查看 One 历史记录" }),
    );
    await user.click(screen.getByRole("button", { name: "多选" }));
    await user.click(screen.getByRole("button", { name: "选择 One" }));
    await user.click(screen.getByRole("button", { name: "删除选中" }));
    await waitFor(() => {
      expect(history.api.history!.deleteUrl).toHaveBeenCalledWith(
        { url: "https://one.example" },
        expect.any(Function),
      );
    });

    const searchCalls = vi.mocked(history.api.history!.search).mock.calls.length;
    history.emitVisited({
      id: "three",
      title: "Three",
      url: "https://three.example",
      lastVisitTime: Date.now(),
    });
    history.emitRemoved();
    await waitFor(() => {
      expect(vi.mocked(history.api.history!.search).mock.calls.length).toBeGreaterThan(
        searchCalls,
      );
    });
  });

  it("explains when the permission is denied and keeps the collection available", async () => {
    const onBack = vi.fn();
    render(
      <BrowserHistoryView
        api={{
          runtime: { id: "denied-history" },
          permissions: {
            contains: vi.fn().mockResolvedValue(false),
            request: vi.fn().mockResolvedValue(false),
          },
        }}
        onBack={onBack}
        onRequestPermission={vi.fn().mockResolvedValue({ granted: false })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "启用浏览器历史记录" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "返回收藏" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回收藏" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows a retryable error when the browser does not complete authorization", async () => {
    const user = userEvent.setup();
    const history = createHistoryApi();
    const onRequestPermission = vi.fn().mockResolvedValue({
      granted: false,
      error: "浏览器未完成历史记录授权，请检查扩展权限后重试。",
    });
    render(
      <BrowserHistoryView
        api={{
          ...history.api,
          permissions: {
            contains: vi.fn().mockResolvedValue(false),
            request: vi.fn().mockResolvedValue(false),
          },
        }}
        onBack={vi.fn()}
        onRequestPermission={onRequestPermission}
      />,
    );

    const button = await screen.findByRole("button", {
      name: "允许读取历史记录",
    });
    await user.click(button);
    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("未完成历史记录授权");
    expect(button).toBeEnabled();
    expect(onRequestPermission).toHaveBeenCalledTimes(1);
  });
});
