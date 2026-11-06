import { expect, test, screenshotPath } from "./fixtures";
import type { Page } from "@playwright/test";

const newGroupCollectionKey = "popup-new-group-collection";

async function openQuickGroupPopup(page: Page, url: string, theme: "light" | "dark") {
  await page.evaluate(({ key, theme }) => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.appearance.theme = theme;
    state.sites.find((site: { id: string }) => site.id === "google").note = "保留现有备注";
    state.groups.push(...Array.from({ length: 24 }, (_, index) => ({
      ...state.groups[0], id: `popup-extra-${index}`, name: `常用资料 ${index + 1}`, order: index + 10,
    })));
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem(`${key}:writes`, "0");
  }, { key: newGroupCollectionKey, theme });
  await page.addInitScript(({ key, url }) => {
    Object.defineProperty(window, "chrome", { configurable: true, value: {
      runtime: { id: "popup-new-group", getURL: (path: string) => `chrome-extension://popup-new-group/${path}` },
      storage: { local: {
        get: async (storageKey: string) => ({ [storageKey]: localStorage.getItem(key) }),
        set: async (values: Record<string, string>) => {
          localStorage.setItem(key, values["site-hub:v1"]);
          localStorage.setItem(`${key}:writes`, String(Number(localStorage.getItem(`${key}:writes`)) + 1));
        },
      } },
      tabs: { query: async () => [{ id: 1, title: "弹窗当前网站", url }] },
      bookmarks: { getTree: async () => [] },
    } });
  }, { key: newGroupCollectionKey, url });
  await page.setViewportSize({ width: 440, height: 600 });
  await page.goto("/popup.html");
  await expect(page.getByRole("button", { name: "新建分组", exact: true })).toBeVisible();
}

for (const theme of ["light", "dark"] as const) for (const workspace of ["main", "github"] as const) {
  test(`popup creates a group with the current site in one write (${workspace}, ${theme})`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "Desktop extension popup group creation");
    const url = workspace === "github" ? "https://github.com/acme/popup-group" : "https://example.org/popup-group";
    await openQuickGroupPopup(page, url, theme);
    const before = await page.evaluate(key => localStorage.getItem(key), newGroupCollectionKey);
    await page.getByRole("button", { name: "新建分组", exact: true }).click();
    const name = page.getByRole("textbox", { name: "新分组名称", exact: true });
    await expect(name).toBeFocused();
    await name.fill("放弃的草稿");
    await page.getByRole("button", { name: "取消新建分组" }).click();
    expect(await page.evaluate(key => localStorage.getItem(key), newGroupCollectionKey)).toBe(before);
    await page.getByRole("button", { name: "新建分组", exact: true }).click();
    await expect(name).toHaveValue("");
    const submit = page.getByRole("button", { name: "新建分组并添加", exact: true });
    await expect(submit).toBeDisabled();
    const groupName = workspace === "github" ? "开发" : "弹窗新分组";
    await name.fill(groupName);
    const geometry = await page.locator(".popup-shell").evaluate(shell => {
      const button = shell.querySelector(".quick-page .popup-primary")!.getBoundingClientRect();
      const input = shell.querySelector(".popup-new-group input")!.getBoundingClientRect();
      return { buttonTop: button.top, buttonBottom: button.bottom, inputWidth: input.width,
        viewportHeight: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.buttonTop).toBeGreaterThan(0);
    expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.inputWidth).toBeGreaterThan(200);
    expect(geometry.overflow).toBe(false);
    await page.locator(".popup-shell").screenshot({ path: screenshotPath(`popup-new-group-${workspace}-${theme}.png`), animations: "disabled" });
    await submit.click();
    await expect(page.getByRole("status")).toContainText(`已新建“${groupName}”，并添加当前网站。`);
    const result = await page.evaluate(({ key, groupName, workspace, url }) => {
      const state = JSON.parse(localStorage.getItem(key)!);
      const group = state.groups.find((group: { name: string; workspace: string }) => group.name === groupName && group.workspace === workspace);
      const site = state.sites.find((site: { url: string }) => site.url === url);
      return { group, site, writes: Number(localStorage.getItem(`${key}:writes`)), groups: state.groups.length,
        sites: state.sites.length, existingNote: state.sites.find((site: { id: string }) => site.id === "google").note };
    }, { key: newGroupCollectionKey, groupName, workspace, url });
    expect(result.group).toMatchObject({ workspace, icon: "folder", isProtected: false });
    expect(result.site.groupId).toBe(result.group.id);
    expect(result.writes).toBe(1);
    expect(result.groups).toBe(JSON.parse(before!).groups.length + 1);
    expect(result.sites).toBe(JSON.parse(before!).sites.length + 1);
    expect(result.existingNote).toBe("保留现有备注");
    await page.reload();
    await expect(page.getByRole("button", { name: workspace === "github" ? "收藏到 GitHub 分组" : "收藏到分组" })).toHaveText(groupName);
    await expect(page.getByRole("button", { name: "保存修改", exact: true })).toBeVisible();
  });
}

