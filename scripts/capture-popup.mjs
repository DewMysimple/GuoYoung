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
    await chrome.bookmarks.create({ parentId: folder.id, title: "示例文档", url: "https://example.org/docs" });
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/popup.html`);
  await expect(page.getByRole("button", { name: "浏览器书签" })).toBeVisible();
  await page.screenshot({ path: join(output, "popup-production-quick-light.png"), animations: "disabled" });
  await page.getByRole("button", { name: "浏览器书签" }).click();
  await page.getByRole("button", { name: "展开 参考资料" }).click();
  await expect(page.getByText("示例文档")).toBeVisible();
  await page.screenshot({ path: join(output, "popup-production-bookmarks-light.png"), animations: "disabled" });

  await page.getByRole("textbox", { name: "搜索书签或网址" }).fill("示例文档");
  await page.getByRole("checkbox", { name: "选择 参考资料" }).check();
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
  await page.screenshot({ path: join(output, "popup-production-quick-dark.png"), animations: "disabled" });
  await page.getByRole("button", { name: "浏览器书签" }).click();
  await page.getByRole("button", { name: "展开 参考资料" }).click();
  await page.screenshot({ path: join(output, "popup-production-bookmarks-dark.png"), animations: "disabled" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ version: manifest.version, importedGroupIcon: "stack", errors, screenshots: 4 }));
} finally {
  await context.close();
}
