// Production desktop and native MV3 checks using synthetic collections/wallpaper.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const errors = [];
const metrics = [];
const wallpaper = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="sea" x2="1" y2="1"><stop stop-color="#c9e7ef"/><stop offset=".5" stop-color="#658ca5"/><stop offset="1" stop-color="#152e49"/></linearGradient><pattern id="wave" width="140" height="80" patternUnits="userSpaceOnUse"><path d="M-40 30Q20 2 70 30T180 30M-40 60Q20 32 70 60T180 60" stroke="#eafff7" stroke-opacity=".7" stroke-width="4" fill="none"/></pattern></defs><path d="M0 0h1920v1080H0z" fill="url(#sea)"/><path d="M0 0h1920v1080H0z" fill="url(#wave)"/></svg>`;

async function prepare(page, url, extension) {
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://typography.example/waves.svg", route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  await page.evaluate(async extension => {
    const key = "site-hub:v1";
    const raw = extension ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key);
    const state = JSON.parse(raw);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://typography.example/waves.svg", overlay: 0,
      glassTransparency: 92, glassBlur: 2 };
    state.appearance.theme = "light";
    const originals = state.sites;
    state.sites = Array.from({ length: 36 }, (_, index) => ({ ...originals[index % originals.length],
      id: `font-visual-${index}`, order: index, globalOrder: index, iconSource: "brand" }));
    if (extension) await chrome.storage.local.set({ [key]: JSON.stringify(state) });
    else localStorage.setItem(key, JSON.stringify(state));
  }, extension);
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const values = await page.locator(".site-card .site-name").first().evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, font: style.fontFamily, size: style.fontSize, shadow: style.textShadow,
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.equal(values.overflow, false, name);
  metrics.push({ name, ...values });
  await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
}

async function openFonts(page) {
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "字体调节" }).click();
  return panel;
}

async function inspect(page, prefix) {
  const name = page.locator(".site-card .site-name").first();
  await capture(page, `${prefix}-before`);
  const panel = await openFonts(page);
  await panel.getByRole("group", { name: "文字配色", exact: true }).getByRole("button", { name: "自定义", exact: true }).click();
  await panel.getByRole("button", { name: "白色文字" }).click();
  await panel.getByRole("button", { name: "描边", exact: true }).click();
  await panel.getByRole("slider", { name: "效果强度" }).fill("90");
  await panel.getByRole("slider", { name: "整体字号", exact: true }).fill("110");
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(name).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(name).not.toHaveCSS("text-shadow", "none");
  await expect(page.locator(".collection-heading h2")).not.toHaveCSS("text-shadow", "none");
  await capture(page, `${prefix}-outline`);
  await openFonts(page);
  await panel.locator(".settings-body").evaluate(element => { element.scrollTop = 0; });
  await capture(page, `${prefix}-settings-top`);
  await panel.getByRole("button", { name: "自定义主要文字颜色" }).click();
  const picker = panel.getByRole("dialog", { name: "选择自定义颜色" });
  await picker.scrollIntoViewIfNeeded();
  const box = await picker.boundingBox();
  const panelBox = await panel.boundingBox();
  const footerBox = await panel.locator(".settings-footer").boundingBox();
  assert.ok(box.x >= panelBox.x && box.x + box.width <= panelBox.x + panelBox.width);
  assert.ok(box.y + box.height <= footerBox.y);
  await capture(page, `${prefix}-color-picker`);
  await panel.getByRole("button", { name: "自定义主要文字颜色" }).click();
  await panel.getByRole("button", { name: "墨色文字" }).click();
  await panel.getByRole("button", { name: "柔光", exact: true }).click();
  await panel.getByRole("slider", { name: "效果强度" }).fill("65");
  await panel.getByRole("button", { name: "宋体 / 衬线" }).click();
  await panel.getByRole("checkbox", { name: "允许选择展示文字" }).uncheck();
  await panel.getByRole("tab", { name: "外观", exact: true }).click();
  await panel.getByRole("button", { name: "深色", exact: true }).click();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(name).toHaveCSS("font-family", /SimSun/);
  await expect(name).toHaveCSS("color", "rgb(23, 28, 38)");
  await expect(name).not.toHaveCSS("text-shadow", "none");
  await expect(page.locator(".collection-heading h2")).toHaveCSS("user-select", "none");
  await capture(page, `${prefix}-glow-dark`);
  await openFonts(page);
  await panel.getByRole("slider", { name: "整体字号", exact: true }).fill("120");
  await panel.getByRole("checkbox", { name: "允许选择展示文字" }).scrollIntoViewIfNeeded();
  await expect(panel.getByRole("heading", { name: "文字增强" })).toHaveCSS("color", "rgb(232, 236, 243)");
  await capture(page, `${prefix}-settings-effects`);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, colorScheme: "light" });
  await prepare(page, process.env.CAPTURE_URL ?? "http://127.0.0.1:4175", false);
  await inspect(page, "typography-web");
} finally { await browser.close(); }

const extension = resolve("dist-extension");
const profile = await mkdtemp(join(tmpdir(), "mysimple-typography-"));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : { channel: "chromium" }),
  headless: true, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const origin = `chrome-extension://${new URL(worker.url()).host}`;
  const page = await context.newPage();
  await prepare(page, `${origin}/index.html`, true);
  await inspect(page, "typography-extension");
  assert.equal(await page.evaluate(() => chrome.runtime.getManifest().version), manifest.version);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 440, height: 600 });
  popup.on("pageerror", error => errors.push(error.message));
  await popup.goto(`${origin}/popup.html`);
  await expect(popup.locator("html")).toHaveAttribute("data-text-selection", "disabled");
  await expect(popup.locator("input").first()).toHaveCSS("user-select", "text");
  await popup.screenshot({ path: join(output, "typography-popup-selection.png") });
} finally { await context.close(); }
assert.deepEqual(errors, []);
await writeFile(join(output, "typography-metrics.json"), JSON.stringify({ metrics, errors }, null, 2));
console.log(JSON.stringify({ screenshots: metrics.length + 1, errors, version: manifest.version }, null, 2));
