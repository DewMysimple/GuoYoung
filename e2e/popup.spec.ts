import { expect, test, screenshotPath } from "./fixtures";

test("saves a current page and imports browser bookmarks from the popup", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const collectionKey = "popup-test-collection";
    const api = {
      runtime: { id: "popup-test" },
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
  await expect(page.getByText("维护示例", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "添加到主页", exact: true }).click();
  await expect(page.getByText("当前网页已添加到主页。")).toBeVisible();
  await page.screenshot({ path: screenshotPath(`popup-quick-${testInfo.project.name}.png`), animations: "disabled" });
  await page.getByRole("button", { name: "浏览器书签" }).click();
  await page.getByRole("checkbox", { name: "选择 参考资料" }).check();
  await page.getByRole("button", { name: /添加到主页/ }).click();
  await expect(page.getByText("新增 1 个，跳过 0 个，失败 0 个。")).toBeVisible();
  const urls = await page.evaluate(() => JSON.parse(localStorage.getItem("popup-test-collection")!).sites.map((site: { url: string }) => site.url));
  expect(urls).toEqual(expect.arrayContaining(["https://example.com/maintenance", "https://example.org/docs"]));
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await page.screenshot({ path: screenshotPath(`popup-bookmarks-${testInfo.project.name}.png`), animations: "disabled" });
});
