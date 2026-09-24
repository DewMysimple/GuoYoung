// Windows native permission smoke test. Requires the bundled Playwright Chromium
// and a production dist-extension build; no API mocks or personal browser profile.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

if (process.platform !== "win32") throw new Error("Native permission dialog verification requires Windows UI Automation.");
const extension = resolve("dist-extension");
const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"));
assert.ok(manifest.optional_permissions.includes("history"));
assert.ok(!manifest.permissions.includes("history"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
// Keep locked Chromium files outside Vite's watched project directory.
const profile = await mkdtemp(join(tmpdir(), "mysimple-history-test-"));
const errors = [];
const options = { channel: "chromium", headless: false, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
    "--window-position=-20000,-20000", "--force-renderer-accessibility"] };
let context;
let extensionUrl;
async function launch() {
  context = await chromium.launchPersistentContext(profile, options);
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  extensionUrl = `chrome-extension://${new URL(worker.url()).host}/index.html`;
}
async function open() {
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(extensionUrl);
  await expect(page.getByRole("button", { name: "打开历史记录" })).toBeVisible();
  return page;
}
function permissionDialog(action) {
  console.log(execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    resolve("scripts/verify-native-history-dialog.ps1"), "-ProfilePath", profile, "-Action", action],
  { encoding: "utf8", windowsHide: true, timeout: 15000 }).trim());
}
const hasPermission = page => page.evaluate(() => chrome.permissions.contains({ permissions: ["history"] }));
const summary = page => page.locator(".history-summary");
try {
  await launch();
  const browserVersion = context.browser().version();
  const page = await open();
  assert.equal(await hasPermission(page), false);
  await page.getByRole("button", { name: "打开历史记录" }).click();
  permissionDialog("deny");
  const authorize = page.getByRole("button", { name: "允许读取历史记录" });
  await expect(authorize).toBeEnabled();
  assert.equal(await hasPermission(page), false);
  await page.screenshot({ path: join(output, "native-history-denied.png") });
  await authorize.click();
  permissionDialog("allow");
  await expect.poll(() => hasPermission(page)).toBe(true);
  await expect(summary(page)).toBeVisible();

  await page.evaluate(async () => {
    for (let index = 0; index < 125; index++) {
      await chrome.history.addUrl({ url: `https://history-check.example.com/${index}` });
    }
  });
  // A fresh Chromium can add its own startup page; scope counts to our fixture.
  await page.getByRole("searchbox", { name: "搜索浏览历史" }).fill("history-check.example.com");
  await expect(summary(page)).toHaveText("1 个网站 · 125 个网页");
  assert.equal(await page.evaluate(async () => (await chrome.history.search({ text: "history-check", startTime: 0, maxResults: 0 })).length), 125);
  await page.getByRole("searchbox", { name: "搜索浏览历史" }).fill("history-check.example.com/12");
  await expect(summary(page)).toHaveText("1 个网站 · 1 个网页");
  await page.getByRole("button", { name: "清空历史搜索" }).click();
  await expect(page.getByRole("searchbox", { name: "搜索浏览历史" })).toHaveValue("");
  await page.getByRole("searchbox", { name: "搜索浏览历史" }).fill("history-check.example.com");
  await expect(summary(page)).toHaveText("1 个网站 · 125 个网页");
  await page.locator(".history-site-open").click();
  await expect(page.locator(".history-url-card")).toHaveCount(125);
  const first = page.locator(".history-url-card").first();
  const deletedUrl = await first.locator(".history-url-link").getAttribute("href");
  await first.hover();
  await first.getByRole("button", { name: /^删除历史记录/ }).click();
  await expect(page.locator(".history-url-card")).toHaveCount(124);
  assert.equal(await page.evaluate(async url => (await chrome.history.search({ text: "", startTime: 0, maxResults: 0 })).some(item => item.url === url), deletedUrl), false);
  await page.screenshot({ path: join(output, "native-history-details.png") });
  await page.getByRole("button", { name: "返回历史记录", exact: true }).click();

  assert.equal(await page.evaluate(() => chrome.permissions.remove({ permissions: ["history"] })), true);
  await expect(authorize).toBeVisible();
  await expect(page.locator(".history-site-card")).toHaveCount(0);
  await page.screenshot({ path: join(output, "native-history-revoked.png") });
  // Chrome remembers a prior explicit grant; re-request after remove needs no dialog.
  await authorize.click();
  await expect(summary(page)).toHaveText("1 个网站 · 124 个网页");
  const second = await open();
  await second.getByRole("button", { name: "打开历史记录" }).click();
  await second.getByRole("searchbox", { name: "搜索浏览历史" }).fill("history-check.example.com");
  await expect(summary(second)).toHaveText("1 个网站 · 124 个网页");
  await second.evaluate(() => chrome.history.addUrl({ url: "https://history-check.example.com/live" }));
  await expect(summary(page)).toHaveText("1 个网站 · 125 个网页");
  await expect(summary(second)).toHaveText("1 个网站 · 125 个网页");
  await page.reload();
  await page.getByRole("button", { name: "打开历史记录" }).click();
  await page.getByRole("searchbox", { name: "搜索浏览历史" }).fill("history-check.example.com");
  await expect(summary(page)).toHaveText("1 个网站 · 125 个网页");
  await page.screenshot({ path: join(output, "native-history-restored.png") });
  await context.close();
  await launch();
  const restarted = await open();
  assert.equal(await hasPermission(restarted), true);
  await restarted.getByRole("button", { name: "打开历史记录" }).click();
  await restarted.getByRole("searchbox", { name: "搜索浏览历史" }).fill("history-check.example.com");
  await expect(summary(restarted)).toHaveText("1 个网站 · 125 个网页");
  assert.deepEqual(errors, []);
  const report = { version: manifest.version, browserVersion, permission: "native deny / allow / remove / regrant / restart passed",
    data: "125 URLs, search, URL deletion, two live views, reload and browser restart passed", errors };
  await writeFile(join(output, "../native-history-result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await context?.close(); }
