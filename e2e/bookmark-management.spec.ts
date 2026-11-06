import { expect, screenshotPath, test } from "./fixtures";

const bookmarkTree = [{ id: "0", title: "", children: [{ id: "1", title: "书签栏", children: [
  { id: "design", title: "浏览器设计收藏", children: [
    { id: "link", title: "设计主页", url: "https://design.bookmark.example" },
    { id: "icons", title: "图标资源", children: [
      { id: "contest", title: "竞赛灵感", children: [{ id: "deep", title: "灵感站点", url: "https://deep.bookmark.example" }] },
    ] },
  ] },
] }] }];

test("previews deep browser bookmark paths and persists an import without changing the source tree", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop extension bookmark management");
  const storedKey = "bookmark-management-collection";
  await page.evaluate(key => localStorage.setItem(key, localStorage.getItem("site-hub:v1")!), storedKey);
  await page.addInitScript(({ key, tree }) => {
    Object.defineProperty(window, "chrome", { configurable: true, value: {
      runtime: { id: "bookmark-management-test", getURL: (path: string) => `chrome-extension://bookmark-management-test/${path}` },
      storage: { local: {
        get: async (name: string) => ({ [name]: localStorage.getItem(key) }),
        set: async (values: Record<string, string>) => localStorage.setItem(key, values["site-hub:v1"]),
      } },
      bookmarks: {
        getTree: async () => structuredClone(tree),
        remove: async () => localStorage.setItem(`${key}:native-delete`, "1"),
        removeTree: async () => localStorage.setItem(`${key}:native-delete`, "1"),
      },
    } });
  }, { key: storedKey, tree: bookmarkTree });
  await page.goto("/?data=bookmarks", { waitUntil: "domcontentloaded" });
  const tree = page.getByRole("region", { name: "浏览器原始书签树" });
  const preview = page.getByRole("complementary", { name: "书签导入预览" });
  await tree.getByText("浏览器设计收藏", { exact: true }).click();
  await tree.getByText("图标资源", { exact: true }).click();
  await tree.getByText("竞赛灵感", { exact: true }).click();
  await tree.getByRole("checkbox", { name: "选择 书签栏 / 浏览器设计收藏", exact: true }).check();
  await expect(tree.getByText("灵感站点", { exact: true })).toBeVisible();
  await expect(preview.getByText("浏览器设计收藏 / 图标资源 / 竞赛灵感")).toBeVisible();
  await expect(preview.getByText("浏览器设计收藏 / 图标资源 › 竞赛灵感")).toBeVisible();
  await page.screenshot({ path: screenshotPath("bookmark-management-preview.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "预览并导入书签" }).click();
  await page.getByRole("button", { name: "确认导入书签" }).click();
  await expect(page.getByRole("status").filter({ hasText: "已导入 2 个网站" })).toContainText("已导入 2 个网站，跳过 0 个重复链接，0 个链接无效。新建 1 个一级组、1 个子分组。");
  const saved = await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key)!);
    const root = state.groups.find((group: { name: string }) => group.name === "浏览器设计收藏");
    const child = state.groups.find((group: { name: string }) => group.name === "图标资源 › 竞赛灵感");
    const site = state.sites.find((item: { name: string }) => item.name === "灵感站点");
    return { hierarchy: child.parentId === root.id && site.groupId === child.id, sourceMutated: localStorage.getItem(`${key}:native-delete`) };
  }, storedKey);
  expect(saved).toEqual({ hierarchy: true, sourceMutated: null });
  await page.reload();
  await tree.getByRole("checkbox", { name: "选择 书签栏 / 浏览器设计收藏", exact: true }).check();
  await expect(preview.locator("dl > div").filter({ hasText: "重复跳过" }).locator("dd")).toHaveText("2");
  await expect(page.getByRole("button", { name: "预览并导入书签" })).toBeDisabled();
});