test("popup duplicate confirmation creates no empty group and retains the existing site note", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop extension popup duplicate confirmation");
  await openQuickGroupPopup(page, "https://www.google.com", "light");
  const before = await page.evaluate(key => localStorage.getItem(key), newGroupCollectionKey);
  await page.getByRole("button", { name: "新建分组", exact: true }).click();
  const name = page.getByRole("textbox", { name: "新分组名称" });
  await name.fill("重复网站迁移");
  await page.getByRole("button", { name: "新建分组并添加", exact: true }).click();
  await expect(page.getByText(/再次确认会新建“重复网站迁移”/)).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), newGroupCollectionKey)).toBe(before);
  await name.fill("确认后的分组");
  await expect(page.getByRole("button", { name: "确认新建并移动", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "新建分组并添加", exact: true }).click();
  const confirm = page.getByRole("button", { name: "确认新建并移动", exact: true });
  await expect(confirm).toBeVisible();
  const bounds = await confirm.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(600);
  await page.locator(".popup-shell").screenshot({ path: screenshotPath("popup-new-group-duplicate-confirm.png"), animations: "disabled" });
  await confirm.click();
  await expect(page.getByRole("status")).toContainText("已新建“确认后的分组”，并移动更新现有收藏。");
  const result = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), newGroupCollectionKey);
  const group = result.groups.find((group: { name: string }) => group.name === "确认后的分组");
  expect(result.groups).toHaveLength(JSON.parse(before!).groups.length + 1);
  expect(result.sites).toHaveLength(JSON.parse(before!).sites.length);
  expect(result.groups.some((group: { name: string }) => group.name === "重复网站迁移")).toBe(false);
  expect(result.sites.find((site: { id: string }) => site.id === "google")).toMatchObject({
    groupId: group.id, note: "保留现有备注", name: JSON.parse(before!).sites.find((site: { id: string }) => site.id === "google").name,
  });
  expect(await page.evaluate(key => localStorage.getItem(`${key}:writes`), newGroupCollectionKey)).toBe("1");
});

