import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import type { BrowserBookmarkTreeNode } from "./browser-runtime";
import { addGroupToState } from "./site-state";
import {
  deleteBookmarkSelection,
  filterBookmarkTree,
  getBrowserBookmarkRoots,
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
  it("imports distinct navigation targets intact and skips only exact bookmark duplicates", () => {
    const urls = [
      "https://example.com/docs#installation",
      "https://example.com/#/dashboard",
      "https://example.com/Guide",
      "https://example.com/guide",
      "https://example.com/docs/",
      "https://example.com/docs#installation",
    ];
    const bookmarks = urls.map((url, index) => ({
      id: `target-${index}`, title: `Target ${index}`, url,
    }));
    const result = importSelectedBookmarks(
      createDefaultState(), bookmarks,
      new Set(bookmarks.map((bookmark) => bookmark.id)), "search",
    );

    expect(result).toMatchObject({ added: 5, skipped: 1, failed: 0 });
    expect(result.state.sites.filter((site) => site.name.startsWith("Target "))
      .map((site) => site.url)).toEqual(urls.slice(0, 5));
  });

  it("preserves nested bookmark folders and skips duplicates", () => {
    const selected = new Set(["work", "docs", "notion", "github-bookmark", "loose"]);
    const result = importSelectedBookmarks(
      createDefaultState(),
      roots,
      selected,
      "search",
    );
    expect(result).toMatchObject({ added: 2, skipped: 1, failed: 0, createdRoots: 1, createdChildren: 1 });
    const work = result.state.groups.find((group) => group.name === "工作");
    expect(work).toBeDefined();
    expect(work?.icon).toBe("stack");
    const docs = result.state.groups.find(group => group.name === "文档" && group.parentId === work?.id);
    expect(docs).toBeDefined();
    expect(result.state.sites.find((site) => site.url === "https://notion.so")?.groupId).toBe(docs?.id);
    expect(result.state.sites.find((site) => site.url === "https://openai.com")?.groupId).toBe("search");
  });

  it("keeps imported bookmark folders in the homepage workspace when GitHub has the same group name", () => {
    const state = createDefaultState();
    state.groups = state.groups.map((group) => group.id === "github-tools" ? { ...group, name: "工作" } : group);
    const result = importSelectedBookmarks(state, roots, new Set(["notion"]), "search");
    const homepageWork = result.state.groups.find((group) => group.name === "工作" && group.workspace === "main");
    expect(homepageWork).toBeDefined();
    const docs = result.state.groups.find(group => group.name === "文档" && group.parentId === homepageWork?.id);
    expect(docs).toBeDefined();
    expect(result.state.sites.find((site) => site.url === "https://notion.so")?.groupId).toBe(docs?.id);
    expect(homepageWork?.id).not.toBe("github-tools");
  });

  it("uses an explicitly selected child for loose links without conflating it with a named bookmark folder", () => {
    const state = addGroupToState(createDefaultState(), "工作", "folder", "work-child", undefined, undefined, "main", "design");
    const result = importSelectedBookmarks(state, roots, new Set(["notion", "loose"]), "work-child");
    const importedWork = result.state.groups.find(group => group.name === "工作" && !group.parentId);
    expect(importedWork).toBeDefined();
    const docs = result.state.groups.find(group => group.name === "文档" && group.parentId === importedWork?.id);
    expect(docs).toBeDefined();
    expect(result.state.sites.find(site => site.url === "https://notion.so")?.groupId).toBe(docs?.id);
    expect(result.state.sites.find(site => site.url === "https://openai.com")?.groupId).toBe("work-child");
  });

  it("matches children by their parent and reuses those paths on subsequent imports", () => {
    const state = addGroupToState(createDefaultState(), "资源", "folder", "existing-child", undefined, undefined, "main", "design");
    const tree = getBrowserBookmarkRoots([{ id: "0", title: "", children: [{ id: "1", title: "书签栏", children: [
      { id: "d", title: "设计", children: [{ id: "ds", title: "资源", children: [
        { id: "dl", title: "Design link", url: "https://design-bookmark.example" },
      ] }] },
      { id: "v", title: "开发", children: [{ id: "vs", title: "资源", children: [
        { id: "vl", title: "Development link", url: "https://dev-bookmark.example" },
      ] }] },
    ] }] }]);
    const selected = new Set(["dl", "vl"]);
    const first = importSelectedBookmarks(state, tree, selected, "search");
    expect(first).toMatchObject({ added: 2, skipped: 0, createdRoots: 0, createdChildren: 1 });
    expect(first.state.sites.find(site => site.name === "Design link")?.groupId).toBe("existing-child");
    const development = first.state.groups.find(group => group.name === "资源" && group.parentId === "develop");
    expect(development).toBeDefined();
    expect(first.state.sites.find(site => site.name === "Development link")?.groupId).toBe(development?.id);
    const second = importSelectedBookmarks(first.state, tree, selected, "search");
    expect(second).toMatchObject({ added: 0, skipped: 2, createdRoots: 0, createdChildren: 0 });
    expect(second.state).toBe(first.state);
  });

  it("combines deep paths without colliding with literal names and retains a selected empty folder", () => {
    const tree = [{ id: "bar", title: "书签栏", children: [{ id: "d", title: "设计", children: [
      { id: "a", title: "图标", children: [{ id: "b", title: "竞赛", children: [
        { id: "deep", title: "Deep", url: "https://deep-bookmark.example" },
      ] }] },
      { id: "c", title: "图标 › 竞赛", children: [{ id: "literal", title: "Literal", url: "https://literal-bookmark.example" }] },
      { id: "empty", title: "空书签夹", children: [] },
    ] }] }];
    const result = importSelectedBookmarks(createDefaultState(), tree, new Set(["deep", "literal", "empty"]), "search");
    expect(result).toMatchObject({ added: 2, skipped: 0, createdRoots: 0, createdChildren: 3 });
    expect(result.mappings).toContainEqual({ sourcePath: ["设计", "图标", "竞赛"], targetPath: "设计 / 图标 › 竞赛", links: 1, combined: true });
    expect(result.state.groups.filter(group => group.parentId === "design").map(group => group.name)).toEqual([
      "图标 › 竞赛", "图标 \\› 竞赛", "空书签夹",
    ]);
  });

  it("copies directly to a selected child while preserving GitHub routing and invalid URL counts", () => {
    const state = addGroupToState(createDefaultState(), "书签", "folder", "bookmark-child", undefined, undefined, "main", "design");
    const tree = [{ id: "bar", title: "书签栏", children: [{ id: "folder", title: "来源", children: [
      { id: "normal", title: "Normal", url: "https://explicit-bookmark.example" },
      { id: "repo", title: "Repo", url: "https://github.com/example/bookmark-test-repo" },
      { id: "invalid", title: "Invalid", url: "javascript:alert(1)" },
    ] }] }];
    const result = importSelectedBookmarks(state, tree, new Set(["normal", "repo", "invalid"]), "bookmark-child", { mode: "target" });
    expect(result).toMatchObject({ added: 2, failed: 1, createdRoots: 0, createdChildren: 0 });
    expect(result.state.sites.find(site => site.name === "Normal")?.groupId).toBe("bookmark-child");
    expect(result.state.sites.find(site => site.name === "Repo")?.groupId).toBe("github-other");
    expect(result.mappings.map(mapping => mapping.targetPath)).toEqual(["设计 / 书签", "GitHub / 其他"]);
    expect(() => importSelectedBookmarks(state, tree, new Set(["normal"]), "missing", { mode: "target" })).toThrow("目标分组已不存在");
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
