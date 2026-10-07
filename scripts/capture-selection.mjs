import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { tmpdir } from "node:os";
import { chromium, expect } from "@playwright/test";

const root = resolve("dist");
const { version } = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const output = resolve("artifacts/releases", `v${version}`, "screenshots");
await mkdir(output, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const wallpaperURL = "https://selection.example/background.svg";
const wallpaper = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#325d86"/><stop offset=".5" stop-color="#99afad"/><stop offset="1" stop-color="#9a6c80"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><circle cx="1180" cy="320" r="170" fill="#edd3a6"/></svg>';
const errors = [], reports = [];
let screenshots = 0;
const readState = (page, extension) => page.evaluate(async extension => JSON.parse(extension ? (await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"] : localStorage.getItem("site-hub:v1")), extension);

async function capture(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${name}: overflow`);
  await page.screenshot({ path: join(output, `${name}.png`) });
  screenshots++;
}
async function sweep(page, first, last, gutter = false) {
  const a = await first.boundingBox(), b = await last.boundingBox();
  assert.ok(a && b, "Visible sweep endpoints");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  if (gutter) {
    await page.mouse.move(a.x - 8, a.y + a.height / 2, { steps: 4 });
    await page.mouse.move(a.x - 8, b.y + b.height / 2, { steps: 8 });
  } else {
    await page.mouse.move(a.x + a.width / 2, a.y - 4, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y - 4, { steps: 6 });
  }
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(2);
  await expect(first).toHaveClass(/is-selected/);
  await expect(last).toHaveClass(/is-selected/);
  await expect(page.getByTestId("site-card-drag-preview")).toHaveCount(0);
  assert.equal(await page.locator("[data-site-dnd-id]").evaluateAll(els => els.every(el => getComputedStyle(el).transform === "none" && !el.matches(".is-dragging,.is-drag-pending"))), true);
}

async function inspect(context, extensionURL, theme, enabled) {
  const extension = Boolean(extensionURL), name = `selection-${extension ? "extension" : "web"}-${theme}-${enabled ? "wallpaper" : "empty"}`;
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.route(wallpaperURL, route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.goto(extensionURL || baseURL, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  const initial = await readState(page, extension);
  const seed = { ...initial, appearance: { ...initial.appearance, theme },
    displayModeByWorkspace: { ...initial.displayModeByWorkspace, main: "flat" },
    sortModeByWorkspace: { ...initial.sortModeByWorkspace, main: "manual" },
    wallpaper: { ...initial.wallpaper, source: enabled ? "url" : "none", url: enabled ? wallpaperURL : undefined } };
  await page.evaluate(async ({ seed, extension, width }) => {
    localStorage.setItem("site-hub:settings-panel-width", String(width));
    if (extension) await chrome.storage.local.set({ "site-hub:v1": JSON.stringify(seed) });
    else localStorage.setItem("site-hub:v1", JSON.stringify(seed));
  }, { seed, extension, width: enabled ? 360 : 440 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  if (enabled) await page.locator(".wallpaper-layer img").evaluate(image => image.decode());
  await page.evaluate(() => document.fonts.ready);
  for (const view of ["flat", "focused", "grouped"]) {
    if (view === "focused") await page.locator('[data-group-drop-id="develop"]').click();
    if (view === "grouped") {
      await page.getByRole("tab", { name: /全部/ }).click();
      await page.getByRole("button", { name: "显示", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
    }
    const before = await readState(page, extension);
    await page.getByRole("button", { name: view === "grouped" ? "多选 搜索 网站" : "多选", exact: true }).click();
    const cards = page.locator("[data-site-dnd-id]");
    await sweep(page, cards.first(), cards.nth(view === "grouped" ? 1 : 2));
    await capture(page, `${name}-${view}-held`);
    await page.mouse.up();
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(2);
    assert.deepEqual(await readState(page, extension), before);
    if (view !== "grouped") {
      const controls = page.locator(".collection-view-controls");
      const all = controls.getByRole("button", { name: "全选", exact: true });
      await all.click();
      await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(await cards.count());
      await controls.getByRole("button", { name: "取消全选", exact: true }).click();
      await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(0);
      if (view === "flat") {
        await page.getByRole("button", { name: "选择 Google", exact: true }).click();
        await page.getByRole("button", { name: "选择 CodePen", exact: true }).click({ modifiers: ["Shift"] });
        await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(5);
      }
      await controls.getByRole("button", { name: "取消", exact: true }).click();
      await expect(controls.getByRole("button", { name: "手动排列", exact: true })).toBeVisible();
    } else {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "多选 搜索 网站", exact: true }).click();
      await sweep(page, page.getByTestId("site-card-google"), page.getByTestId("site-card-github"), true);
      await capture(page, `${name}-cross-group-held`);
      await page.mouse.up();
      await expect(page.getByTestId("site-card-bing")).not.toHaveClass(/is-selected/);
      await page.keyboard.press("Escape");
    }
    assert.deepEqual(await readState(page, extension), before);
  }
  const original = await readState(page, extension);
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
  const glass = panel.locator(".wallpaper-settings > details").filter({ has: page.locator("summary").filter({ hasText: /^玻璃外观/ }) });
  await glass.locator(":scope > summary").click();
  await expect(glass.getByRole("slider")).toHaveCount(8);
  await expect(glass.locator("details")).toHaveCount(0);
  await glass.getByRole("slider", { name: "玻璃透明度", exact: true }).fill("61");
  await glass.scrollIntoViewIfNeeded();
  await capture(page, `${name}-glass-single-disclosure`);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  assert.deepEqual(await readState(page, extension), original);
  const google = page.getByTestId("site-card-google");
  await google.scrollIntoViewIfNeeded();
  const a = await google.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 52, a.y + a.height / 2);
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await expect(google).toHaveCSS("opacity", "0.46");
  await capture(page, `${name}-normal-drag`);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(google).toHaveCSS("opacity", "1");
  assert.deepEqual(await readState(page, extension), original);
  reports.push({ name, threeViews: true, exactPathOnly: true, crossGroup: true, allCancel: true, shift: true, singleDisclosure: true, normalDrag: true, overflow: false });
  await page.close();
}

try {
  const browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    const context = await browser.newContext();
    for (const theme of ["light", "dark"]) for (const enabled of [true, false]) await inspect(context, false, theme, enabled);
  } finally { await browser.close(); }
  const directory = resolve("dist-extension");
  const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mysimple-selection-")), {
    channel: "chromium", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const url = `chrome-extension://${new URL(worker.url()).host}/index.html`;
    for (const theme of ["light", "dark"]) for (const enabled of [true, false]) await inspect(context, url, theme, enabled);
  } finally { await context.close(); }
  assert.deepEqual(errors, []);
  await writeFile(join(output, "selection-report.json"), JSON.stringify({ version, screenshots, errors, reports }, null, 2));
  console.log(JSON.stringify({ version, screenshots, errors, scenarios: reports.length }));
} finally { server.close(); }