test("saves a current page and imports browser bookmarks from the popup", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.appearance.theme = "dark";
    state.wallpaper = { ...state.wallpaper, glassBlur: 7, glassSaturation: 118, glassPanelTransparency: 44 };
    state.groups.push({ ...state.groups[0], id: "popup-design-child", parentId: "design", name: "资源收藏", icon: "folder" });
    localStorage.setItem("popup-test-collection", JSON.stringify(state));
    localStorage.setItem("popup-native-deletes", "0");
  });
  await page.addInitScript(() => {
    const collectionKey = "popup-test-collection";
    const api = {
      runtime: { id: "popup-test", getURL: (path: string) => `chrome-extension://popup-test${path}` },
      storage: { local: {
        get: async (key: string) => ({ [key]: localStorage.getItem(collectionKey) }),
        set: async (values: Record<string, string>) => localStorage.setItem(collectionKey, values["site-hub:v1"]),
      } },
      tabs: { query: async () => [{
        id: 1,
        title: "维护示例",
        url: localStorage.getItem("popup-active-tab") ?? "https://example.com/maintenance",
        favIconUrl: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Crect%20width='64'%20height='64'%20rx='14'%20fill='%234f7fe8'/%3E%3Cpath%20d='M22%2015v34M24%2032l20-17M24%2032l20%2017'%20stroke='white'%20stroke-width='6'%20stroke-linecap='round'/%3E%3C/svg%3E",
      }] },
      bookmarks: {
        getTree: async () => [{ id: "root", title: "", children: [{ id: "bar", title: "收藏夹栏", children: [
          { id: "reference", title: "参考资料", children: [{ id: "example", title: "示例文档", url: "https://example.org/docs" }] },
          { id: "ideas", title: "工作灵感", children: [{ id: "idea-link", title: "灵感示例", url: "https://example.org/ideas" }] },
          { id: "tools", title: "开发工具", children: [{ id: "tool-link", title: "工具示例", url: "https://example.org/tools" }] },
        ] }] }],
        remove: async () => localStorage.setItem("popup-native-deletes", "1"),
        removeTree: async () => localStorage.setItem("popup-native-deletes", "1"),
      },
    };
    Object.defineProperty(window, "chrome", { configurable: true, value: api });
  });
  // Both popup tabs keep the same native browser action size.
  await page.setViewportSize({ width: 440, height: 600 });
  await page.goto("/popup.html");
  await expect(page.locator(".popup-shell.is-quick")).toHaveCSS("width", "440px");
  await expect(page.locator(".popup-shell.is-quick")).toHaveCSS("height", "600px");
  await expect(page.locator(".popup-brand")).toHaveText("Mysimple");
  await expect(page.getByRole("heading", { name: "当前网页" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "网站名称" })).toHaveValue("维护示例");
  await expect(page.getByText("example.com", { exact: true })).toBeVisible();
  await expect(page.locator(".popup-target-icon img")).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-glass-surface", "popup");
  await expect(page.locator(".popup-shell")).toHaveCSS("background-image", /radial-gradient.*linear-gradient/);
  await expect(page.locator(".popup-site-name input")).toHaveCSS("color", "rgb(232, 236, 243)");
  await expect(page.locator(".popup-form-card")).toHaveCSS("backdrop-filter", "blur(7px) saturate(1.18)");
  const quickLayout = await page.locator(".popup-shell").evaluate(shell => {
    const rect = (selector: string) => shell.querySelector(selector)!.getBoundingClientRect();
    return {
      brandBottom: rect(".popup-brand-row").bottom,
      tabsTop: rect(".popup-tabs").top,
      targetWidth: rect(".popup-target-select").width,
      targetHeight: rect(".popup-select-trigger").height,
      noteHeight: rect(".popup-note-field textarea").height,
      noteBottom: rect(".popup-note-field textarea").bottom,
      submitTop: rect(".quick-page .popup-primary").top,
      submitBottom: rect(".quick-page .popup-primary").bottom,
      cardBottom: rect(".popup-form-card").bottom,
      footerTop: rect(".popup-footer").top,
    };
  });
  expect(quickLayout.tabsTop).toBeGreaterThan(quickLayout.brandBottom);
  expect(quickLayout.targetWidth).toBeGreaterThan(300);
  expect(quickLayout.targetHeight).toBeGreaterThanOrEqual(40);
  expect(quickLayout.noteHeight).toBeGreaterThan(100);
  expect(quickLayout.submitTop).toBeGreaterThan(quickLayout.noteBottom);
  expect(quickLayout.submitBottom).toBeLessThanOrEqual(quickLayout.footerTop);
  expect(quickLayout.cardBottom).toBeLessThanOrEqual(quickLayout.footerTop);
  expect(quickLayout.footerTop - quickLayout.cardBottom).toBeLessThanOrEqual(6);
  expect(quickLayout.footerTop - quickLayout.submitBottom).toBeLessThanOrEqual(23);
  await page.getByRole("button", { name: "收藏到分组" }).click();
  const quickList = page.getByRole("listbox", { name: "收藏到分组" });
  await expect(quickList).toHaveCSS("backdrop-filter", "blur(7px) saturate(1.18)");
  await expect(quickList.getByRole("option", { name: "搜索" })).toHaveAttribute("aria-selected", "true");
  await page.locator(".popup-shell").screenshot({ path: screenshotPath(`popup-quick-groups-${testInfo.project.name}.png`), animations: "disabled" });
  await quickList.getByRole("option", { name: "设计 / 资源收藏" }).click();
  await expect(page.getByRole("button", { name: "收藏到分组" })).toHaveText("设计 / 资源收藏");
  await page.getByRole("textbox", { name: "网站备注", exact: true }).fill("当前页的补充说明");
  await page.getByRole("button", { name: "收藏当前网页", exact: true }).click();
  await expect(page.getByText("已添加到主页。")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存修改" })).toBeVisible();
  await page.locator(".popup-shell").screenshot({ path: screenshotPath(`popup-quick-${testInfo.project.name}.png`), animations: "disabled" });

  await page.getByRole("button", { name: "浏览器书签" }).click();
  await expect(page.locator(".popup-shell.is-bookmarks")).toHaveCSS("width", "440px");
  await expect(page.locator(".popup-shell.is-bookmarks")).toHaveCSS("height", "600px");
  await expect(page.getByRole("button", { name: "浏览器书签" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "完整书签管理" }))
    .toHaveAttribute("href", "chrome-extension://popup-test/index.html?data=bookmarks");
  await expect(page.getByRole("button", { name: "删除", exact: true })).toHaveCount(0);
  const gridColumnCount = await page.locator(".bookmark-grid").evaluate(grid =>
    getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length,
  );
  expect(gridColumnCount).toBe(2);
  const firstFolder = page.locator(".bookmark-tile.is-folder").first();
  await expect(firstFolder).toHaveCSS("height", "51px");
  await expect(firstFolder).toHaveCSS("border-top-style", "solid");
  await expect(firstFolder.locator(".bookmark-kind")).toHaveCSS("width", "27px");
  const bookmarkGroup = page.getByRole("button", { name: "导入到分组" });
  await bookmarkGroup.click();
  const bookmarkGroupMenu = page.getByRole("listbox", { name: "导入到分组" });
  await expect(bookmarkGroupMenu).toBeVisible();
  await expect(page.locator(".bookmark-destination .select-menu-root")).toHaveAttribute("data-placement", "top");
  const menuBounds = await bookmarkGroupMenu.boundingBox();
  const popupBounds = await page.locator(".popup-shell").boundingBox();
  expect(menuBounds).not.toBeNull();
  expect(popupBounds).not.toBeNull();
  expect(menuBounds!.y).toBeGreaterThanOrEqual(popupBounds!.y);
  expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(popupBounds!.y + popupBounds!.height);
  await expect(bookmarkGroupMenu).toHaveCSS("border-radius", "13px");
  await expect(bookmarkGroupMenu).toHaveCSS("backdrop-filter", "blur(7px) saturate(1.18)");
  await page.locator(".popup-shell").screenshot({ path: screenshotPath(`popup-bookmark-select-${testInfo.project.name}.png`), animations: "disabled" });
  await bookmarkGroupMenu.getByRole("option", { name: "设计 / 资源收藏" }).click();
  await page.getByRole("button", { name: "打开书签文件夹 收藏夹栏" }).click();
  await expect(page.locator(".bookmark-tile.is-folder .bookmark-tile-name").first()).toHaveCSS("text-overflow", "ellipsis");
  await page.locator(".popup-shell").screenshot({ path: screenshotPath(`popup-bookmark-folders-${testInfo.project.name}.png`), animations: "disabled" });
  const selection = page.getByRole("checkbox", { name: "选择 参考资料" });
  await selection.check();
  await expect(selection).toBeChecked();
  await expect(page.locator(".bookmark-selection-count")).toHaveText("已选择 1 项");
  await page.locator(".popup-shell").screenshot({ path: screenshotPath(`popup-bookmarks-selected-${testInfo.project.name}.png`), animations: "disabled" });
  await page.getByRole("button", { name: "导入所选" }).click();
  await expect(page.getByText("新增 1 个，跳过 0 个，失败 0 个。")).toBeVisible();
  const saved = await page.evaluate(() => ({
    collection: JSON.parse(localStorage.getItem("popup-test-collection")!),
    nativeDeletes: localStorage.getItem("popup-native-deletes"),
  }));
  const current = saved.collection.sites.find((site: { url: string }) => site.url === "https://example.com/maintenance");
  expect(current).toMatchObject({ groupId: "popup-design-child", note: "当前页的补充说明" });
  expect(saved.collection.sites.find((site: { url: string }) => site.url === "https://example.org/docs")?.groupId).toBe("popup-design-child");
  expect(saved.collection.groups.some((group: { name: string }) => group.name === "参考资料")).toBe(false);
  expect(saved.nativeDeletes).toBe("0");
  expect(saved.collection.appearance.theme).toBe("dark");
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await page.locator(".popup-shell").screenshot({ path: screenshotPath(`popup-bookmarks-${testInfo.project.name}.png`), animations: "disabled" });

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("popup-test-collection")!);
    state.appearance.theme = "light";
    localStorage.setItem("popup-test-collection", JSON.stringify(state));
    localStorage.setItem("popup-active-tab", "https://example.com/uncollected");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "收藏到分组" })).toHaveText("设计 / 资源收藏");
  await expect(page.getByText("最近使用的分组")).toBeVisible();
  await page.locator(".popup-shell").screenshot({ path: screenshotPath(`popup-quick-light-${testInfo.project.name}.png`), animations: "disabled" });
  await page.getByRole("button", { name: "浏览器书签" }).click();
  await expect(page.getByRole("button", { name: "导入到分组" })).toHaveText("设计 / 资源收藏");
  await page.getByRole("button", { name: "打开书签文件夹 收藏夹栏" }).click();
  await page.getByRole("button", { name: "打开书签文件夹 参考资料" }).click();
  const crumbs = page.getByRole("navigation", { name: "书签文件夹路径" });
  await expect(crumbs.locator("[aria-current='page']")).toHaveText("参考资料");
  const search = page.getByRole("textbox", { name: "搜索书签或网址" });
  await search.fill("工具示例");
  await expect(page.getByTestId("bookmark-card-tool-link")).toBeVisible();
  await search.clear();
  await expect(crumbs.locator("[aria-current='page']")).toHaveText("参考资料");
  await expect(page.getByText("示例文档")).toBeVisible();
  await expect(page.locator(".bookmark-tile.is-site").first()).toHaveCSS("height", "51px");
  await expect(page.locator('[data-bookmark-kind="site"] .favicon-frame').first()).toHaveCSS("width", "27px");
  await page.locator(".popup-shell").screenshot({ path: screenshotPath(`popup-bookmarks-light-${testInfo.project.name}.png`), animations: "disabled" });
  await crumbs.getByRole("button", { name: "收藏夹栏" }).click();
  await expect(page.getByRole("button", { name: "打开书签文件夹 参考资料" })).toBeVisible();

  // Native toolbars can allocate less than the requested width and height.
  await page.setViewportSize({ width: 431, height: 510 });
  await expect(page.locator(".popup-shell")).toHaveCSS("width", "431px");
  await expect(page.locator(".popup-shell")).toHaveCSS("height", "510px");
  await expect(page.getByRole("button", { name: "导入所选" })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("link", { name: "完整书签管理" })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "快速收藏" }).click();
  await expect(page.getByRole("button", { name: "收藏当前网页" })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "新建分组" }).click();
  await page.getByRole("textbox", { name: "新分组名称" }).fill("紧凑窗口");
  const compactSubmit = page.getByRole("button", { name: "新建分组并添加" });
  await compactSubmit.scrollIntoViewIfNeeded();
  await expect(compactSubmit).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  await page.locator(".popup-shell").screenshot({ path: screenshotPath(`popup-compact-${testInfo.project.name}.png`), animations: "disabled" });
});
