// Verify the shared homepage selector against the production web build.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const manifest = JSON.parse(await readFile(resolve("public/manifest.json"), "utf8"));
const screenshotDirectory = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
const baseURL = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4173";
await mkdir(screenshotDirectory, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const pageErrors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "全部网站", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await page.getByRole("button", { name: "显示", exact: true }).click();
  const displayMenu = page.getByRole("menu", { name: "显示方式" });
  await expect(displayMenu).toBeVisible();
  await expect(displayMenu).toHaveCSS("border-radius", "13px");
  await expect(displayMenu).toHaveCSS("backdrop-filter", /blur/);
  const bounds = await displayMenu.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(bounds && viewport && bounds.x >= 0 && bounds.y >= 0
    && bounds.x + bounds.width <= viewport.width
    && bounds.y + bounds.height <= viewport.height,
  "The production display menu stays inside the viewport");
  await page.screenshot({
    path: join(screenshotDirectory, "homepage-display-menu-light.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(displayMenu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "显示", exact: true })).toBeFocused();
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ version: manifest.version, screenshot: "homepage-display-menu-light.png", pageErrors }));
  await context.close();
} finally {
  await browser.close();
}
