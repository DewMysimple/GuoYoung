// Production webpage and native MV3 data-transfer acceptance, synthetic data only.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const errors = [], captures = [];
const sample = { format: "site-hub-group-export", exportVersion: 1,
  group: { name: "设计灵感与工具", icon: "pen-nib" }, sites: [
    { name: "设计资料", url: "https://design.example/", order: 0 },
    { name: "阅读清单", url: "https://reading.example/", order: 1 },
    { name: "Google", url: "https://www.google.com/", order: 2 },
  ] };
async function capture(page, name) {
  await page.evaluate(() => { window.scrollTo(0, 0); return document.fonts.ready; });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflows`);
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true, animations: "disabled" });
  captures.push(name);
}
async function inspect(context, url, extension, prefix) {
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://data-visual.example/wallpaper.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#b0cfb8"/><stop offset=".45" stop-color="#728d93"/><stop offset="1" stop-color="#253c59"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1920v1080H0z"/><circle cx="1550" cy="700" r="550" fill="#709197" opacity=".5"/></svg>' }));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "打开数据" })).toBeVisible();
  for (const theme of ["light", "dark", "wallpaper"]) {
    await page.evaluate(async ({ extension, theme }) => {
      const key = "site-hub:v1";
      const raw = extension ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key);
      const state = JSON.parse(raw);
      state.appearance.theme = theme === "dark" ? "dark" : "light";
      state.wallpaper = { ...state.wallpaper, source: theme === "wallpaper" ? "url" : "none", url: "https://data-visual.example/wallpaper.svg" };
      if (extension) await chrome.storage.local.set({ [key]: JSON.stringify(state) });
      else localStorage.setItem(key, JSON.stringify(state));
    }, { extension, theme });
    await page.reload();
    await page.getByRole("button", { name: "打开数据" }).click();
    await capture(page, `${prefix}-data-${theme}-empty`);
    await page.getByLabel("选择要导入的数据文件").setInputFiles({ name: "设计灵感.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(sample)) });
    await expect(page.getByRole("button", { name: "预览并导入" })).toBeEnabled();
    await capture(page, `${prefix}-data-${theme}-import`);
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByRole("button", { name: /指定分组/ }).click();
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await capture(page, `${prefix}-data-${theme}-export`);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出 JSON" }).click();
    const download = await pending;
    const payload = JSON.parse(await readFile((await download.path()), "utf8"));
    assert.equal(payload.format, "site-hub-groups-export");
    assert.equal(payload.groups.length, 2);
  }
  await page.getByRole("button", { name: "导入", exact: true }).click();
  await page.getByRole("button", { name: "预览并导入" }).click();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "已导入 2 个网站" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "打开 设计资料" })).toBeVisible();
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("tab", { name: /数据/ }).click();
  await capture(page, `${prefix}-data-settings`);
  await page.getByRole("dialog", { name: "设置", exact: true }).getByRole("button", { name: "导出", exact: true }).click();
  await expect(page.getByRole("region", { name: "数据页面" })).toBeVisible();
  await page.getByRole("button", { name: "返回收藏" }).click();
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  await capture(page, `${prefix}-data-group-manager`);
  await page.getByRole("button", { name: "导入资源" }).click();
  await page.getByLabel("选择要导入的数据文件").setInputFiles({ name: "设计灵感.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(sample)) });
  await expect(page.getByRole("button", { name: "导入方式", exact: true })).toHaveText("追加到已有分组");
  await capture(page, `${prefix}-data-existing-group`);
  await page.close();
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try { const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await inspect(context, process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4175", false, "web");
} finally { await browser.close(); }
const extension = resolve("dist-extension");
const profile = await mkdtemp(join(tmpdir(), "mysimple-data-check-"));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : { channel: "chromium" }),
  headless: true, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await inspect(context, `chrome-extension://${new URL(worker.url()).host}/index.html`, true, "extension");
} finally { await context.close(); }
assert.deepEqual(errors, []);
await writeFile(join(output, "data-workspace-report.json"), JSON.stringify({ captures, errors }, null, 2));
console.log(JSON.stringify({ screenshots: captures.length, errors }));
