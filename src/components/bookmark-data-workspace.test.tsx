import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { useSiteHub } from "../hooks/use-site-hub";
import type { BrowserBookmarkTreeNode, BrowserBookmarksApi } from "../lib/browser-runtime";
import type { SiteHubStore } from "../lib/state-store";
import { BookmarkDataWorkspace } from "./bookmark-data-workspace";

const nativeTree: BrowserBookmarkTreeNode[] = [{ id: "0", title: "", children: [{ id: "bar", title: "书签栏", children: [
  { id: "design", title: "收藏设计", children: [
    { id: "icons", title: "图标", children: [
      { id: "contest", title: "竞赛", children: [{ id: "link", title: "Palette", url: "https://native-bookmark.example" }] },
    ] },
  ] },
] }] }];

function setup() {
  const api = {
    getTree: vi.fn<BrowserBookmarksApi["getTree"]>().mockResolvedValue(nativeTree),
    remove: vi.fn<BrowserBookmarksApi["remove"]>().mockResolvedValue(undefined),
    removeTree: vi.fn<BrowserBookmarksApi["removeTree"]>().mockResolvedValue(undefined),
  };
  let persisted = createDefaultState();
  const pending: { resolve: () => void; reject: () => void }[] = [];
  let controlled = false;
  const save = vi.fn<SiteHubStore["save"]>(next => {
    if (!controlled) { persisted = next; return Promise.resolve(); }
    return new Promise<void>((resolve, reject) => pending.push({
      resolve: () => { persisted = next; resolve(); },
      reject: () => reject(new Error("synthetic write failure")),
    }));
  });
  const store: SiteHubStore = { mode: "extension", initial: { state: persisted, recovered: false }, load: async () => ({ state: persisted, recovered: false }), save };
  const onImport = vi.fn();
  function Harness() {
    const hub = useSiteHub(store);
    return <BookmarkDataWorkspace api={api} state={hub.state} onImport={request => { onImport(request); return hub.importData(request); }}
      importOperation={hub.dataImport} onRetrySave={hub.retrySave} />;
  }
  render(<Harness />);
  return { api, save, onImport, pending, persisted: () => persisted, control: () => { controlled = true; save.mockClear(); } };
}

async function selectNativeFolder() {
  fireEvent.click(await screen.findByRole("checkbox", { name: "选择 书签栏 / 收藏设计" }));
}

afterEach(cleanup);

