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
    const githubGroup = state.groups.find(group => group.workspace === "github");
    state.sites.push(...Array.from({ length: 18 }, (_, index) => ({ ...originals[0], id: `repository-${index}`,
      name: `示例仓库 ${index + 1}`, url: `https://github.com/example/repository-${index}`, groupId: githubGroup.id,
      order: index, globalOrder: 48 + index, iconSource: "brand" })));
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
      await panel.locator("summary").filter({ hasText: /^阅读与氛围/ }).click();
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
    await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).click();
    await panel.locator("summary").filter({ hasText: /^玻璃参数微调/ }).click();
    await panel.getByRole("slider", { name: "玻璃透明度" }).scrollIntoViewIfNeeded();
    await capture(page, `materials-${mode}-${theme}-controls`);
    await panel.getByRole("button", { name: "取消", exact: true }).click();
    await page.locator(".footer").scrollIntoViewIfNeeded();
    await capture(page, `materials-${mode}-${theme}-footer`);
  }
  await inspectPresets(page, mode);
}

async function inspectPresets(page, mode) {
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => scrollTo(0, 0));
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  const names = ["液态清透", "水晶棱镜", "柔光薄雾", "细腻磨砂", "轻透无影", "经典玻璃"];
  for (const [index, name] of names.entries()) {
    await page.getByRole("button", { name: "打开设置" }).click();
    await panel.getByRole("tab", { name: /壁纸/ }).click();
    if (!index) {
      await panel.locator("summary").filter({ hasText: /^阅读与氛围/ }).click();
      await panel.getByRole("slider", { name: "明暗遮罩" }).fill("0");
    }
    await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).click();
    await panel.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await panel.getByRole("button", { name: "保存设置" }).click();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(output, `liquid-${mode}-preset-${index + 1}.png`) });
  }
  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  await expect(panel.getByRole("slider")).toHaveCount(0);
  await page.screenshot({ path: join(output, `liquid-${mode}-collapsed.png`) });
  await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).click();
  await panel.getByRole("button", { name: /^液态清透/ }).click();
  await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(output, `liquid-${mode}-presets.png`) });
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.waitForTimeout(300);
  const card = page.locator(".site-card").nth(3);
  const refracted = await card.screenshot({ path: join(output, `liquid-${mode}-refraction-on.png`) });
  const unfiltered = await page.addStyleTag({ content: ".has-wallpaper.glass-refraction .site-card:not(.is-dragging) { backdrop-filter: var(--glass-filter) !important; }" });
  const ordinary = await card.screenshot({ path: join(output, `liquid-${mode}-refraction-off.png`) });
  await unfiltered.evaluate(el => el.remove());
  const optical = await page.evaluate(async ({ on, off }) => {
    async function pixels(value) {
      const image = new Image(); image.src = `data:image/png;base64,${value}`; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      return { data: context.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
    }
    const a = await pixels(on), b = await pixels(off);
    let rimChanged = 0, centerChanged = 0;
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const delta = Math.max(...[0, 1, 2].map(c => Math.abs(a.data[i + c] - b.data[i + c])));
      if (delta <= 8) continue;
      if (Math.min(x, y, a.width - 1 - x, a.height - 1 - y) < 20) rimChanged++;
      else centerChanged++;
    }
    return { rimChanged, centerChanged };
  }, { on: refracted.toString("base64"), off: ordinary.toString("base64") });
  assert.ok(optical.rimChanged > 50, "The rim must refract actual wallpaper pixels");
  assert.equal(optical.centerChanged, 0, "The lens center and text must stay stationary");
  await page.getByRole("button", { name: "打开历史记录" }).click();
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", event => {
    if (frames.length < 16) frames.push(Buffer.from(event.data, "base64"));
    void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId });
  });
  await cdp.send("Page.startScreencast", { format: "png", maxWidth: 1440, maxHeight: 1000, everyNthFrame: 1 });
  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  await page.waitForTimeout(600);
  await cdp.send("Page.stopScreencast");
  await cdp.detach();
  for (const [index, frame] of frames.entries()) await writeFile(join(output, `liquid-${mode}-transition-${String(index).padStart(2, "0")}.png`), frame);
  await page.screenshot({ path: join(output, `liquid-${mode}-github.png`) });
  metrics.push({ mode, presets: names, optical, transitionFrames: frames.length, screenshots: 11 + frames.length });
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
console.log(JSON.stringify({ screenshots: metrics.reduce((count, metric) => count + (metric.screenshots ?? 1), 0), errors }));
