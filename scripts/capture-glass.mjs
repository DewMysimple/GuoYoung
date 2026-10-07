import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
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
  if (!file.startsWith(root + "\\")) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const wallpaperURL = "https://panel-glass.example/scene.svg";
const wallpaper = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#325d86"/><stop offset=".5" stop-color="#99afad"/><stop offset="1" stop-color="#9a6c80"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><circle cx="1180" cy="320" r="170" fill="#edd3a6"/><path d="M0 860L480 400L880 900L1400 540L1600 1000H0" fill="#334c66"/></svg>';
const errors = [], reports = [];
let screenshotCount = 0;

async function readState(page, extension) {
  return page.evaluate(async extension => JSON.parse(extension ? (await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"] : localStorage.getItem("site-hub:v1")), extension);
}

async function openControls(page) {
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
  const topbar = panel.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^顶栏外观/ }) });
  const sidebar = panel.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^侧栏外观/ }) });
  for (const section of [topbar, sidebar]) if (await section.getAttribute("open") === null) await section.locator("summary").click();
  await expect(panel.getByRole("button", { name: /^(融入壁纸|跟随公共玻璃)$/, hidden: true })).toHaveCount(0);
  await expect(panel.getByRole("checkbox", { name: /顶部清晰阅读|模糊壁纸/, hidden: true })).toHaveCount(0);
  return { panel, topbar, sidebar };
}
async function capture(page, name, sections) {
  for (const section of sections) {
    const overflow = await section.evaluate(el => el.scrollWidth > el.clientWidth || [...el.querySelectorAll("input, button")].some(child => {
      const outer = el.getBoundingClientRect(), box = child.getBoundingClientRect();
      return box.left < outer.left || box.right > outer.right;
    }));
    assert.equal(overflow, false);
  }
  await sections.at(-1).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
  screenshotCount++;
}
async function inspectPresets(page, extension, name, enabled) {
  const read = () => readState(page, extension);
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  const presets = panel.locator(".wallpaper-presets");
  const topbar = panel.locator(".wallpaper-settings > details").filter({ has: page.locator("summary").filter({ hasText: /^顶栏外观/ }) });
  const sidebar = panel.locator(".wallpaper-settings > details").filter({ has: page.locator("summary").filter({ hasText: /^侧栏外观/ }) });
  async function open() {
    await page.getByRole("button", { name: "打开设置" }).click();
    await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
    for (const section of [presets, topbar, sidebar]) if (await section.getAttribute("open") === null) await section.locator(":scope > summary").click();
  }
  const original = await read();
  await open();
  const order = await panel.locator(".wallpaper-settings > .appearance-card").evaluateAll(nodes => nodes.map(node =>
    node.querySelector(":scope > summary > span")?.firstChild?.textContent ?? node.getAttribute("aria-label")));
  assert.deepEqual(order, ["壁纸来源", "外观预设", "基础设置", "玻璃外观", "顶栏外观", "侧栏外观"]);
  await expect(presets.locator(".glass-preset")).toHaveCount(6);
  await expect(presets.getByRole("slider")).toHaveCount(0);
  for (const button of await presets.locator('[data-preset^="custom-"]').all()) await expect(button).toBeDisabled();
  await capture(page, `${name}-presets`, [presets]);
  await presets.getByRole("checkbox").uncheck();
  await presets.locator('[data-preset="clear"]').click();
  for (const section of [topbar, sidebar]) await expect(section.getByRole("button", { name: "跟随公共" })).toHaveAttribute("aria-pressed", "true");
  if (enabled) await expect(panel).toHaveCSS("backdrop-filter", "blur(21px)");
  for (const section of [topbar, sidebar]) await section.getByRole("button", { name: "独立玻璃底板" }).click();
  await presets.locator('[data-preset="light"]').click();
  await expect(topbar.getByRole("slider", { name: "顶栏透明度" })).toHaveValue(String(original.wallpaper.topbarTransparency));
  await expect(topbar.getByRole("slider", { name: "模糊强度" })).toHaveValue(String(original.wallpaper.topbarBlur));
  await expect(sidebar.getByRole("slider", { name: "侧栏透明度" })).toHaveValue(String(original.wallpaper.sidebarTransparency));
  await expect(sidebar.getByRole("slider", { name: "模糊强度" })).toHaveValue(String(original.wallpaper.sidebarBlur));
  await presets.getByRole("checkbox").check();
  for (const [id, blur, sidebarBlur, saturation] of [["clear", 21, 21, 1], ["light", 0, 0, 1], ["soft", 12, 16, 1.1], ["frost", 26, 28, 1]]) {
    await presets.locator(`[data-preset="${id}"]`).click();
    await expect(presets.locator(`[data-preset="${id}"]`)).toHaveAttribute("aria-pressed", "true");
    for (const section of [topbar, sidebar]) await expect(section.getByRole("button", { name: "独立玻璃底板" })).toHaveAttribute("aria-pressed", "true");
    await expect(topbar.getByRole("slider", { name: "模糊强度" })).toHaveValue(String(blur));
    await expect(sidebar.getByRole("slider", { name: "模糊强度" })).toHaveValue(String(sidebarBlur));
    if (enabled) {
      const filter = (value) => [value ? `blur(${value}px)` : "", saturation !== 1 ? `saturate(${saturation})` : ""].filter(Boolean).join(" ") || "none";
      await expect(panel).toHaveCSS("backdrop-filter", filter(sidebarBlur));
      await expect.poll(() => page.locator(".topbar").evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toBe(filter(blur));
      await capture(page, `${name}-material-${id}`, [presets]);
    }
  }
  await presets.locator('[data-preset="clear"]').click();
  await presets.getByRole("button", { name: "保存当前到自定义 1", exact: true }).click();
  const glass = panel.locator(".wallpaper-settings > details").filter({ has: page.locator("summary").filter({ hasText: /^玻璃外观/ }) });
  const fine = glass.locator("details");
  for (const section of [glass, fine]) if (await section.getAttribute("open") === null) await section.locator(":scope > summary").click();
  await panel.getByRole("slider", { name: "阴影强度" }).fill("17");
  await topbar.getByRole("slider", { name: "顶栏透明度" }).fill("63");
  await sidebar.getByRole("slider", { name: "侧栏透明度" }).fill("72");
  await presets.getByRole("button", { name: "保存当前到自定义 2", exact: true }).click();
  await presets.locator('[data-preset="custom-1"]').click();
  await expect(topbar.getByRole("slider", { name: "顶栏透明度" })).toHaveValue("100");
  await expect(sidebar.getByRole("slider", { name: "侧栏透明度" })).toHaveValue("100");
  await expect(panel.getByRole("slider", { name: "阴影强度" })).toHaveValue("72");
  await presets.locator('[data-preset="custom-2"]').click();
  await expect(topbar.getByRole("slider", { name: "顶栏透明度" })).toHaveValue("63");
  await expect(sidebar.getByRole("slider", { name: "侧栏透明度" })).toHaveValue("72");
  await panel.getByRole("slider", { name: "阴影强度" }).fill("29");
  await presets.getByRole("button", { name: "覆盖自定义 1", exact: true }).click();
  await presets.locator('[data-preset="custom-2"]').click();
  await expect(panel.getByRole("slider", { name: "阴影强度" })).toHaveValue("17");
  await presets.locator('[data-preset="custom-1"]').click();
  await expect(panel.getByRole("slider", { name: "阴影强度" })).toHaveValue("29");
  await capture(page, `${name}-custom`, [presets]);
  assert.deepEqual(await read(), original);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await open();
  for (const button of await presets.locator('[data-preset^="custom-"]').all()) await expect(button).toBeDisabled();
  await presets.locator('[data-preset="clear"]').click();
  await presets.getByRole("button", { name: "保存当前到自定义 1", exact: true }).click();
  await presets.locator('[data-preset="soft"]').click();
  await presets.getByRole("button", { name: "保存当前到自定义 2", exact: true }).click();
  await presets.getByRole("checkbox").uncheck();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  const saved = await read();
  assert.equal(saved.wallpaper.presetIncludesPanels, false);
  assert.equal(saved.wallpaper.customPresets.length, 2);
  assert.equal(saved.wallpaper.customPresets[0].glassShadow, 72);
  assert.equal(saved.wallpaper.customPresets[1].glassShadow, 22);
  assert.equal(Object.keys(saved.wallpaper.customPresets[0]).length, 14);
  assert.deepEqual(saved.sites, original.sites);
  assert.deepEqual(saved.groups, original.groups);
  await open();
  await expect(presets.getByRole("checkbox")).not.toBeChecked();
  await presets.locator('[data-preset="custom-1"]').click();
  await expect(topbar.getByRole("slider", { name: "顶栏透明度" })).toHaveValue("82");
  await expect(sidebar.getByRole("slider", { name: "侧栏透明度" })).toHaveValue("70");
  if (enabled) {
    await panel.getByRole("button", { name: "清除壁纸", exact: true }).click();
    for (const button of await presets.locator('[data-preset^="custom-"]').all()) await expect(button).toBeEnabled();
    await panel.getByRole("button", { name: "保存设置" }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    const cleared = await read();
    assert.equal(cleared.wallpaper.source, "none");
    assert.equal(cleared.wallpaper.presetIncludesPanels, false);
    assert.deepEqual(cleared.wallpaper.customPresets, saved.wallpaper.customPresets);
  } else await panel.getByRole("button", { name: "取消", exact: true }).click();
}

async function inspect(context, extension, theme, enabled) {
  const page = await context.newPage();
  const width = enabled ? 360 : 440;
  const name = `wallpaper-presets-${extension ? "extension" : "web"}-${theme}-${enabled ? "wallpaper" : "empty"}-${width}`;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await context.route(wallpaperURL, route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(extension || baseURL, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  const initial = await readState(page, Boolean(extension));
  const state = { ...initial, appearance: { ...initial.appearance, theme }, wallpaper: { ...initial.wallpaper,
    source: enabled ? "url" : "none", url: enabled ? wallpaperURL : undefined,
    presetIncludesPanels: true, customPresets: [null, null],
    glassTransparency: 78, glassControlTransparency: 82, glassPanelTransparency: 60, glassPopoverTransparency: 55,
    glassShadow: 35, glassBlur: 12, glassSaturation: 130, glassHighlight: 45,
    topbarStyle: "shared", topbarTransparency: 68, topbarBlur: 7, sidebarStyle: "shared", sidebarTransparency: 60, sidebarBlur: 12 } };
  await page.evaluate(async ({ state, extension, width }) => {
    localStorage.setItem("site-hub:settings-panel-width", String(width));
    if (extension) await chrome.storage.local.set({ "site-hub:v1": JSON.stringify(state) });
    else localStorage.setItem("site-hub:v1", JSON.stringify(state));
  }, { state, extension: Boolean(extension), width });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  if (enabled) await page.locator(".wallpaper-layer img").evaluate(image => image.decode());
  await page.evaluate(() => document.fonts.ready);
  let { panel, topbar, sidebar } = await openControls(page);
  await expect(panel).toHaveCSS("width", `${width}px`);
  for (const section of [topbar, sidebar]) {
    await expect(section.getByRole("button", { name: "跟随公共", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(section.getByRole("group").getByRole("button")).toHaveCount(2);
    await expect(section.getByRole("slider")).toHaveCount(0);
  }
  await expect(panel.getByRole("checkbox", { name: /玻璃折射/, hidden: true })).toHaveCount(0);
  await expect(page.locator("filter, feDisplacementMap")).toHaveCount(0);
  await capture(page, `${name}-shared`, [topbar, sidebar]);
  const original = await readState(page, Boolean(extension));
  await topbar.getByRole("button", { name: "独立玻璃底板", exact: true }).click();
  await topbar.getByRole("slider", { name: "顶栏透明度" }).fill("100");
  await topbar.getByRole("slider", { name: "模糊强度" }).fill("0");
  await sidebar.getByRole("button", { name: "独立玻璃底板", exact: true }).click();
  await sidebar.getByRole("slider", { name: "侧栏透明度" }).fill("100");
  await sidebar.getByRole("slider", { name: "模糊强度" }).fill("0");
  if (enabled) {
    await expect(panel).toHaveCSS("backdrop-filter", "none");
    await expect(panel).toHaveCSS("background-image", "none");
    await expect.poll(() => page.locator(".topbar").evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toBe("none");
    const paint = await page.locator(".topbar").evaluate(el => ({ fill: getComputedStyle(el, "::before").backgroundColor, border: getComputedStyle(el, "::before").borderBottomColor, reading: getComputedStyle(el, "::after").content }));
    assert.match(paint.fill, /(?:\/ 0\)|rgba\(0, 0, 0, 0\))/);
    assert.match(paint.border, /(?:\/ 0\)|rgba\(0, 0, 0, 0\))/);
    assert.equal(paint.reading, "none");
  }
  await topbar.getByRole("slider", { name: "顶栏透明度" }).fill("62");
  await topbar.getByRole("slider", { name: "模糊强度" }).fill("9");
  await sidebar.getByRole("slider", { name: "侧栏透明度" }).fill("80");
  await sidebar.getByRole("slider", { name: "模糊强度" }).fill("8");
  if (enabled) {
    await expect(panel).toHaveCSS("backdrop-filter", "blur(8px) saturate(1.3)");
    await expect.poll(() => page.locator(".topbar").evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toBe("blur(9px) saturate(1.3)");
  }
  // Shared mode follows public edits immediately and retains the independent knobs.
  for (const section of [topbar, sidebar]) await section.getByRole("button", { name: "跟随公共", exact: true }).click();
  for (const title of ["玻璃外观"]) {
    const section = panel.locator("details").filter({ has: page.locator("summary").filter({ hasText: new RegExp(`^${title}`) }) }).last();
    if (await section.getAttribute("open") === null) await section.locator(":scope > summary").click();
  }
  await panel.getByRole("slider", { name: "面板透明度" }).fill("74");
  await panel.getByRole("slider", { name: "玻璃磨砂" }).fill("5");
  if (enabled) {
    await expect(panel).toHaveCSS("backdrop-filter", "blur(5px) saturate(1.3)");
    await expect.poll(() => page.locator(".topbar").evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toBe("blur(5px) saturate(1.3)");
    await expect.poll(() => page.locator(".topbar").evaluate(el => getComputedStyle(el, "::before").backgroundColor)).toContain("0.26");
  }
  for (const [section, label, alpha, blur] of [[topbar, "顶栏", "62", "9"], [sidebar, "侧栏", "80", "8"]]) {
    await section.getByRole("button", { name: "独立玻璃底板", exact: true }).click();
    await expect(section.getByRole("slider", { name: `${label}透明度` })).toHaveValue(alpha);
    await expect(section.getByRole("slider", { name: "模糊强度" })).toHaveValue(blur);
  }
  assert.deepEqual(await readState(page, Boolean(extension)), original);
  await capture(page, `${name}-independent`, [topbar, sidebar]);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  ({ panel, topbar, sidebar } = await openControls(page));
  for (const section of [topbar, sidebar]) {
    await expect(section.getByRole("button", { name: "跟随公共", exact: true })).toHaveAttribute("aria-pressed", "true");
    await section.getByRole("button", { name: "独立玻璃底板", exact: true }).click();
  }
  await expect(topbar.getByRole("slider", { name: "顶栏透明度" })).toHaveValue("68");
  await expect(topbar.getByRole("slider", { name: "模糊强度" })).toHaveValue("7");
  await topbar.getByRole("slider", { name: "顶栏透明度" }).fill("37");
  await sidebar.getByRole("slider", { name: "模糊强度" }).fill("0");
  for (const section of [topbar, sidebar]) await section.getByRole("button", { name: "跟随公共", exact: true }).click();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  const saved = await readState(page, Boolean(extension));
  assert.deepEqual(saved.wallpaper, { ...original.wallpaper, topbarTransparency: 37, sidebarBlur: 0 });
  for (const key of ["topbarOpacity", "topbarReadability", "topbarBlurEnabled", "sidebarBlurEnabled", "glassRefraction", "glassRefractionStrength"]) assert.equal(key in saved.wallpaper, false);
  ({ panel, topbar, sidebar } = await openControls(page));
  for (const section of [topbar, sidebar]) await expect(section.getByRole("button", { name: "跟随公共", exact: true })).toHaveAttribute("aria-pressed", "true");
  await topbar.getByRole("button", { name: "独立玻璃底板", exact: true }).click();
  await expect(topbar.getByRole("slider", { name: "顶栏透明度" })).toHaveValue("37");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await inspectPresets(page, Boolean(extension), name, enabled);
  reports.push({ name, width, presets: true, customSlots: true, previewCancelSave: true, zeroBlur: true, overflow: false });
  await page.close();
}
try {
  const browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    const context = await browser.newContext();
    for (const theme of ["light", "dark"]) for (const enabled of [true, false]) await inspect(context, false, theme, enabled);
  } finally { await browser.close(); }
  const extensionDirectory = resolve("dist-extension");
  const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mysimple-wallpaper-presets-")), {
    channel: "chromium", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: [`--disable-extensions-except=${extensionDirectory}`, `--load-extension=${extensionDirectory}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionURL = `chrome-extension://${new URL(worker.url()).host}/index.html`;
    for (const theme of ["light", "dark"]) for (const enabled of [true, false]) await inspect(context, extensionURL, theme, enabled);
  } finally { await context.close(); }
  assert.deepEqual(errors, []);
  await writeFile(join(output, "wallpaper-presets-report.json"), JSON.stringify({ version, screenshotCount, errors, reports }, null, 2));
  console.log(JSON.stringify({ version, screenshotCount, errors, scenarios: reports.length }));
} finally { server.close(); }
