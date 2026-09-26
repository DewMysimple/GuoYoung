// Production visual checks. Run against `vite preview`; includes a real MV3
// extension in an isolated temporary Chromium profile, with synthetic data only.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const wallpaper = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1100"><defs><linearGradient id="sea" x2="1" y2="1"><stop stop-color="#3a799a"/><stop offset=".5" stop-color="#b5d9cc"/><stop offset="1" stop-color="#2e577c"/></linearGradient><pattern id="wave" width="170" height="96" patternUnits="userSpaceOnUse"><path d="M-40 32Q20 2 80 32T210 32M-45 68Q25 32 90 68T215 68" stroke="#eafff7" stroke-opacity=".6" stroke-width="3" fill="none"/></pattern></defs><path d="M0 0h1920v1100H0z" fill="url(#sea)"/><path d="M0 0h1920v1100H0z" fill="url(#wave)"/></svg>`;
const errors = [];
const metrics = [];

async function prepare(page, url, extension = false) {
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://glass-check.example/sea.svg", route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  await page.evaluate(async ({ extension }) => {
    const key = "site-hub:v1";
    const raw = extension ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key);
    const state = JSON.parse(raw);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://glass-check.example/sea.svg", overlay: 0,
      glassTransparency: 86, glassBlur: 2, glassRefraction: false };
    const originals = state.sites;
    const sourceGroupId = originals[0]?.groupId;
    state.displayModeByWorkspace = { ...state.displayModeByWorkspace, main: "grouped" };
    state.sites = Array.from({ length: 48 }, (_, index) => ({ ...originals[index % originals.length],
      id: `visual-${index}`, groupId: sourceGroupId, order: index, globalOrder: index, iconSource: "brand" }));
    state.sites[0] = { ...state.sites[0], id: "visual-bilibili", name: "哔哩哔哩", url: "https://www.bilibili.com" };
    state.sites[1] = { ...state.sites[1], id: "visual-xiaohongshu", name: "小红书", url: "https://www.xiaohongshu.com" };
    if (extension) await chrome.storage.local.set({ [key]: JSON.stringify(state) });
    else localStorage.setItem(key, JSON.stringify(state));
  }, { extension });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  await page.evaluate(() => document.fonts.ready);
}

async function capture(page, name) {
  const geometry = await page.evaluate(() => {
    const box = document.querySelector(".search-input").getBoundingClientRect();
    return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
      left: document.querySelector(".app-shell").getBoundingClientRect().left,
      searchCenter: box.x + box.width / 2,
      backdrop: getComputedStyle(document.querySelector(".site-card")).backdropFilter };
  });
  assert.equal(geometry.overflow, false, name);
  assert.equal(geometry.left, 0, name);
  metrics.push({ name, ...geometry });
  await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
}

async function settings(page) {
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  return panel;
}

const browser = await chromium.launch({ channel: "chrome", ignoreDefaultArgs: ["--hide-scrollbars"] });
try {
  for (const spec of [{ name: "desktop", width: 1920, height: 1080 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: spec, colorScheme: "light" });
    const page = await context.newPage();
    await prepare(page, process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4174");
    await capture(page, `glass-production-${spec.name}-off`);
    const card = page.locator(".site-card").first();
    const off = await card.screenshot({ animations: "disabled" });
    const panel = await settings(page);
    await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).click();
    await panel.locator("summary").filter({ hasText: /^玻璃参数微调/ }).click();
    await panel.getByRole("checkbox", { name: /玻璃折射/ }).check();
    await panel.getByRole("slider", { name: "折射强度" }).fill("32");
    await panel.getByRole("button", { name: "保存设置" }).click();
    await expect(card).toHaveCSS("backdrop-filter", /wallpaper-glass-lens/);
    await page.mouse.move(0, 0);
    await capture(page, `glass-production-${spec.name}-on`);
    const on = await card.screenshot({ animations: "disabled" });
    assert.ok(!off.equals(on), "Refraction must change the rendered card");
    if (spec.name === "desktop") {
      const cards = page.locator(".grouped-site-section").first().locator(".site-card[data-site-dnd-id]");
      const target = cards.nth(0);
      const source = cards.nth(1);
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      assert.ok(sourceBox && targetBox, "Drag source and target cards must be visible");
      await page.mouse.move(sourceBox.x + 8, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(sourceBox.x - 43, sourceBox.y + sourceBox.height / 2);
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
      await expect(source).toHaveCSS("opacity", "0.26");
      await expect(target).toHaveClass(/is-drop-target/);
      await expect(target).toHaveCSS("opacity", "0.78");
      await expect(target).toHaveCSS("backdrop-filter", /blur\(2px\).*wallpaper-glass-lens/);
      const targetFillAlpha = await target.evaluate(el => {
        const color = getComputedStyle(el).backgroundColor;
        return Number(color.match(/\/\s*([\d.]+)\)$/)?.[1] ?? 1);
      });
      assert.ok(targetFillAlpha > 0.75, `Target glass fill alpha should exceed 0.75, got ${targetFillAlpha}`);
      metrics.push({ name: "site-drag-feedback", targetOpacity: 0.78, sourceOpacity: 0.26,
        targetFillAlpha, targetBackdrop: await target.evaluate(el => getComputedStyle(el).backdropFilter) });
      await page.screenshot({ path: join(output, "glass-production-xiaohongshu-over-bilibili.png"), animations: "disabled" });
      await page.keyboard.press("Escape");
      await page.mouse.up();
    }
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(card).toHaveCSS("color", "rgb(232, 236, 243)");
    await capture(page, `glass-production-${spec.name}-dark`);
    await settings(page);
    await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).scrollIntoViewIfNeeded();
    await capture(page, `glass-production-${spec.name}-settings`);
    await panel.locator("summary").filter({ hasText: /^顶栏外观/ }).click();
    await panel.getByRole("button", { name: "玻璃底板", exact: true }).click();
    await panel.getByRole("slider", { name: "顶栏透明度" }).fill("85");
    await panel.getByRole("button", { name: "保存设置" }).click();
    await capture(page, `glass-production-${spec.name}-topbar`);
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await capture(page, `glass-production-${spec.name}-menu`);
    await context.close();
  }
} finally { await browser.close(); }

const extension = resolve("dist-extension");
const profile = await mkdtemp(join(tmpdir(), "mysimple-glass-check-"));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : { channel: "chromium" }),
  headless: true, viewport: { width: 1440, height: 1000 },
  ignoreDefaultArgs: ["--hide-scrollbars"],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const page = await context.newPage();
  await prepare(page, `chrome-extension://${new URL(worker.url()).host}/index.html`, true);
  const panel = await settings(page);
  await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).click();
  await panel.locator("summary").filter({ hasText: /^玻璃参数微调/ }).click();
  await panel.getByRole("checkbox", { name: /玻璃折射/ }).check();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(page.locator(".site-card").first()).toHaveCSS("backdrop-filter", /wallpaper-glass-lens/);
  await capture(page, "glass-production-native-extension");
  assert.equal(await page.evaluate(() => chrome.runtime.getManifest().version), manifest.version);
} finally { await context.close(); }
assert.deepEqual(errors, []);
await writeFile(join(output, "glass-production-metrics.json"), JSON.stringify({ metrics, errors }, null, 2));
console.log(JSON.stringify({ screenshots: metrics.length, errors }, null, 2));
