// Desktop production material inspection with synthetic wallpaper and collections.
// Uses the same scenarios for a web build and an isolated native MV3 extension.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const errors = [], metrics = [];

async function seed(page, extension) {
  await page.evaluate(async extension => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600; canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#faedf3"; ctx.fillRect(0, 0, 1600, 1000);
    ctx.fillStyle = "#ea429e";
    for (let x = -30; x < 1640; x += 44) {
      const y = 600 + Math.sin(x / 155) * 140;
      ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill();
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("site-hub-assets", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("wallpapers");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("wallpapers", "readwrite");
        tx.objectStore("wallpapers").put(blob, "material-check");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
    const key = "site-hub:v1";
    const state = JSON.parse(extension ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key));
    state.wallpaper = { ...state.wallpaper, source: "local", localAssetId: "material-check", overlay: 0 };
    state.displayModeByWorkspace.main = "grouped";
    const originals = state.sites;
    state.sites = Array.from({ length: 48 }, (_, index) => ({ ...originals[index % originals.length],
      id: `material-${index}`, order: index, globalOrder: index, iconSource: "brand" }));
    if (extension) await chrome.storage.local.set({ [key]: JSON.stringify(state) });
    else localStorage.setItem(key, JSON.stringify(state));
  }, extension);
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  await page.evaluate(() => document.fonts.ready);
}

async function capture(page, name) {
  // Allow backdrop layers to repaint after scrolling or closing the drawer.
  await page.waitForTimeout(300);
  const metric = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    tool: getComputedStyle(document.querySelector(".compact-icon-button")).backdropFilter,
    footer: getComputedStyle(document.querySelector(".footer > span")).backgroundColor,
    overlay: getComputedStyle(document.documentElement).getPropertyValue("--wallpaper-overlay").trim(),
  }));
  assert.equal(metric.overflow, false);
  assert.equal(metric.footer, "rgba(0, 0, 0, 0)");
  assert.match(metric.tool, /blur\(12px\)/);
  metrics.push({ name, ...metric });
  await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
}

async function inspect(page, url, mode, extension = false) {
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  await seed(page, extension);
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    // Deliberately bright wallpaper: also retain the unshaded stress case,
    // then verify readability using the existing user-controlled shade.
    if (theme === "dark") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await capture(page, `materials-${mode}-dark-unshaded`);
      await page.getByRole("button", { name: "打开设置" }).click();
      const panel = page.getByRole("dialog", { name: "设置", exact: true });
      await panel.getByRole("tab", { name: /壁纸/ }).click();
      await panel.getByRole("slider", { name: "明暗遮罩" }).fill("70");
      await panel.getByRole("button", { name: "保存设置" }).click();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator(".site-card").first().hover();
    await capture(page, `materials-${mode}-${theme}-grouped`);
    await page.getByRole("button", { name: "显示", exact: true }).click();
    await capture(page, `materials-${mode}-${theme}-menu`);
    await page.getByRole("button", { name: "显示", exact: true }).click();
    await page.getByRole("button", { name: "管理分组", exact: true }).click();
    await capture(page, `materials-${mode}-${theme}-manager`);
    await page.getByRole("dialog", { name: "管理分组", exact: true }).getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "打开设置" }).click();
    await capture(page, `materials-${mode}-${theme}-settings`);
    const panel = page.getByRole("dialog", { name: "设置", exact: true });
    await panel.getByRole("tab", { name: /壁纸/ }).click();
    await panel.getByRole("region", { name: "玻璃外观", exact: true }).scrollIntoViewIfNeeded();
    await capture(page, `materials-${mode}-${theme}-controls`);
    await panel.getByRole("button", { name: "取消", exact: true }).click();
    await page.locator(".footer").scrollIntoViewIfNeeded();
    await capture(page, `materials-${mode}-${theme}-footer`);
  }
}

const browser = await chromium.launch({ channel: "chrome", ignoreDefaultArgs: ["--hide-scrollbars"] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, colorScheme: "light" });
  await inspect(page, process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4174", "web");
} finally { await browser.close(); }

const extension = resolve("dist-extension");
const profile = await mkdtemp(join(tmpdir(), "mysimple-materials-"));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : { channel: "chromium" }),
  headless: true, viewport: { width: 1440, height: 1000 }, colorScheme: "light",
  ignoreDefaultArgs: ["--hide-scrollbars"],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const page = await context.newPage();
  await inspect(page, `chrome-extension://${new URL(worker.url()).host}/index.html`, "extension", true);
  assert.equal(await page.evaluate(() => chrome.runtime.getManifest().version), manifest.version);
} finally { await context.close(); }
assert.deepEqual(errors, []);
await writeFile(join(output, "materials-metrics.json"), JSON.stringify({ metrics, errors }, null, 2));
console.log(JSON.stringify({ screenshots: metrics.length, errors }));
