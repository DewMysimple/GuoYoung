import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, "public/manifest.json"), "utf8"));
const screenshotDirectory = join(root, "artifacts/releases", `v${manifest.version}`, "screenshots");
const baseURL = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4173";
await mkdir(screenshotDirectory, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const pageErrors = [];
const consoleErrors = [];

async function openPage(options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "全部网站", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // Favicon resolution is asynchronous; allow bundled/native icons to settle.
  await expect(page.getByTestId("site-card-github").locator(".favicon-letter")).toHaveCount(0, { timeout: 15000 });
  return { context, page };
}

async function capture(page, name) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    title: document.title,
  }));
  assert.ok(metrics.scrollWidth <= metrics.clientWidth, `${name}: horizontal overflow`);
  await page.screenshot({ path: join(screenshotDirectory, `${name}.png`), fullPage: true, animations: "disabled" });
  console.log(name, JSON.stringify(metrics));
}

try {
  for (const spec of [
    { name: "desktop-light", width: 1440, height: 1100, dark: false },
    { name: "desktop-dark", width: 1440, height: 1100, dark: true },
    { name: "mobile-light", width: 390, height: 844, dark: false },
  ]) {
    const { context, page } = await openPage({
      viewport: { width: spec.width, height: spec.height },
      colorScheme: spec.dark ? "dark" : "light",
    });
    await capture(page, spec.name);
    await context.close();
  }

  const { context, page } = await openPage({
    viewport: { width: 920, height: 820 }, colorScheme: "light",
  });
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const groupDialog = page.getByRole("dialog", { name: "管理分组", exact: true });
  await expect(groupDialog).toBeVisible();
  await capture(page, "group-dialog");
  await groupDialog.getByRole("button", { name: "返回收藏主页" }).click();

  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(page.getByRole("button", { name: "返回收藏主页" })).toBeVisible();
  await capture(page, "settings-panel");
  await page.getByRole("button", { name: "返回收藏主页" }).click();

  await page.getByRole("button", { name: "新建分组", exact: true }).click();
  const newGroupDialog = page.getByRole("dialog", { name: "新建分组", exact: true });
  await expect(newGroupDialog).toBeVisible();
  await capture(page, "new-group-dialog");
  await newGroupDialog.getByRole("button", { name: "返回收藏主页" }).click();

  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByRole("menuitem", { name: /添加网站/ }).click();
  await page.getByLabel("网站地址").fill("example.com");
  await capture(page, "site-dialog");
  await context.close();

  // Remote favicon failures are diagnostic; uncaught application errors fail the run.
  console.log("CONSOLE_ERRORS", JSON.stringify([...new Set(consoleErrors)]));
  assert.deepEqual(pageErrors, [], "Uncaught browser errors");
} finally {
  await browser.close();
}
