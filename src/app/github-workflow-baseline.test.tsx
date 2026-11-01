import { StrictMode, type HTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { clearFaviconResolutionCache } from "../components/favicon";
import { createDefaultState } from "../data/defaults";
import { createSiteHubStore } from "../lib/state-store";
import { STORAGE_KEY } from "../lib/storage";

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

function response(data: unknown): Response {
  return { ok: true, status: 200, headers: new Headers(), json: async () => data } as Response;
}

function repository(login = "sample") {
  return { id: 931, name: "public", full_name: `${login}/public`,
    html_url: `https://github.com/${login}/public`, private: false };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
}

async function openImport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
  await user.click(screen.getByRole("button", { name: "导入 GitHub 作者仓库" }));
  return screen.getByRole("dialog", { name: "导入作者仓库" });
}

describe("GitHub workflow baseline through the real App", () => {
  beforeEach(() => {
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
    localStorage.clear();
    clearFaviconResolutionCache();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("clears cancelled author drafts and preserves the original group source on each opening", async () => {
    const state = createDefaultState();
    const source = state.groups.find((group) => group.id === "github-other")!;
    source.name = "Synthetic author";
    source.githubImportSource = { login: "Sample", profileUrl: "https://github.com/Sample/", entityType: "user" };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "打开 GitHub 收藏" }));
    await user.click(screen.getByRole("tab", { name: /Synthetic author/ }));
    await user.click(screen.getByRole("button", { name: "刷新 Synthetic author 的作者仓库" }));
    let dialog = screen.getByRole("dialog", { name: "导入作者仓库" });
    expect(within(dialog).getByLabelText("作者或组织主页")).toHaveValue("https://github.com/Sample/");
    expect(within(dialog).getByLabelText("作者或组织主页")).toHaveFocus();
    await user.clear(within(dialog).getByLabelText("作者或组织主页"));
    await user.type(within(dialog).getByLabelText("作者或组织主页"), "https://github.com/Other");
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: "刷新 Synthetic author 的作者仓库" }));
    dialog = screen.getByRole("dialog", { name: "导入作者仓库" });
    expect(within(dialog).getByLabelText("作者或组织主页")).toHaveValue("https://github.com/Sample/");
    expect(within(dialog).queryByRole("region", { name: "仓库导入预览" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("tab", { name: /^全部/ }));
    await user.click(screen.getByRole("button", { name: "导入 GitHub 作者仓库" }));
    expect(screen.getByLabelText("作者或组织主页")).toHaveValue("");
  });

  it("replaces a successful preview with the original empty and network errors without stale repositories", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ login: "sample", type: "User" }))
      .mockResolvedValueOnce(response([repository()]))
      .mockResolvedValueOnce(response({ login: "sample", type: "User" }))
      .mockResolvedValueOnce(response([]))
      .mockRejectedValueOnce(new Error("Synthetic offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openImport(user);
    await user.type(within(dialog).getByLabelText("作者或组织主页"), "https://github.com/sample");
    await user.click(within(dialog).getByRole("button", { name: "读取仓库" }));
    expect(await within(dialog).findByText("sample/public")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "读取仓库" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("这个作者或组织没有可导入的公开仓库。");
    expect(within(dialog).queryByText("sample/public")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "读取仓库" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("无法连接 GitHub API，请检查网络后重试。");
    expect(within(dialog).getByRole("button", { name: "确认添加" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: "导入 GitHub 作者仓库" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("作者或组织主页")).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("keeps a late closed-dialog read hidden and resets it on reopening under StrictMode", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(response([repository()]));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StrictMode><App /></StrictMode>);
    const dialog = await openImport(user);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText("作者或组织主页"), "https://github.com/sample");
    await user.click(within(dialog).getByRole("button", { name: "读取仓库" }));
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    await act(async () => { pending.resolve(response({ login: "sample", type: "User" })); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog", { name: "导入作者仓库" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "导入 GitHub 作者仓库" }));
    expect(screen.getByLabelText("作者或组织主页")).toHaveValue("");
    expect(screen.queryByText("sample/public")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "读取仓库" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the in-memory import and original save failure/retry path without rereading or importing twice", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ login: "sample", type: "User" }))
      .mockResolvedValueOnce(response([repository()]));
    vi.stubGlobal("fetch", fetchMock);
    const store = createSiteHubStore();
    const save = vi.spyOn(store, "save");
    const user = userEvent.setup();
    render(<App store={store} />);
    const dialog = await openImport(user);
    await act(async () => undefined);
    save.mockClear();
    save.mockRejectedValueOnce(new Error("Synthetic quota"));
    await user.type(within(dialog).getByLabelText("作者或组织主页"), "https://github.com/sample");
    await user.click(within(dialog).getByRole("button", { name: "读取仓库" }));
    await within(dialog).findByText("sample/public");
    await user.click(within(dialog).getByRole("button", { name: "确认添加 1 项" }));
    expect(await screen.findByText(/尚未保存/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "sample" })).toBeInTheDocument();
    expect(screen.getByText("已将 1 个仓库添加到“sample”，跳过 0 个重复项。")).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).sites.some((site: { url: string }) => site.url === repository().html_url)).toBe(false);
    await user.click(screen.getByRole("button", { name: "重试保存" }));
    await waitFor(() => expect(screen.queryByText(/尚未保存/)).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).sites.filter((site: { url: string }) => site.url === repository().html_url)).toHaveLength(1);
  });
});
