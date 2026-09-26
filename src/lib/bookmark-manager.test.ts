import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import type { BrowserBookmarkTreeNode } from "./browser-runtime";
import {
  deleteBookmarkSelection,
  filterBookmarkTree,
  importSelectedBookmarks,
  summarizeBookmarkDeletion,
} from "./bookmark-manager";

const roots: BrowserBookmarkTreeNode[] = [
  {
    id: "bar",
    title: "收藏夹栏",
    children: [
      {
        id: "work",
        parentId: "bar",
        title: "工作",
        children: [
          { id: "docs", parentId: "work", title: "文档", children: [
            { id: "notion", parentId: "docs", title: "Notion", url: "https://notion.so" },
          ] },
          { id: "github-bookmark", parentId: "work", title: "GitHub", url: "https://github.com" },
        ],
      },
      { id: "loose", parentId: "bar", title: "OpenAI", url: "https://openai.com" },
    ],
  },
];

describe("bookmark manager", () => {
  it("maps nested bookmarks to their top-level folder and skips duplicates", () => {
    const selected = new Set(["work", "docs", "notion", "github-bookmark", "loose"]);
    const result = importSelectedBookmarks(
      createDefaultState(),
      roots,
      selected,
      "search",
    );
    expect(result).toMatchObject({ added: 2, skipped: 1, failed: 0 });
    const work = result.state.groups.find((group) => group.name === "工作");
    expect(work).toBeDefined();
    expect(work?.icon).toBe("stack");
    expect(result.state.sites.find((site) => site.url === "https://notion.so")?.groupId).toBe(work?.id);
    expect(result.state.sites.find((site) => site.url === "https://openai.com")?.groupId).toBe("search");
  });

  it("keeps imported bookmark folders in the homepage workspace when GitHub has the same group name", () => {
    const state = createDefaultState();
    state.groups = state.groups.map((group) => group.id === "github-tools" ? { ...group, name: "工作" } : group);
    const result = importSelectedBookmarks(state, roots, new Set(["notion"]), "search");
    const homepageWork = result.state.groups.find((group) => group.name === "工作" && group.workspace === "main");
    expect(homepageWork).toBeDefined();
    expect(result.state.sites.find((site) => site.url === "https://notion.so")?.groupId).toBe(homepageWork?.id);
    expect(homepageWork?.id).not.toBe("github-tools");
  });

  it("includes a matching folder's bookmarks in filtered results", () => {
    const filtered = filterBookmarkTree(roots, "工作");
    expect(filtered[0].children?.[0].children?.map((item) => item.id)).toEqual(["docs", "github-bookmark"]);
  });

  it("collapses selected descendants when deleting a folder tree", async () => {
    const summary = summarizeBookmarkDeletion(
      roots,
      new Set(["work", "docs", "notion"]),
    );
    expect(summary.roots.map((node) => node.id)).toEqual(["work"]);
    expect(summary).toMatchObject({ bookmarkCount: 2, folderCount: 2 });
    const remove = vi.fn().mockResolvedValue(undefined);
    const removeTree = vi.fn().mockResolvedValue(undefined);
    await expect(
      deleteBookmarkSelection({ getTree: vi.fn(), remove, removeTree }, summary),
    ).resolves.toEqual({ deleted: 1, failed: 0 });
    expect(removeTree).toHaveBeenCalledWith("work");
    expect(remove).not.toHaveBeenCalled();
  });
});
