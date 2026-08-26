import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => cleanup());

  it("loads, searches, filters, and opens a browser history item", async () => {
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
        onRequestPermission={vi.fn().mockResolvedValue(true)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "打开历史记录 GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/openai",
    );

    await user.type(screen.getByRole("searchbox", { name: "搜索浏览历史" }), "GitHub");
    await waitFor(() => {
      expect(history.api.history!.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: "GitHub" }),
      );
    });
    await user.selectOptions(screen.getByRole("combobox", { name: "历史记录时间范围" }), "7d");
    await waitFor(() => {
      expect(history.api.history!.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: "GitHub" }),
      );
    });
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
        onRequestPermission={vi.fn().mockResolvedValue(true)}
      />,
    );

    await waitFor(() => expect(screen.getByText("One")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "选择 One" }));
    await user.click(screen.getByRole("button", { name: "删除选中" }));
    await waitFor(() => {
      expect(history.api.history!.deleteUrl).toHaveBeenCalledWith({
        url: "https://one.example",
      });
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
        onRequestPermission={vi.fn().mockResolvedValue(false)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "启用浏览器历史记录" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "返回收藏" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回收藏" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
