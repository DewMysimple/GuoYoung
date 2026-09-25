// Production startup and GitHub glass verification with synthetic local images.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const errors = [], results = [];
async function seedWallpaper(page, extension) {
  await page.evaluate(async extension => {
    const canvas = document.createElement("canvas");
    canvas.width = 960; canvas.height = 640;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 960, 640);
    gradient.addColorStop(0, "#2b698c"); gradient.addColorStop(1, "#bde6d5");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 960, 640);
    ctx.strokeStyle = "#e2ffff"; ctx.lineWidth = 4;
    for (let y = 0; y < 640; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(300, y - 80, 700, y + 80, 960, y); ctx.stroke(); }
    const blob = await new Promise(resolve => canvas.toBlob(blob => resolve(blob), "image/png"));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("site-hub-assets", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("wallpapers");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("wallpapers", "readwrite");
        tx.objectStore("wallpapers").put(blob, "startup-local");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    const key = "site-hub:v1";
    const state = JSON.parse(extension ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key));
    state.wallpaper = { ...state.wallpaper, source: "local", localAssetId: "startup-local", overlay: 0, glassTransparency: 88, glassBlur: 8, glassRefraction: true };
    if (extension) await chrome.storage.local.set({ [key]: JSON.stringify(state) });
    else localStorage.setItem(key, JSON.stringify(state));
  }, extension);
}
async function verify(page, url, name, extension = false) {
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  await seedWallpaper(page, extension);
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:wallpaper-startup:v1") || "null")?.key)).toBe("local:startup-local");
  await page.addInitScript(({ extension }) => {
    window.startupFrames = [];
    window.startupDone = false;
    const started = performance.now();
    let readyFrames = 0;
    function sample() {
      const shell = document.querySelector("[data-app-shell]");
      const search = document.querySelector(".workspace-intro");
      window.startupFrames.push({ time: performance.now(), preview: !!document.querySelector("#wallpaper-startup img"), collection: !!shell, wallpaper: !!shell?.classList.contains("has-wallpaper"), loader: !!document.querySelector(".app-loading, .loading-mark"), cards: document.querySelectorAll(".site-card").length, searchOpacity: search ? getComputedStyle(search).opacity : null });
      if (shell) readyFrames++;
      if (readyFrames < 12 && performance.now() - started < 8000) requestAnimationFrame(sample);
      else window.startupDone = true;
    }
    requestAnimationFrame(sample);
    if (extension) {
      const get = chrome.storage.local.get.bind(chrome.storage.local);
      chrome.storage.local.get = async (...args) => { await new Promise(resolve => setTimeout(resolve, 1500)); return get(...args); };
    }
  }, { extension });
  let release;
  if (!extension) {
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/assets/index-*.js", async route => { await gate; await route.continue(); });
  }
  try {
    await page.reload({ waitUntil: "commit" });
    await expect(page.locator("#wallpaper-startup img")).toBeVisible();
    await expect.poll(() => page.locator("#wallpaper-startup img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    assert.equal((await page.locator("#wallpaper-startup").boundingBox()).x, 0, "Startup wallpaper must reach the left viewport edge");
    await page.screenshot({ path: join(output, `${name}-before-app.png`) });
  } finally { release?.(); }
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  await expect(page.locator("#wallpaper-startup")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.startupDone)).toBe(true);
  const frames = await page.evaluate(() => window.startupFrames);
  assert.ok(frames.some(frame => frame.preview));
  assert.ok(frames.every(frame => !frame.collection || frame.wallpaper), "No collection frame may precede wallpaper");
  assert.ok(frames.every(frame => !frame.loader && (!frame.collection || frame.cards > 0)), "No animated loader or empty collection stage");
  assert.ok(frames.every(frame => !frame.collection || frame.searchOpacity === "1"), "The search field must paint at its final opacity");
  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  await page.getByRole("button", { name: "管理 GitHub 官方主页" }).click();
  await expect.poll(() => page.locator(".github-home-entry").evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toContain("wallpaper-glass-lens");
  await page.screenshot({ path: join(output, `${name}-github-light.png`), animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".github-home-entry")).toHaveCSS("color", "rgb(232, 236, 243)");
  await page.screenshot({ path: join(output, `${name}-github-dark.png`), animations: "disabled" });
  results.push({ name, frames });
}
const browser = await chromium.launch({ channel: "chrome", ignoreDefaultArgs: ["--hide-scrollbars"] });
try {
  for (const spec of [{ name: "desktop", width: 1920, height: 1080 }]) {
    const context = await browser.newContext({ viewport: spec, colorScheme: "light" });
    await verify(await context.newPage(), process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4174", `startup-production-${spec.name}`);
    await context.close();
  }
} finally { await browser.close(); }
const extension = resolve("dist-extension");
const profile = await mkdtemp(join(tmpdir(), "mysimple-startup-check-"));
const options = {
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : { channel: "chromium" }),
  headless: true, viewport: { width: 1440, height: 1000 }, colorScheme: "light",
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
};
let context = await chromium.launchPersistentContext(profile, options);
let url;
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  url = `chrome-extension://${new URL(worker.url()).host}/index.html`;
  await verify(await context.newPage(), url, "startup-production-extension", true);
} finally { await context.close(); }
// Close/relaunch the actual browser, preserving only this synthetic profile.
context = await chromium.launchPersistentContext(profile, options);
try {
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.restartFrames = [];
    let ready = 0;
    const started = performance.now();
    function sample() {
      const shell = document.querySelector("[data-app-shell]");
      window.restartFrames.push({ time: performance.now(), collection: !!shell, wallpaper: !!shell?.classList.contains("has-wallpaper"), loader: !!document.querySelector(".app-loading, .loading-mark") });
      if (shell) ready++;
      if (ready < 12 && performance.now() - started < 8000) requestAnimationFrame(sample);
      else window.restartDone = true;
    }
    requestAnimationFrame(sample);
  });
  await page.goto(url);
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:wallpaper-startup:v1")).key), "local:startup-local");
  assert.equal(await page.evaluate(() => chrome.runtime.getManifest().version), manifest.version);
  await page.screenshot({ path: join(output, "startup-production-extension-restarted.png") });
  await expect.poll(() => page.evaluate(() => window.restartDone)).toBe(true);
  const frames = await page.evaluate(() => window.restartFrames);
  assert.ok(frames.some(frame => frame.collection));
  assert.ok(frames.every(frame => !frame.loader && (!frame.collection || frame.wallpaper)));
  results.push({ name: "native-browser-restart", frames });
} finally { await context.close(); }
assert.deepEqual(errors, []);
await writeFile(join(output, "wallpaper-startup-metrics.json"), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ cases: results.length, screenshots: 7, errors }, null, 2));