describe("new-tab browser bookmark management", () => {
  it("previews deep mapping and acknowledges only the successful retry without touching the browser tree", async () => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    await selectNativeFolder();
    const preview = screen.getByRole("complementary", { name: "书签导入预览" });
    expect(within(preview).getByText("收藏设计 / 图标 / 竞赛")).toBeVisible();
    expect(within(preview).getByText("收藏设计 / 图标 › 竞赛")).toBeVisible();
    expect(within(preview).getByText("1 个网站 · 深层路径合并")).toBeVisible();
    expect(app.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "预览并导入书签" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认导入书签" }));
    expect(await screen.findByText("正在保存书签导入结果…")).toBeVisible();
    expect(app.onImport).toHaveBeenCalledTimes(1);
    expect(app.save).toHaveBeenCalledTimes(1);
    await act(async () => app.pending[0].reject());
    expect(screen.getByRole("alert")).toHaveTextContent("尚未确认保存成功");
    expect(app.persisted().sites.some(site => site.name === "Palette")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "重试保存导入结果" }));
    await waitFor(() => expect(app.pending).toHaveLength(2));
    await act(async () => app.pending[1].resolve());
    expect(screen.getByRole("status")).toHaveTextContent("新建 1 个一级组、1 个子分组");
    const parent = app.persisted().groups.find(group => group.name === "收藏设计")!;
    const child = app.persisted().groups.find(group => group.name === "图标 › 竞赛")!;
    expect(child.parentId).toBe(parent.id);
    expect(app.persisted().sites.find(site => site.name === "Palette")?.groupId).toBe(child.id);
    expect(app.onImport).toHaveBeenCalledTimes(1);
    expect(app.api.remove).not.toHaveBeenCalled();
    expect(app.api.removeTree).not.toHaveBeenCalled();
    await selectNativeFolder();
    expect(within(preview).getByText("重复跳过").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "预览并导入书签" })).toBeDisabled();
  });

  it("requires explicit confirmation for deletion and stops if an unseen child appears", async () => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    await selectNativeFolder();
    fireEvent.click(screen.getByRole("button", { name: "删除所选书签" }));
    const dialog = await screen.findByRole("alertdialog", { name: "删除浏览器书签？" });
    expect(within(dialog).getByText(/1 个书签、3 个文件夹/)).toBeVisible();
    expect(app.api.removeTree).not.toHaveBeenCalled();
    const changed = structuredClone(nativeTree);
    changed[0].children![0].children![0].children!.push({ id: "unseen", title: "Unseen", url: "https://unseen.example" });
    app.api.getTree.mockResolvedValueOnce(changed);
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除书签" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("浏览器书签已变化，请重新选择并确认删除");
    expect(app.api.removeTree).not.toHaveBeenCalled();
    expect(app.api.remove).not.toHaveBeenCalled();
    expect(app.onImport).not.toHaveBeenCalled();
    expect(app.save).not.toHaveBeenCalled();
  });

  it("cancels native deletion while keeping the selected bookmarks and collection", async () => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    await selectNativeFolder();
    fireEvent.click(screen.getByRole("button", { name: "删除所选书签" }));
    const dialog = await screen.findByRole("alertdialog", { name: "删除浏览器书签？" });
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "选择 书签栏 / 收藏设计" })).toBeChecked();
    expect(app.api.getTree).toHaveBeenCalledTimes(1);
    expect(app.api.remove).not.toHaveBeenCalled();
    expect(app.api.removeTree).not.toHaveBeenCalled();
    expect(app.save).not.toHaveBeenCalled();
  });

  it("runs a confirmed native deletion separately from collection writes", async () => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    await selectNativeFolder();
    const cleared = structuredClone(nativeTree);
    cleared[0].children![0].children = [];
    app.api.getTree.mockResolvedValueOnce(nativeTree).mockResolvedValueOnce(cleared);
    fireEvent.click(screen.getByRole("button", { name: "删除所选书签" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认删除书签" }));
    expect(await screen.findByText("浏览器书签已删除 1 项，失败 0 项。")).toBeVisible();
    expect(app.api.removeTree).toHaveBeenCalledExactlyOnceWith("design");
    expect(app.save).not.toHaveBeenCalled();
    expect(app.onImport).not.toHaveBeenCalled();
  });

  it("reports a partially rejected deletion and refreshes the surviving native tree", async () => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    const before = app.persisted();
    const withLooseBookmark = structuredClone(nativeTree);
    withLooseBookmark[0].children![0].children!.push({ id: "loose", title: "散放链接", url: "https://loose.example" });
    await screen.findByRole("checkbox", { name: "选择 书签栏 / 收藏设计" });
    app.api.getTree.mockResolvedValueOnce(withLooseBookmark);
    fireEvent.click(screen.getByRole("button", { name: "刷新书签" }));
    await screen.findByRole("checkbox", { name: "选择 书签栏 / 散放链接" });
    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    app.api.getTree.mockResolvedValueOnce(withLooseBookmark).mockResolvedValueOnce(nativeTree);
    app.api.removeTree.mockRejectedValueOnce(new Error("synthetic native folder rejection"));
    fireEvent.click(screen.getByRole("button", { name: "删除所选书签" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认删除书签" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("浏览器书签已删除 1 项，失败 1 项。");
    expect(app.api.remove).toHaveBeenCalledExactlyOnceWith("loose");
    expect(app.api.removeTree).toHaveBeenCalledExactlyOnceWith("design");
    expect(screen.getByRole("checkbox", { name: "选择 书签栏 / 收藏设计" })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "选择 书签栏 / 散放链接" })).toBeNull();
    expect(app.persisted()).toBe(before);
    expect(app.save).not.toHaveBeenCalled();
  });

  it("keeps the completed deletion receipt when the native list cannot refresh", async () => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    await selectNativeFolder();
    app.api.getTree.mockResolvedValueOnce(nativeTree).mockRejectedValueOnce(new Error("synthetic refresh failure"));
    fireEvent.click(screen.getByRole("button", { name: "删除所选书签" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认删除书签" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("浏览器书签已删除 1 项，失败 0 项。无法刷新列表，请重新读取书签。");
    expect(screen.queryByRole("checkbox", { name: "选择 书签栏 / 收藏设计" })).toBeNull();
    expect(screen.getByRole("button", { name: "刷新书签" })).toBeEnabled();
    expect(app.api.removeTree).toHaveBeenCalledExactlyOnceWith("design");
    expect(app.save).not.toHaveBeenCalled();
  });
});
