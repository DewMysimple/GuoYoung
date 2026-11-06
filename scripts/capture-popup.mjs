// Verify the built popup in an isolated MV3 profile with native bookmarks and storage.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const extension = resolve(process.env.CAPTURE_EXTENSION_DIR ?? "dist-extension");
const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"));
const output = resolve(process.env.CAPTURE_OUTPUT ?? `artifacts/releases/v${manifest.version}/screenshots`);
const viewport = { width: 440, height: 600 };
const profile = await mkdtemp(join(tmpdir(), "mysimple-popup-check-"));
await mkdir(output, { recursive: true });
const errors = [];
const screenshots = [];
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, viewport, colorScheme: "light",
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const origin = `chrome-extension://${new URL(worker.url()).host}`;
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/index.html`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/扩展本地保存/)).toBeVisible();
  await expect.poll(() => worker.evaluate(async () => Boolean((await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"]))).toBe(true);
  const nativeTree = await worker.evaluate(async () => {
    const key = "site-hub:v1";
    const state = JSON.parse((await chrome.storage.local.get(key))[key]);
    const design = state.groups.find(group => group.id === "design");
    state.groups.push(
      { ...design, id: "capture-popup-child", name: "图标资源", icon: "folder", parentId: design.id },
      ...Array.from({ length: 23 }, (_, index) => ({
        ...design, id: `capture-popup-group-${index}`, name: `资料组 ${index + 1}`, order: 20 + index,
      })),
    );
    state.appearance.theme = "light";
    state.wallpaper = { ...state.wallpaper, glassBlur: 9, glassSaturation: 118, glassPanelTransparency: 42 };
    await chrome.storage.local.set({ [key]: JSON.stringify(state) });
    const root = (await chrome.bookmarks.getTree())[0].children[0];
    const folder = await chrome.bookmarks.create({ parentId: root.id, title: "参考资料" });
    const deep = await chrome.bookmarks.create({ parentId: folder.id, title: "深层目录" });
    await chrome.bookmarks.create({ parentId: deep.id, title: "示例文档", url: "https://example.org/capture-bookmark" });
    return JSON.stringify(await chrome.bookmarks.getTree());
  });

  // An extension-page tab cannot grant activeTab for another site. Supply
  // deterministic active-tab metadata while exercising native bookmarks and storage.
  await page.addInitScript(() => {
    const tabs = window.chrome?.tabs;
    if (!tabs) return;
    const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Ccircle cx='32' cy='32' r='26' fill='royalblue'/%3E%3C/svg%3E";
    Object.defineProperty(tabs, "query", {
      configurable: true,
      value: async () => [{ id: 42, title: "当前页面验证", url: "https://example.net/capture-popup", favIconUrl: icon }],
    });
  });
  await page.goto(`${origin}/popup.html`, { waitUntil: "domcontentloaded" });
  const shell = page.locator(".popup-shell");
  const capture = async name => {
    const path = join(output, `popup-production-${name}.png`);
    await shell.screenshot({ path, animations: "disabled" });
    screenshots.push(path);
  };
  const verifyFilledQuickCard = async () => {
    const geometry = await shell.evaluate(element => {
      const rect = selector => element.querySelector(selector).getBoundingClientRect();
      const footerTop = rect(".popup-footer").top;
      return {
        noteHeight: rect(".popup-note-field textarea").height,
        cardGap: footerTop - rect(".popup-form-card").bottom,
        actionGap: footerTop - rect(".quick-page .popup-primary").bottom,
      };
    });
    assert.ok(geometry.noteHeight > 100 && geometry.cardGap >= 0 && geometry.cardGap <= 6
      && geometry.actionGap >= 0 && geometry.actionGap <= 23, JSON.stringify(geometry));
  };
  const quickTarget = page.getByRole("button", { name: "收藏到分组" });
  const bookTarget = page.getByRole("button", { name: "导入到分组" });
  const bookmarks = page.getByRole("button", { name: "浏览器书签" });
  await expect(shell).toHaveCSS("height", "600px");
  await expect(shell).toHaveCSS("width", "440px");
  await expect(page.locator(".popup-brand")).toHaveText("Mysimple");
  await expect(page.getByText("example.net", { exact: true })).toBeVisible();
  await expect(page.locator(".popup-form-card")).toHaveCSS("backdrop-filter", "blur(9px) saturate(1.18)");
  await page.getByRole("textbox", { name: "网站备注" }).fill("从原生扩展弹窗保存的备注");
  await verifyFilledQuickCard();
  await capture("quick-light");
  await quickTarget.click();
  const quickOptions = page.getByRole("listbox", { name: "收藏到分组" });
  assert.ok(await quickOptions.evaluate(menu => menu.scrollHeight > menu.clientHeight), "Long target lists scroll inside the popup");
  await capture("quick-target-light");
  await quickOptions.getByRole("option", { name: "设计 / 图标资源" }).click();
  await page.getByRole("button", { name: "收藏当前网页" }).click();
  await expect(page.getByRole("button", { name: "保存修改" })).toBeVisible();
  await capture("quick-saved-light");

  await bookmarks.click();
  await expect(page.locator(".bookmark-tree")).toHaveCSS("backdrop-filter", "blur(9px) saturate(1.18)");
  await capture("bookmarks-overview-light");
  await page.getByRole("button", { name: /打开书签文件夹/ }).first().click();
  await page.getByRole("button", { name: "打开书签文件夹 参考资料" }).click();
  await page.getByRole("button", { name: "打开书签文件夹 深层目录" }).click();
  const crumbs = page.getByRole("navigation", { name: "书签文件夹路径" });
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText("深层目录");
  await capture("bookmarks-light");
  await page.getByRole("textbox", { name: "搜索书签或网址" }).fill("示例");
  await page.getByRole("checkbox", { name: "选择 示例文档" }).check();
  await bookTarget.click();
  const bookOptions = page.getByRole("listbox", { name: "导入到分组" });
  await expect(bookOptions).toHaveCSS("backdrop-filter", "blur(9px) saturate(1.18)");
  await capture("bookmark-select-light");
  await bookOptions.getByRole("option", { name: "设计 / 图标资源" }).click();
  await page.getByRole("button", { name: "导入所选" }).click();
  await expect(page.getByRole("status")).toContainText("新增 1 个，跳过 0 个，失败 0 个。");
  const state = await worker.evaluate(async () => JSON.parse((await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"]));
  assert.equal(state.sites.find(site => site.url === "https://example.net/capture-popup")?.note, "从原生扩展弹窗保存的备注");
  for (const url of ["https://example.net/capture-popup", "https://example.org/capture-bookmark"]) {
    assert.equal(state.sites.find(site => site.url === url)?.groupId, "capture-popup-child");
  }
  assert.equal(await worker.evaluate(async () => JSON.stringify(await chrome.bookmarks.getTree())), nativeTree);
  const managerOpened = context.waitForEvent("page");
  await page.getByRole("link", { name: "完整书签管理" }).click();
  const manager = await managerOpened;
  await expect(manager).toHaveURL(`${origin}/index.html?data=bookmarks`);
  await expect(manager.getByRole("button", { name: "浏览器书签", exact: true })).toHaveAttribute("aria-pressed", "true");
  await manager.close();

  await worker.evaluate(async () => {
    const key = "site-hub:v1";
    const state = JSON.parse((await chrome.storage.local.get(key))[key]);
    state.appearance.theme = "dark";
    await chrome.storage.local.set({ [key]: JSON.stringify(state) });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(quickTarget).toHaveText("设计 / 图标资源");
  await verifyFilledQuickCard();
  await capture("quick-dark");
  await bookmarks.click();
  await expect(bookTarget).toHaveText("设计 / 图标资源");
  await bookTarget.click();
  await expect(bookOptions).toBeVisible();
  await capture("bookmark-select-dark");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 431, height: 510 });
  await expect(shell).toHaveCSS("width", "431px");
  await expect(shell).toHaveCSS("height", "510px");
  await expect(page.getByRole("button", { name: "导入所选" })).toBeInViewport({ ratio: 1 });
  assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [0, 0]);
  await capture("bookmarks-dark-compact");
  await page.getByRole("button", { name: "快速收藏" }).click();
  await expect(page.getByRole("button", { name: "保存修改" })).toBeInViewport({ ratio: 1 });
  await capture("quick-dark-compact");
  await page.getByRole("button", { name: "新建分组" }).click();
  await page.getByRole("textbox", { name: "新分组名称" }).fill("紧凑弹窗验证");
  await page.getByRole("button", { name: "新建分组并添加" }).click();
  const compactAction = page.getByRole("button", { name: "确认新建并移动" });
  await compactAction.scrollIntoViewIfNeeded();
  await expect(compactAction).toBeInViewport({ ratio: 1 });
  assert.ok(await page.locator(".quick-page").evaluate(element => element.scrollTop > 0));
  assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [0, 0]);
  await capture("quick-dark-compact-expanded");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ version: manifest.version, nativeBookmarksAndStorage: true,
    activeTabFixture: true, nativeBookmarksUnchanged: true, screenshots, errors }));
} finally {
  await context.close();
}
