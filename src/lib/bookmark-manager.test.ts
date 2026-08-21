import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import type { BrowserBookmarkTreeNode } from "./browser-runtime";
import {
  deleteBookmarkSelection,
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
    expect(result.state.sites.find((site) => site.url === "https://notion.so")?.groupId).toBe(work?.id);
    expect(result.state.sites.find((site) => site.url === "https://openai.com")?.groupId).toBe("search");
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
