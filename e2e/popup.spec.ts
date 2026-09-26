import { expect, test, screenshotPath } from "./fixtures";

test("saves a current page and imports browser bookmarks from the popup", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.appearance.theme = "dark";
    localStorage.setItem("popup-test-collection", JSON.stringify(state));
  });
  await page.addInitScript(() => {
    const collectionKey = "popup-test-collection";
    const api = {
      runtime: { id: "popup-test", getURL: (path: string) => `chrome-extension://popup-test${path}` },
      storage: { local: {
        get: async (key: string) => ({ [key]: localStorage.getItem(collectionKey) }),
        set: async (values: Record<string, string>) => localStorage.setItem(collectionKey, values["site-hub:v1"]),
      } },
      tabs: { query: async () => [{ id: 1, title: "维护示例", url: "https://example.com/maintenance" }] },
      bookmarks: {
        getTree: async () => [{ id: "root", title: "", children: [{ id: "bar", title: "收藏夹栏", children: [
          { id: "reference", title: "参考资料", children: [{ id: "example", title: "示例文档", url: "https://example.org/docs" }] },
        ] }] }],
        remove: async () => {}, removeTree: async () => {},
      },
    };
    Object.defineProperty(window, "chrome", { configurable: true, value: api });
  });
  // Chrome sizes this extension popup from its fixed 440 × 600 CSS shell.
  await page.setViewportSize({ width: 440, height: 600 });
  await page.goto("/popup.html");
  await expect(page.getByRole("textbox", { name: "网站名称" })).toHaveValue("维护示例");
  await expect(page.getByText("当前网页", { exact: true })).toHaveCount(0);
  await expect(page.getByText("保存到网站收藏", { exact: true })).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".popup-shell")).toHaveCSS("background-image", /linear-gradient/);
  await expect(page.locator(".popup-field input")).toHaveCSS("color", "rgb(232, 236, 243)");
  const groupSelect = page.getByRole("button", { name: "添加到分组" });
  await groupSelect.click();
  const groupMenu = page.getByRole("listbox", { name: "添加到分组" });
  await expect(groupMenu).toBeVisible();
  await expect(groupMenu).toHaveCSS("border-radius", "13px");
  await expect(groupMenu).toHaveCSS("backdrop-filter", /blur/);
  await page.screenshot({ path: screenshotPath(`popup-quick-select-${testInfo.project.name}.png`), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(groupMenu).toHaveCount(0);
  await page.getByRole("button", { name: "添加到主页", exact: true }).click();
  await expect(page.getByText("已添加到主页。")).toBeVisible();
  await page.screenshot({ path: screenshotPath(`popup-quick-${testInfo.project.name}.png`), animations: "disabled" });
  await page.getByRole("button", { name: "浏览器书签" }).click();
  await expect(page.getByRole("heading", { name: "整理已有书签" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开书签文件夹 参考资料" })).toHaveCount(0);
  await expect(page.locator(".bookmark-tile.is-folder").first()).toHaveCSS("width", "96px");
  await expect(page.locator(".bookmark-tile.is-folder").first()).toHaveCSS("height", "76px");
  await expect(page.locator(".bookmark-tile.is-folder").first()).toHaveCSS("border-top-style", "solid");
  await expect(page.locator(".bookmark-tile.is-folder").first()).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".bookmark-kind.folder").first()).toHaveCSS("width", "30px");
  await expect(page.locator(".bookmark-kind.folder svg").first()).toHaveAttribute("width", "16");
  const bookmarkGroup = page.getByRole("button", { name: "默认分组" });
  await bookmarkGroup.click();
  const bookmarkGroupMenu = page.getByRole("listbox", { name: "默认分组" });
  await expect(bookmarkGroupMenu).toBeVisible();
  await expect(page.locator(".bookmark-destination .select-menu-root")).toHaveAttribute("data-placement", "top");
  const menuBounds = await bookmarkGroupMenu.boundingBox();
  const popupBounds = await page.locator(".popup-shell").boundingBox();
  expect(menuBounds).not.toBeNull();
  expect(popupBounds).not.toBeNull();
  expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(popupBounds!.y + popupBounds!.height);
  await page.screenshot({ path: screenshotPath(`popup-bookmark-select-${testInfo.project.name}.png`), animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "打开书签文件夹 收藏夹栏" }).click();
  const folderSelection = page.getByRole("checkbox", { name: "选择 参考资料" });
  await folderSelection.check();
  await expect(folderSelection).toHaveCSS("border-radius", "50%");
  await page.screenshot({ path: screenshotPath(`popup-bookmarks-selected-${testInfo.project.name}.png`), animations: "disabled" });
  await page.getByRole("button", { name: /添加到主页/ }).click();
  await expect(page.getByText("新增 1 个，跳过 0 个，失败 0 个。")).toBeVisible();
  const urls = await page.evaluate(() => JSON.parse(localStorage.getItem("popup-test-collection")!).sites.map((site: { url: string }) => site.url));
  expect(urls).toEqual(expect.arrayContaining(["https://example.com/maintenance", "https://example.org/docs"]));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("popup-test-collection")!).appearance.theme)).toBe("dark");
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await page.screenshot({ path: screenshotPath(`popup-bookmarks-${testInfo.project.name}.png`), animations: "disabled" });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("popup-test-collection")!);
    state.appearance.theme = "light";
    localStorage.setItem("popup-test-collection", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "更新已收藏网站" })).toBeVisible();
  await page.screenshot({ path: screenshotPath(`popup-quick-light-${testInfo.project.name}.png`), animations: "disabled" });
  await page.getByRole("button", { name: "浏览器书签" }).click();
  await page.getByRole("button", { name: "打开书签文件夹 收藏夹栏" }).click();
  await page.getByRole("button", { name: "打开书签文件夹 参考资料" }).click();
  await expect(page.getByText("示例文档")).toBeVisible();
  await expect(page.locator(".bookmark-tile.is-site").first()).toHaveCSS("width", "96px");
  await expect(page.locator(".bookmark-tile.is-site").first()).toHaveCSS("height", "76px");
  await expect(page.locator(".bookmark-tile.is-site").first()).toHaveCSS("border-top-style", "solid");
  await expect(page.locator(".bookmark-tile.is-site").first()).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator('[data-bookmark-kind="site"] .favicon-frame').first()).toHaveCSS("width", "30px");
  await expect(page.getByRole("button", { name: "返回上一级书签文件夹" })).toBeVisible();
  await page.screenshot({ path: screenshotPath(`popup-bookmarks-light-${testInfo.project.name}.png`), animations: "disabled" });
});
