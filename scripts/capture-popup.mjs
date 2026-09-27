// Capture the built popup in a fresh MV3 profile with the real bookmarks API.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const extension = resolve("dist-extension");
const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "mysimple-popup-check-"));
const errors = [];
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  viewport: { width: 440, height: 600 },
  colorScheme: "light",
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const origin = `chrome-extension://${new URL(worker.url()).host}`;
  await worker.evaluate(async () => {
    const tree = await chrome.bookmarks.getTree();
    const bar = tree[0].children[0];
    const folder = await chrome.bookmarks.create({ parentId: bar.id, title: "参考资料" });
    const sites = await Promise.all([
      chrome.bookmarks.create({ parentId: folder.id, title: "示例文档", url: "https://example.org/docs" }),
      chrome.bookmarks.create({ parentId: folder.id, title: "开发者工具", url: "https://developer.mozilla.org/" }),
      chrome.bookmarks.create({ parentId: folder.id, title: "设计资源", url: "https://www.figma.com/" }),
      chrome.bookmarks.create({ parentId: folder.id, title: "阅读清单", url: "https://www.notion.so/" }),
    ]);
    return { folderId: folder.id, siteIds: sites.map((site) => site.id) };
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const tabsApi = window.chrome?.tabs;
    if (!tabsApi) return;
    const sampleIcon = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Crect%20width='64'%20height='64'%20rx='14'%20fill='%234f7fe8'/%3E%3Cpath%20d='M22%2015v34M24%2032l20-17M24%2032l20%2017'%20stroke='white'%20stroke-width='6'%20stroke-linecap='round'/%3E%3C/svg%3E";
    Object.defineProperty(tabsApi, "query", {
      configurable: true,
      value: async () => [{
        id: 42,
        title: "目标网站示例",
        url: "https://example.org/docs",
        favIconUrl: sampleIcon,
      }],
    });
  });
  await page.goto(`${origin}/popup.html`);
  await expect(page.getByRole("button", { name: "浏览器书签" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "网站名称" })).toHaveValue("目标网站示例");
  await expect(page.locator(".popup-target-icon img")).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(page.getByRole("radiogroup", { name: "添加到分组" })).toBeVisible();
  await expect(page.locator(".popup-group-option").first()).toBeEnabled();
  const quickPopupSize = await page.locator(".popup-shell").evaluate((popup) => {
    const bounds = popup.getBoundingClientRect();
    return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  });
  assert.deepEqual(quickPopupSize, { width: 440, height: 600 }, "The quick-add tab should use the shared popup size");
  const quickLayout = await page.locator(".quick-page").evaluate((quickPage) => {
    const pageBounds = quickPage.getBoundingClientRect();
    const cardBounds = quickPage.querySelector(".popup-form-card").getBoundingClientRect();
    const groupOptions = quickPage.querySelector(".popup-group-options");
    return {
      topGap: cardBounds.top - pageBounds.top,
      bottomGap: pageBounds.bottom - cardBounds.bottom,
      groupHeight: groupOptions.getBoundingClientRect().height,
      groupScrollHeight: groupOptions.scrollHeight,
    };
  });
  assert.ok(quickLayout.topGap <= 1, "The quick-add card should begin at the top of the available page area");
  assert.ok(quickLayout.bottomGap >= 15 && quickLayout.bottomGap <= 17,
    "The quick-add card should use the available height and leave only page padding below it");
  assert.ok(quickLayout.groupHeight > 190, "The group picker should expand beyond its previous fixed height");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-quick-light.png"), animations: "disabled" });
  await page.getByRole("button", { name: "浏览器书签" }).click();
  const bookmarksPopupSize = await page.locator(".popup-shell").evaluate((popup) => {
    const bounds = popup.getBoundingClientRect();
    return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  });
  assert.deepEqual(bookmarksPopupSize, quickPopupSize, "The popup frame should not resize when changing tabs");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmarks-overview-light.png"), animations: "disabled" });
  await page.getByRole("button", { name: "默认分组" }).click();
  const lightGroupMenu = page.getByRole("listbox", { name: "默认分组" });
  await expect(lightGroupMenu).toBeVisible();
  assert.equal(await lightGroupMenu.evaluate((menu) => {
    const bounds = menu.getBoundingClientRect();
    const popup = document.querySelector(".popup-shell");
    if (!popup) return false;
    const popupBounds = popup.getBoundingClientRect();
    return bounds.top >= popupBounds.top && bounds.bottom <= popupBounds.bottom;
  }), true, "The bookmark destination menu stays inside the popup");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmark-select-light.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  const folderCardSize = await page.locator(".bookmark-tile.is-folder").first().evaluate((card) => {
    const bounds = card.getBoundingClientRect();
    return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  });
  assert.deepEqual(folderCardSize, { width: 87, height: 76 }, "Bookmark cards should form a compact four-column grid");
  assert.equal(await page.locator(".bookmark-tile.is-folder").first().evaluate((card) => getComputedStyle(card).borderTopStyle), "solid",
    "Folder bookmark tiles should have a visible card border");
  assert.notEqual(await page.locator(".bookmark-tile.is-folder").first().evaluate((card) => getComputedStyle(card).backgroundColor), "rgba(0, 0, 0, 0)",
    "Folder bookmark tiles should have a card surface");
  const folderFooterCenters = await page.locator(".bookmark-tile.is-folder .bookmark-tile-footer").first().evaluate((footer) => {
    const name = footer.querySelector(".bookmark-tile-name").getBoundingClientRect();
    const caret = footer.querySelector(".bookmark-tile-caret").getBoundingClientRect();
    return Math.abs((name.top + name.height / 2) - (caret.top + caret.height / 2));
  });
  assert.ok(folderFooterCenters < 1, "Bookmark folder name and caret should share a row");
  const folderIcon = page.locator(".bookmark-tile.is-folder .bookmark-kind").first();
  assert.equal(await folderIcon.evaluate((icon) => icon.getBoundingClientRect().width), 30,
    "Bookmark folder icon tiles should be reduced by more than 50% from the previous 64px size");
  assert.equal(await folderIcon.locator("svg").getAttribute("width"), "16",
    "Bookmark folder glyphs should be reduced by more than 50% from the previous 34px size");
  await page.getByRole("button", { name: /打开书签文件夹/ }).first().click();
  await page.getByRole("button", { name: "打开书签文件夹 参考资料" }).click();
  await expect(page.getByText("示例文档")).toBeVisible();
  assert.deepEqual(await page.locator('[data-bookmark-kind="site"]').first().evaluate((card) => {
    const bounds = card.getBoundingClientRect();
    return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  }), { width: 87, height: 76 },
    "Website bookmark cards should use the same four-column tile size");
  const firstRowY = await page.locator('[data-bookmark-kind="site"]').evaluateAll((cards) =>
    cards.slice(0, 4).map((card) => Math.round(card.getBoundingClientRect().top)),
  );
  assert.equal(new Set(firstRowY).size, 1, "The first four bookmark cards should share one row");
  assert.equal(await page.locator('[data-bookmark-kind="site"]').first().evaluate((card) => getComputedStyle(card).borderTopStyle), "solid",
    "Website bookmark tiles should share the folder card frame");
  assert.notEqual(await page.locator('[data-bookmark-kind="site"]').first().evaluate((card) => getComputedStyle(card).backgroundColor), "rgba(0, 0, 0, 0)",
    "Website bookmark tiles should have a card surface");
  const favicon = page.locator('[data-bookmark-kind="site"] .favicon-frame img').first();
  assert.match(await favicon.getAttribute("src"), /_favicon\/\?pageUrl=/,
    "Bookmark website cards should use Chromium's original favicon service");
  assert.equal(await favicon.evaluate((image) => image.parentElement.getBoundingClientRect().width), 30,
    "Bookmark website favicon tiles should be reduced by more than 50% from the previous 64px size");
  await expect(favicon).toHaveClass(/is-loaded/);
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmarks-light.png"), animations: "disabled" });

  await page.getByRole("textbox", { name: "搜索书签或网址" }).fill("示例文档");
  await page.getByRole("checkbox", { name: "选择 示例文档" }).check();
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByRole("alertdialog", { name: "删除浏览器原生书签？" }))
    .toContainText("1 个网站和 0 个文件夹");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: /添加到主页/ }).click();
  await expect(page.getByRole("status")).toContainText("新增 1 个");
  const saved = await page.evaluate(async () => JSON.parse((await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"]));
  const imported = saved.sites.find((site) => site.url === "https://example.org/docs");
  assert.ok(imported, "The selected bookmark should be imported");
  assert.equal(saved.groups.find((group) => group.id === imported.groupId)?.icon, "stack");

  await page.evaluate(async () => {
    const key = "site-hub:v1";
    const state = JSON.parse((await chrome.storage.local.get(key))[key]);
    state.appearance.theme = "dark";
    await chrome.storage.local.set({ [key]: JSON.stringify(state) });
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkGroupLayout = await page.locator(".popup-group-options").evaluate((options) => ({
    height: options.clientHeight,
    scrollHeight: options.scrollHeight,
    count: options.querySelectorAll(".popup-group-option").length,
  }));
  assert.ok(darkGroupLayout.count > 0 && darkGroupLayout.scrollHeight <= darkGroupLayout.height,
    "All group choices should fit in the expanded dark-theme group area");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-quick-dark.png"), animations: "disabled" });
  await page.getByRole("button", { name: "浏览器书签" }).click();
  await page.getByRole("button", { name: "默认分组" }).click();
  await expect(page.getByRole("listbox", { name: "默认分组" })).toBeVisible();
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmark-select-dark.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmarks-overview-dark.png"), animations: "disabled" });
  await page.getByRole("button", { name: /打开书签文件夹/ }).first().click();
  await page.getByRole("button", { name: "打开书签文件夹 参考资料" }).click();
  await expect(page.locator('[data-bookmark-kind="site"] .favicon-frame img').first()).toHaveClass(/is-loaded/);
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmarks-dark.png"), animations: "disabled" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ version: manifest.version, quickTargetIdentity: true, inlineGroups: true, quickCardUsesAvailableHeight: true, visibleGroupHeight: Math.round(quickLayout.groupHeight), groupScrollHeight: quickLayout.groupScrollHeight, darkVisibleGroups: darkGroupLayout.count, darkGroupHeight: darkGroupLayout.height, darkGroupScrollHeight: darkGroupLayout.scrollHeight, bookmarkGridColumns: 4, bookmarkIconTileSize: 30, bookmarkFolderGlyphSize: 16, bookmarkNavigation: "drilldown", errors, screenshots: 8 }));
} finally {
  await context.close();
}
