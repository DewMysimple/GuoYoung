import { expect, test, screenshotPath } from "./fixtures";

test("website notes remain visible outside heat sorting and can be edited, hidden and restored", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop website notes");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByRole("menuitem", { name: /添加网站/ }).click();
  const dialog = page.getByRole("dialog", { name: "添加网站", exact: true });
  await dialog.getByLabel("网站地址", { exact: true }).fill("https://example.com/notes-check");
  await dialog.getByLabel("网站名称", { exact: true }).fill("备注功能测试");
  await dialog.getByLabel("网站备注", { exact: true }).fill("项目交互设计资料");
  await dialog.getByRole("button", { name: "添加网站", exact: true }).click();
  const card = page.locator(".site-card").filter({ has: page.getByRole("link", { name: "打开 备注功能测试", exact: true }) });
  await expect(card.locator(".site-note")).toHaveText("项目交互设计资料");
  await expect(card.locator(".site-click-count")).toHaveCount(0);
  await card.getByRole("button", { name: "编辑 备注功能测试", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "编辑网站", exact: true });
  await expect(editor.getByLabel("网站备注", { exact: true })).toHaveValue("项目交互设计资料");
  const noteEditor = editor.getByLabel("网站备注", { exact: true });
  await noteEditor.fill("项目交互设计资料 v2\n".repeat(20));
  const editorBounds = await noteEditor.evaluate(element => {
    const field = element.closest(".input-shell")!.getBoundingClientRect();
    const input = element.getBoundingClientRect();
    const next = element.closest(".field-group")!.nextElementSibling!.getBoundingClientRect();
    return { field: field.toJSON(), input: input.toJSON(), nextTop: next.top };
  });
  expect(editorBounds.input.height).toBeGreaterThanOrEqual(82);
  expect(editorBounds.input.width).toBeGreaterThan(editorBounds.field.width - 4);
  expect(editorBounds.input.top).toBeGreaterThanOrEqual(editorBounds.field.top);
  expect(editorBounds.input.bottom).toBeLessThanOrEqual(editorBounds.field.bottom);
  expect(editorBounds.nextTop).toBeGreaterThanOrEqual(editorBounds.field.bottom);
  await noteEditor.fill("项目交互设计资料 v2");
  await editor.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(card.locator(".site-note")).toHaveText("项目交互设计资料 v2");
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置", exact: true });
  await settings.getByRole("checkbox", { name: "显示网站备注", exact: true }).uncheck();
  await expect(card.locator(".site-note")).toHaveCount(0);
  await settings.getByRole("button", { name: "取消", exact: true }).click();
  await expect(card.locator(".site-note")).toBeVisible();
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  await settings.getByRole("checkbox", { name: "显示网站备注", exact: true }).uncheck();
  await settings.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.reload();
  await expect(card.locator(".site-note")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).sites.find((site: { name: string }) => site.name === "备注功能测试").note)).toBe("项目交互设计资料 v2");
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  await settings.getByRole("checkbox", { name: "显示网站备注", exact: true }).check();
  await settings.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索网页或筛选收藏" }).fill("项目交互设计资料");
  await expect(card).toBeVisible();
  await page.screenshot({ path: screenshotPath("site-note-search.png") });
});

test("heat cards put a note between the count and category without clipping square cards", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop website note geometry");
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.sites[0].note = "长备注测试".repeat(70);
    state.appearance = { ...state.appearance, cardShape: "square", fontScale: 130, cardFontScale: 140, cardColumns: 12, cardLayout: "columns" };
    state.sortModeByWorkspace.main = "heat";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  const card = page.locator('.site-card:has(.site-note)').first();
  await expect(card.locator(".site-click-count")).toBeVisible();
  const bounds = await card.evaluate(element => {
    const rect = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
    const outer = element.getBoundingClientRect(), count = rect(".site-click-count"), note = rect(".site-note"), footer = rect(".site-category");
    return { width: outer.width, height: outer.height, countBottom: count.bottom, noteTop: note.top, noteBottom: note.bottom, footerTop: footer.top, footerBottom: footer.bottom, bottom: outer.bottom };
  });
  expect(Math.abs(bounds.width - bounds.height)).toBeLessThan(1);
  expect(bounds.noteTop).toBeGreaterThanOrEqual(bounds.countBottom);
  expect(bounds.footerTop).toBeGreaterThanOrEqual(bounds.noteBottom);
  expect(bounds.footerBottom).toBeLessThan(bounds.bottom);
  await page.screenshot({ path: screenshotPath("site-note-square-heat.png") });
});
