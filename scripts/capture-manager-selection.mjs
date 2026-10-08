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
const wallpaperURL = "https://manager.example/background.svg";
const wallpaper = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#325d86"/><stop offset=".5" stop-color="#99afad"/><stop offset="1" stop-color="#9a6c80"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><circle cx="1180" cy="320" r="170" fill="#edd3a6"/></svg>';
const errors = [], reports = [];
let screenshots = 0;
const readState = (page, extension) => page.evaluate(async extension => JSON.parse(extension ? (await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"] : localStorage.getItem("site-hub:v1")), extension);
async function seed(page, extension, state) {
  await page.evaluate(async ({ extension, state }) => {
    if (extension) await chrome.storage.local.set({ "site-hub:v1": JSON.stringify(state) });
    else localStorage.setItem("site-hub:v1", JSON.stringify(state));
  }, { extension, state });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  if (state.wallpaper.source === "url") await page.locator(".wallpaper-layer img").evaluate(image => image.decode());
  await page.evaluate(() => document.fonts.ready);
}
async function capture(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${name}: overflow`);
  await page.screenshot({ path: join(output, `${name}.png`) });
  screenshots++;
}
async function directEndpointSweep(page, targets, steps, verify, screenshotPrefix) {
  const boxes = await Promise.all(targets.map(target => target.boundingBox()));
  assert.equal(boxes.every(Boolean), true, "All ABCD targets must be visible");
  const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const first = center(boxes[0]), last = center(boxes[3]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  const passes = [];
  for (const [pass, forward] of [true, false, true].entries()) {
    const end = forward ? last : first;
    await page.mouse.move(end.x, end.y, { steps });
    // Keep the same press at the actual endpoint: D never exits its card/circle.
    await page.waitForTimeout(80);
    await verify(forward);
    if (screenshotPrefix && pass < 2) await capture(page, `${screenshotPrefix}-${forward ? "outbound" : "returned"}-held`);
    passes.push({ endpoint: forward ? "D" : "A", held: true, verified: true });
  }
  await page.mouse.up();
  await verify(true);
  return { pattern: "ABCD", directEndpointTurn: true, steps, passes, releasePreservesSelection: true };
}
async function inspect(context, extensionURL, theme, enabled) {
  const extension = Boolean(extensionURL), name = `manager-selection-${extension ? "extension" : "web"}-${theme}-${enabled ? "wallpaper" : "empty"}`;
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(wallpaperURL, route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.goto(extensionURL || baseURL, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  const initial = await readState(page, extension);
  const fourth = { ...initial.sites.find(site => site.id === "codepen"), id: "sweep-d", name: "Sweep D", url: "https://sweep-d.example/", order: 3, globalOrder: 5 };
  const speeds = theme === "light" && enabled ? [1, 12, 60] : [12];
  const sweepResults = [];
  await seed(page, extension, { ...initial, appearance: { ...initial.appearance, theme },
    sites: [...initial.sites.map(site => ({ ...site, globalOrder: site.globalOrder >= 5 ? site.globalOrder + 1 : site.globalOrder })), fourth],
    displayModeByWorkspace: { ...initial.displayModeByWorkspace, main: "flat" },
    sortModeByWorkspace: { ...initial.sortModeByWorkspace, main: "manual" },
    wallpaper: { ...initial.wallpaper, source: enabled ? "url" : "none", url: wallpaperURL } });
  for (const view of ["flat", "focused", "grouped"]) {
    if (view === "focused") await page.locator('[data-group-drop-id="develop"]').click();
    if (view === "grouped") {
      await page.getByRole("tab", { name: /全部/ }).click();
      await page.getByRole("button", { name: "显示", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
    }
    await page.getByRole("button", { name: view === "grouped" ? "多选 搜索 网站" : "多选", exact: true }).click();
    const before = await readState(page, extension);
    const cards = page.locator("[data-site-dnd-id]");
    const abcd = ["github", "stackoverflow", "codepen", "sweep-d"].map(id => page.getByTestId(`site-card-${id}`));
    await abcd[0].scrollIntoViewIfNeeded();
    const boxes = await Promise.all(abcd.map(card => card.boundingBox()));
    assert.equal(boxes.every(box => box && Math.abs(box.y - boxes[0].y) < 1), true, `${name}-${view}: ABCD share a row`);
    for (const steps of speeds) for (const mixed of [true, false]) {
      if (mixed) await abcd[1].click();
      const verify = async forward => {
        for (let i = 0; i < 4; i++) {
          const selected = (mixed && i === 1) !== forward;
          await expect(abcd[i]).toHaveClass(selected ? /is-selected/ : /^(?!.*is-selected)/);
        }
        await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(forward ? (mixed ? 3 : 4) : (mixed ? 1 : 0));
        await expect(page.getByTestId("site-card-drag-preview")).toHaveCount(0);
        assert.equal(await cards.evaluateAll(els => els.every(el => getComputedStyle(el).transform === "none")), true);
      };
      const selection = mixed ? "mixed" : "unselected";
      const result = await directEndpointSweep(page, abcd, steps, verify, steps === 12 ? `${name}-${view}-${selection}` : null);
      sweepResults.push({ view, selection, ...result });
      for (let i = 0; i < 4; i++) if (!mixed || i !== 1) await abcd[i].click();
      await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(0);
    }
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(0);
    assert.deepEqual(await readState(page, extension), before);
    await page.keyboard.press("Escape");
  }
  const state = await readState(page, extension);
  state.displayModeByWorkspace.main = "flat";
  state.groups.push(...Array.from({ length: 24 }, (_, i) => ({ ...state.groups[0], id: `extra-${i}`, name: `测试分组 ${i}`, icon: "folder", order: i + 10 })));
  state.sites = Array.from({ length: 12 }, (_, i) => state.sites.map(site => ({ ...site, id: `${site.id}-${i}` }))).flat();
  await seed(page, extension, state);
  const managerState = await readState(page, extension);
  await page.evaluate(() => window.scrollTo(0, 100));
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const pageScroll = await page.evaluate(() => scrollY);
  assert.equal(pageScroll, 100);
  const dialog = page.getByRole("dialog", { name: "管理分组" });
  await expect(page.locator("html")).toHaveCSS("overflow-y", "hidden");
  await dialog.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
  await expect(dialog).toHaveCSS("opacity", "1");
  await expect(dialog.locator(":scope > .dialog-footer")).toHaveCSS("border-top-width", "0px");
  const remove = dialog.locator(".group-editor-delete");
  if (enabled) await expect(remove).toHaveCSS("background-color", await dialog.getByRole("button", { name: "导入资源" }).evaluate(el => getComputedStyle(el).backgroundColor));
  await capture(page, `${name}-manager-top`);
  const checks = dialog.locator(".group-manager-list .group-manager-check:not(:disabled)");
  const editorName = await dialog.getByLabel("分组名称").inputValue();
  const abcdChecks = Array.from({ length: 4 }, (_, i) => checks.nth(i));
  for (const steps of speeds) for (const mixed of [true, false]) {
    if (mixed) await checks.nth(1).click();
    const verify = async forward => {
      for (let i = 0; i < 4; i++) await expect(checks.nth(i)).toHaveAttribute("aria-pressed", String((mixed && i === 1) !== forward));
      await expect(checks.nth(4)).toHaveAttribute("aria-pressed", "false");
      await expect(dialog.locator(".group-manager-list .group-manager-check[aria-pressed='true']")).toHaveCount(forward ? (mixed ? 3 : 4) : (mixed ? 1 : 0));
      await expect(dialog.locator(".group-manager-check:disabled")).toHaveAttribute("aria-pressed", "false");
      await expect(dialog.getByLabel("分组名称")).toHaveValue(editorName);
      await expect(page.locator(".group-list-item-drag-preview")).toHaveCount(0);
    };
    const selection = mixed ? "mixed" : "unselected";
    const result = await directEndpointSweep(page, abcdChecks, steps, verify, steps === 12 ? `${name}-manager-${selection}` : null);
    sweepResults.push({ view: "manager", selection, ...result });
    for (let i = 0; i < 4; i++) if (!mixed || i !== 1) await checks.nth(i).click();
    await expect(dialog.locator(".group-manager-list .group-manager-check[aria-pressed='true']")).toHaveCount(0);
  }
  await remove.click();
  await expect(remove).toHaveCSS("background-color", "rgb(179, 58, 70)");
  await dialog.getByLabel("分组名称").click();
  for (const selector of [".group-manager-list", ".group-manager-editor"]) {
    const scroll = dialog.locator(selector);
    await expect(scroll).toHaveCSS("scrollbar-width", "thin");
    await expect(scroll).toHaveCSS("overscroll-behavior-y", "contain");
    await scroll.hover();
    await page.mouse.wheel(0, 200);
    await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    for (const bottom of [true, false]) {
      await scroll.evaluate((el, bottom) => { el.scrollTop = bottom ? el.scrollHeight : 0; }, bottom);
      for (let i = 0; i < 3; i++) await page.mouse.wheel(0, bottom ? 600 : -600);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => scrollY), pageScroll);
    }
    await scroll.evaluate(el => {
      el.scrollTop = el.scrollHeight;
      const range = document.createRange(); range.selectNodeContents(el);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await page.mouse.wheel(0, 600); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => scrollY), pageScroll);
    await page.evaluate(() => getSelection().removeAllRanges());
  }
  await dialog.getByRole("heading", { name: "管理分组" }).focus();
  await page.keyboard.press("PageDown"); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => scrollY), pageScroll);
  await capture(page, `${name}-manager-bottom`);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.mouse.move(1410, 800); await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageScroll);
  assert.deepEqual(await readState(page, extension), managerState);
  reports.push({ name, continuousABCDThreeViews: true, directEndpointTurn: true, steps: speeds, sweepResults, repeatedPassesWithoutRelease: true, managerCircleDirectTurn: true, noDragOrWrite: true, noManagerFooterLine: true, themedManager: true, wheelBothEdges: true, selectionWheelLocked: true, pageDownLocked: true, scrollingRestored: true });
  // Each theme scenario starts with the original collection, not the previous
  // scenario's enlarged manager fixture (the MV3 context shares storage).
  await seed(page, extension, initial);
  await page.close();
}
try {
  const browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    const context = await browser.newContext();
    for (const theme of ["light", "dark"]) for (const enabled of [true, false]) await inspect(context, false, theme, enabled);
  } finally { await browser.close(); }
  const directory = resolve("dist-extension");
  const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mysimple-manager-selection-")), {
    channel: "chromium", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const url = `chrome-extension://${new URL(worker.url()).host}/index.html`;
    for (const theme of ["light", "dark"]) for (const enabled of [true, false]) await inspect(context, url, theme, enabled);
  } finally { await context.close(); }
  assert.deepEqual(errors, []);
  await writeFile(join(output, "manager-selection-report.json"), JSON.stringify({ version, screenshots, errors, reports }, null, 2));
  console.log(JSON.stringify({ version, screenshots, errors, scenarios: reports.length }));
} finally { server.close(); }
