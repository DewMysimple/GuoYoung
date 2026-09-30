import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const { version } = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${version}/screenshots`);
await mkdir(output, { recursive: true });
const report = { version, captures: [], errors: [] };
const background = '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000"><defs><linearGradient id="g"><stop stop-color="#245b7c"/><stop offset="1" stop-color="#68c1cb"/></linearGradient></defs><rect width="1440" height="1000" fill="url(#g)"/><path d="M0 720Q700 80 1440 650" fill="none" stroke="#c7e2ce" stroke-width="200"/><circle cx="1100" cy="80" r="260" fill="#e2e8dc"/></svg>';
async function inspect(context, url, extension) {
  const prefix = extension ? "extension" : "web";
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.on("pageerror", error => report.errors.push(error.message));
  await page.route("https://polish.example/background.svg", route => route.fulfill({ contentType: "image/svg+xml", body: background }));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  const original = await page.evaluate(async extension => JSON.parse(extension ? (await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"] : localStorage.getItem("site-hub:v1")), extension);
  const capture = async (name, options = {}) => {
    await page.screenshot({ path: join(output, `${prefix}-font-repair-${name}.png`), animations: "disabled", ...options });
    report.captures.push(`${prefix}-font-repair-${name}`);
  };
  for (const theme of ["light", "dark"]) for (const wallpaper of [false, true]) {
    const state = structuredClone(original);
    state.displayModeByWorkspace.main = "grouped";
    state.appearance = { ...state.appearance, theme, textColorMode: "theme" };
    state.wallpaper = { ...state.wallpaper, source: wallpaper ? "url" : "none", url: "https://polish.example/background.svg", overlay: 0, glassPanelTransparency: 80, glassBlur: 8 };
    await page.evaluate(async ({ state, extension }) => {
      if (extension) await chrome.storage.local.set({ "site-hub:v1": JSON.stringify(state) });
      else localStorage.setItem("site-hub:v1", JSON.stringify(state));
    }, { state, extension });
    await page.reload();
    await expect(page.getByRole("navigation", { name: "分组定位" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (wallpaper) await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
    const name = `${theme}-${wallpaper ? "wallpaper" : "plain"}`;
    await capture(`${name}-page`);
    await page.getByRole("button", { name: "打开设置" }).click();
    const panel = page.getByRole("dialog", { name: "设置", exact: true });
    await panel.getByRole("tab", { name: "字体调节" }).click();
    const disclosure = panel.locator("details").filter({ has: page.locator(":scope > summary", { hasText: "文字颜色" }) });
    if (await disclosure.getAttribute("open") === null) await disclosure.locator(":scope > summary").click();
    await capture(`${name}-palette`);
    const font = panel.locator('.typography-fonts > button[aria-pressed="true"]');
    await font.screenshot({ path: join(output, `${prefix}-font-repair-${name}-divider.png`), animations: "disabled" });
    report.captures.push(`${prefix}-font-repair-${name}-divider`);
    await panel.getByRole("button", { name: "自定义主要文字颜色", exact: true }).click();
    const picker = panel.getByRole("dialog", { name: "选择自定义颜色", exact: true });
    await expect(picker).toBeVisible();
    await picker.scrollIntoViewIfNeeded();
    // Let Chromium repaint newly exposed controls after scrolling the panel.
    await page.waitForTimeout(250);
    await capture(`${name}-picker`);
    await expect(panel.getByRole("checkbox", { name: "主题关联字体颜色", exact: true })).toBeChecked();
    await panel.getByRole("button", { name: "取消", exact: true }).click();
  }
  await page.close();
}
const browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
try { await inspect(await browser.newContext(), process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4192", false); }
finally { await browser.close(); }
const extension = resolve("dist-extension");
const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mysimple-font-repair-")), {
  channel: "chromium", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await inspect(context, `chrome-extension://${new URL(worker.url()).host}/index.html`, true);
} finally { await context.close(); }
assert.deepEqual(report.errors, []);
await writeFile(join(output, "font-repair-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ screenshots: report.captures.length, errors: report.errors }));
