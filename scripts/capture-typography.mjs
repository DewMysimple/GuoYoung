// Production desktop and native MV3 checks using synthetic collections/wallpaper.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const errors = [];
const metrics = [];
const screenshots = [];
const webURL = process.env.CAPTURE_URL ?? "http://127.0.0.1:4175";
const gates = { assetDatabaseMigration: [], installedFonts: [], localFontPersistence: [], offlineLocalFont: [], popup: [] };
const bundledFont = resolve("public/fonts/LXGWWenKai-Regular.woff2");
const legacyWallpaperKey = "typography-legacy-wallpaper";
const installedFonts = await Promise.all(["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/msyh.ttc"].map(async path => {
  try {
    const file = await stat(path);
    assert.ok(file.isFile(), `Expected a font file: ${path}`);
    return { path, format: extname(path).slice(1), available: true, bytes: file.size };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { path, format: extname(path).slice(1), available: false };
  }
}));
const wallpaper = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="sea" x2="1" y2="1"><stop stop-color="#c9e7ef"/><stop offset=".5" stop-color="#658ca5"/><stop offset="1" stop-color="#152e49"/></linearGradient><pattern id="wave" width="140" height="80" patternUnits="userSpaceOnUse"><path d="M-40 30Q20 2 70 30T180 30M-40 60Q20 32 70 60T180 60" stroke="#eafff7" stroke-opacity=".7" stroke-width="4" fill="none"/></pattern></defs><path d="M0 0h1920v1080H0z" fill="url(#sea)"/><path d="M0 0h1920v1080H0z" fill="url(#wave)"/></svg>`;

// Seed the actual old schema. The application file picker must perform the
// upgrade; the verification below opens without a version and cannot upgrade it.
async function seedLegacyWallpaper(page) {
  const bytes = Buffer.from(wallpaper);
  const before = await page.evaluate(({ key, bytes }) => new Promise((resolve, reject) => {
    const request = indexedDB.open("site-hub-assets", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("wallpapers");
    request.onblocked = () => reject(new Error("Legacy asset database creation is blocked"));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const version = database.version, stores = [...database.objectStoreNames];
      const transaction = database.transaction("wallpapers", "readwrite");
      transaction.objectStore("wallpapers").put(new Blob([new Uint8Array(bytes)], { type: "image/svg+xml" }), key);
      transaction.oncomplete = () => { database.close(); resolve({ version, stores }); };
      transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }), { key: legacyWallpaperKey, bytes: [...bytes] });
  assert.equal(before.version, 1, "The file picker starts with the legacy database");
  assert.deepEqual(before.stores, ["wallpapers"]);
  return { ...before, wallpaperBytes: bytes.length, wallpaperSha256: createHash("sha256").update(bytes).digest("hex") };
}

async function readStoredAssets(page, assetId) {
  return page.evaluate(async ({ assetId, wallpaperKey }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("site-hub-assets");
      request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error("Expected an existing asset database")); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const version = database.version, stores = [...database.objectStoreNames];
      const blobs = await new Promise((resolve, reject) => {
        const transaction = database.transaction(["wallpapers", "fonts"], "readonly");
        const wallpaper = transaction.objectStore("wallpapers").get(wallpaperKey);
        const font = transaction.objectStore("fonts").get(assetId);
        transaction.oncomplete = () => resolve({ wallpaper: wallpaper.result, font: font.result });
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
      const describe = async blob => {
        if (!(blob instanceof Blob)) throw new Error("Expected a readable persisted Blob");
        const bytes = await blob.arrayBuffer();
        const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map(value => value.toString(16).padStart(2, "0")).join("");
        return { bytes: blob.size, type: blob.type, sha256 };
      };
      return { version, stores, wallpaper: await describe(blobs.wallpaper), font: await describe(blobs.font) };
    } finally { database.close(); }
  }, { assetId, wallpaperKey: legacyWallpaperKey });
}

async function chooseAndSaveLocalFont(page, path, prefix, label) {
  const panel = await openFonts(page);
  await panel.getByRole("button", { name: "本地字体", exact: true }).click();
  await expect(panel.getByRole("button", { name: "选择已安装字体" })).toBeVisible();
  await panel.getByLabel("字体文件", { exact: true }).setInputFiles(path);
  await expect(panel.getByText(`当前字体：${basename(path, extname(path))}`, { exact: true })).toBeVisible();
  const name = page.locator(".site-card .site-name").first();
  await expect(name).toHaveCSS("font-family", /Mysimple_Local_/);
  const family = await name.evaluate(element => getComputedStyle(element).fontFamily.match(/Mysimple_Local_[\w-]+/)?.[0]);
  assert.ok(family, "Chosen file has a generated local family");
  const loaded = () => page.evaluate(family => [...document.fonts].some(face => face.family.replaceAll('"', "") === family && face.status === "loaded"), family);
  await expect.poll(loaded, { timeout: 30_000 }).toBe(true);
  await capture(page, `${prefix}-${label}-chosen`);
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(name).toHaveCSS("font-family", new RegExp(family));
  await expect.poll(loaded, { timeout: 30_000 }).toBe(true);
  const assetId = family.slice("Mysimple_Local_".length);
  const stored = await readStoredAssets(page, assetId);
  const bytes = await readFile(path), sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(stored.font.bytes, bytes.length, "The actual selected font is readable after reload");
  assert.equal(stored.font.sha256, sha256, "Persisted font bytes match the selected file");
  await inspectFontCoverage(page, `${prefix}-${label}-reloaded`);
  await capture(page, `${prefix}-${label}-reloaded`);
  return { family, assetId, loaded: true, reloadLoaded: true, fontBytes: bytes.length, fontSha256: sha256, stored };
}

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
  await saveScreenshot(page, name);
}

async function saveScreenshot(target, name) {
  await target.screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
  screenshots.push(name);
}

async function openFonts(page) {
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "字体调节" }).click();
  return panel;
}

async function expand(panel, title) {
  const summary = panel.locator("summary").filter({ hasText: title });
  if (!await summary.evaluate(element => element.parentElement.open)) await summary.click();
}

async function collapseFontSections(panel) {
  for (const title of ["效果微调", "文字增强", "文字颜色", "分区字号"]) {
    const summary = panel.locator("summary").filter({ hasText: title });
    if (await summary.count() && await summary.isVisible() && await summary.evaluate(element => element.parentElement.open)) await summary.click();
  }
}

async function inspectFontCoverage(page, label) {
  const coverage = await page.evaluate(() => {
    const family = getComputedStyle(document.documentElement).fontFamily;
    const text = [...document.querySelectorAll("body *")].filter(element => {
      if (element.closest(".typography-font-sample, .visually-hidden, script, style")) return false;
      const directText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      const input = element.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select');
      const box = element.getBoundingClientRect(), style = getComputedStyle(element);
      return (directText || input) && box.width && box.height && style.visibility === "visible";
    });
    return { family, count: text.length, mismatches: text.filter(element => getComputedStyle(element).fontFamily !== family)
      .map(element => ({ tag: element.tagName, class: element.className, family: getComputedStyle(element).fontFamily })) };
  });
  assert.ok(coverage.count > 0, label);
  assert.deepEqual(coverage.mismatches, [], label);
  metrics.push({ coverage: label, ...coverage });
}

async function inspectLayout(panel) {
  const layout = await panel.evaluate(element => {
    const buttons = [...element.querySelectorAll(".typography-fonts > button")];
    const rows = new Set(buttons.map(button => button.getBoundingClientRect().y)).size;
    const columns = new Set(buttons.map(button => button.getBoundingClientRect().x)).size;
    const inactive = buttons.find(button => button.getAttribute("aria-pressed") === "false");
    return { rows, columns, options: buttons.length, cardHeight: buttons[0].getBoundingClientRect().height,
      cardHeights: [...new Set(buttons.map(button => button.getBoundingClientRect().height))],
      samplesOverflow: [...element.querySelectorAll(".typography-font-sample")].some(sample => sample.scrollWidth > sample.clientWidth),
      background: getComputedStyle(inactive).backgroundColor,
      backgroundFilter: getComputedStyle(element.querySelector(".typography-preview-background")).filter,
      textFilter: getComputedStyle(element.querySelector(".typography-preview strong")).filter,
      expanded: element.querySelectorAll(".typography-settings details[open]").length,
      footerBackground: getComputedStyle(element.querySelector(".typography-family > details")).backgroundColor };
  });
  assert.equal(layout.rows, 2);
  assert.equal(layout.columns, 3);
  assert.equal(layout.options, 6);
  assert.equal(layout.cardHeights.length, 1);
  assert.equal(layout.samplesOverflow, false);
  assert.equal(layout.expanded, 0);
  assert.equal(layout.backgroundFilter, "blur(14px)");
  assert.equal(layout.textFilter, "none");
  assert.equal(layout.footerBackground, "rgba(0, 0, 0, 0)");
  // Chromium can serialize color-mix as color(srgb ... / alpha), not rgba.
  const alpha = Number(layout.background.match(/(?:,|\/)\s*([\d.]+)\)$/)?.[1] ?? 1);
  assert.ok(alpha >= 0 && alpha < .5, `Expected translucent font cards, got ${layout.background}`);
  metrics.push({ layout });
}

async function inspect(page, prefix) {
  const name = page.locator(".site-card .site-name").first();
  await capture(page, `${prefix}-before`);
  const panel = await openFonts(page);
  await inspectLayout(panel);
  await capture(page, `${prefix}-overview-light`);
  await saveScreenshot(panel, `${prefix}-panel-light`);
  await panel.getByRole("button", { name: "霞鹜文楷", exact: true }).click();
  assert.ok(await page.evaluate(async () => (await document.fonts.load('16px "LXGW WenKai"', "中文收藏")).length > 0));
  const size = panel.getByRole("slider", { name: "整体字号", exact: true });
  await expect(size).toBeVisible();
  let baselineSize, baselineIcons;
  for (const value of [100, 130, 70]) {
    await size.fill(String(value));
    await expect(page.locator("html")).toHaveCSS("font-size", `${16 * value / 100}px`);
    const currentSize = await name.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    const icons = await page.locator(".topbar svg").evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(); return { width: box.width, height: box.height };
    }));
    if (value === 100) { baselineSize = currentSize; baselineIcons = icons; }
    else {
      assert.ok(Math.abs(currentSize - baselineSize * value / 100) < .025, "Overall size applies once");
      assert.deepEqual(icons, baselineIcons, "Text scaling preserves SVG dimensions");
    }
    await inspectFontCoverage(page, `${prefix}-${value}`);
    await capture(page, `${prefix}-wenkai-${value}`);
  }
  await size.fill("110");
  await expand(panel, "文字颜色");
  await panel.getByRole("button", { name: "白色文字" }).click();
  await expand(panel, "文字增强");
  await expect(panel.getByRole("group", { name: "文字效果", exact: true }).getByRole("button")).toHaveText(["跟随主题", "无效果", "柔光"]);
  await expect(panel.getByRole("button", { name: /^(阴影|描边)$/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "文字增强说明", exact: true }).click();
  await expect(page.getByRole("tooltip")).toContainText("无壁纸时不额外增强");
  await capture(page, `${prefix}-theme-effect-help`);
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "柔光", exact: true }).click();
  await expand(panel, "效果微调");
  await panel.getByRole("slider", { name: "效果强度" }).fill("90");
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(name).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(name).not.toHaveCSS("text-shadow", "none");
  await expect(page.locator(".collection-heading h2")).not.toHaveCSS("text-shadow", "none");
  await capture(page, `${prefix}-white-glow`);
  await openFonts(page);
  await panel.locator(".settings-body").evaluate(element => { element.scrollTop = 0; });
  await capture(page, `${prefix}-settings-top`);
  await expand(panel, "文字颜色");
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
  await panel.locator("summary").filter({ hasText: "文字颜色" }).click();
  await panel.getByRole("button", { name: "默认字体", exact: true }).click();
  await expand(panel, "文字增强");
  for (const [label, suffix] of [["跟随主题", "theme"], ["无效果", "none"], ["柔光", "glow"]]) {
    await panel.getByRole("button", { name: label, exact: true }).click();
    if (label === "柔光") {
      await expand(panel, "效果微调");
      await panel.getByRole("slider", { name: "效果强度" }).fill("60");
    }
    await panel.locator(".settings-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await capture(page, `${prefix}-effect-${suffix}`);
  }
  await panel.getByRole("button", { name: "自定义文字效果颜色" }).click();
  const effectPicker = panel.getByRole("dialog", { name: "选择自定义颜色" });
  await effectPicker.getByRole("textbox", { name: "十六进制颜色" }).fill("ff0000");
  await effectPicker.getByRole("textbox", { name: "十六进制颜色" }).press("Enter");
  await panel.getByRole("button", { name: "自定义文字效果颜色" }).click();
  await capture(page, `${prefix}-effect-red-glow-60`);
  await panel.getByRole("slider", { name: "效果强度" }).fill("100");
  await capture(page, `${prefix}-effect-glow-100`);
  await panel.getByRole("slider", { name: "效果强度" }).fill("0");
  await expect(name).toHaveCSS("text-shadow", "none");
  await capture(page, `${prefix}-effect-glow-0`);
  await panel.getByRole("slider", { name: "效果强度" }).fill("65");
  await panel.getByRole("button", { name: "霞鹜文楷", exact: true }).click();
  await panel.getByRole("checkbox", { name: "允许选择展示文字" }).uncheck();
  await panel.getByRole("tab", { name: "外观", exact: true }).click();
  await panel.getByRole("button", { name: "深色", exact: true }).click();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(name).toHaveCSS("font-family", /LXGW WenKai/);
  await expect(name).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(name).not.toHaveCSS("text-shadow", "none");
  await expect(page.locator(".collection-heading h2")).toHaveCSS("user-select", "none");
  await capture(page, `${prefix}-glow-dark`);
  await openFonts(page);
  await inspectLayout(panel);
  await capture(page, `${prefix}-overview-dark`);
  await expand(panel, "文字增强");
  await expand(panel, "效果微调");
  await panel.getByRole("checkbox", { name: "允许选择展示文字" }).scrollIntoViewIfNeeded();
  await expect(panel.getByRole("heading", { name: "字体", exact: true })).toHaveCSS("color", "rgb(0, 0, 0)");
  await capture(page, `${prefix}-settings-effects`);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  for (const width of [360, 760]) {
    await page.evaluate(width => localStorage.setItem("site-hub:settings-panel-width", String(width)), width);
    await openFonts(page);
    await collapseFontSections(panel);
    await expect(panel).toHaveCSS("width", `${width}px`);
    await inspectLayout(panel);
    assert.equal(await panel.evaluate(element => element.scrollWidth > element.clientWidth), false);
    await capture(page, `${prefix}-panel-${width}`);
    await panel.getByRole("button", { name: "取消", exact: true }).click();
  }
  await page.evaluate(() => localStorage.setItem("site-hub:settings-panel-width", "440"));
  const platform = prefix === "typography-extension" ? "mv3" : "web";
  const before = await seedLegacyWallpaper(page);
  let local = await chooseAndSaveLocalFont(page, bundledFont, prefix, "local-font");
  assert.equal(local.stored.version, 2, "The font picker upgraded the legacy database to v2");
  assert.deepEqual(local.stored.stores, ["fonts", "wallpapers"]);
  assert.equal(local.stored.wallpaper.bytes, before.wallpaperBytes, "Legacy wallpaper size is preserved");
  assert.equal(local.stored.wallpaper.sha256, before.wallpaperSha256, "Legacy wallpaper bytes are preserved");
  assert.equal(local.stored.wallpaper.type, "image/svg+xml");
  gates.assetDatabaseMigration.push({ platform, status: "passed", fromVersion: before.version, toVersion: local.stored.version,
    storesBefore: before.stores, storesAfter: local.stored.stores, wallpaperKey: legacyWallpaperKey,
    wallpaperBytes: before.wallpaperBytes, wallpaperSha256: before.wallpaperSha256, wallpaperBytesPreserved: true,
    fontAssetId: local.assetId, fontBlobReadable: true, fontBytes: local.fontBytes, fontSha256: local.fontSha256 });
  gates.localFontPersistence.push({ platform, format: "woff2", status: "passed", family: local.family,
    assetId: local.assetId, loaded: local.loaded, reloadLoaded: local.reloadLoaded,
    fontBytes: local.fontBytes, fontSha256: local.fontSha256 });
  for (const font of installedFonts) {
    if (!font.available) {
      gates.installedFonts.push({ platform, format: font.format, path: font.path, status: "notavailable" });
      continue;
    }
    const installed = await chooseAndSaveLocalFont(page, font.path, prefix, `installed-${font.format}`);
    assert.equal(installed.fontBytes, font.bytes);
    assert.equal(installed.stored.wallpaper.sha256, before.wallpaperSha256, "Later font choices retain the old wallpaper");
    gates.installedFonts.push({ platform, format: font.format, path: font.path, status: "passed", family: installed.family,
      assetId: installed.assetId, loaded: installed.loaded, reloadLoaded: installed.reloadLoaded,
      fontBlobReadable: true, fontBytes: installed.fontBytes, fontSha256: installed.fontSha256 });
  }
  // Return to the bundled font for the offline and popup checks on every host.
  if (installedFonts.some(font => font.available)) local = await chooseAndSaveLocalFont(page, bundledFont, prefix, "local-font-restored");
  return local.family;
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, colorScheme: "light" });
  await prepare(page, webURL, false);
  await inspect(page, "typography-web");
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1"));
    state.wallpaper.source = "none";
    state.appearance.textColorMode = "theme";
    state.appearance.textEffect = "none";
    state.appearance.theme = "light";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await openFonts(page);
  await capture(page, "typography-web-no-wallpaper");
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
  const family = await inspect(page, "typography-extension");
  await context.setOffline(true);
  await page.reload();
  await expect.poll(() => page.evaluate(family => [...document.fonts].some(face => face.family.replaceAll('"', "") === family && face.status === "loaded"), family)).toBe(true);
  await expect(page.locator(".site-card .site-name").first()).toHaveCSS("font-family", new RegExp(family));
  await capture(page, "typography-extension-local-font-offline");
  gates.offlineLocalFont.push({ platform: "mv3", status: "passed", family, loaded: true });
  await context.setOffline(false);
  assert.equal(await page.evaluate(() => chrome.runtime.getManifest().version), manifest.version);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 440, height: 600 });
  popup.on("pageerror", error => errors.push(error.message));
  for (const value of [100, 130, 70]) {
    await page.evaluate(async value => {
      const key = "site-hub:v1", state = JSON.parse((await chrome.storage.local.get(key))[key]);
      state.appearance.fontScale = value;
      await chrome.storage.local.set({ [key]: JSON.stringify(state) });
    }, value);
    await popup.goto(`${origin}/popup.html`);
    await expect(popup.locator("html")).toHaveAttribute("data-text-selection", "disabled");
    await expect(popup.locator("input").first()).toHaveCSS("user-select", "text");
    await expect(popup.locator("html")).toHaveCSS("font-size", `${16 * value / 100}px`);
    await expect(popup.locator("html")).toHaveCSS("font-family", new RegExp(family));
    await expect.poll(() => popup.evaluate(family => [...document.fonts].some(face => face.family.replaceAll('"', "") === family && face.status === "loaded"), family)).toBe(true);
    await inspectFontCoverage(popup, `typography-popup-${value}`);
    await saveScreenshot(popup, `typography-popup-local-font-${value}`);
    gates.popup.push({ platform: "mv3", status: "passed", fontScale: value, family, loaded: true,
      rootFontSize: await popup.locator("html").evaluate(element => getComputedStyle(element).fontSize) });
  }
} finally { await context.close(); }
assert.deepEqual(errors, []);
await writeFile(join(output, "typography-metrics.json"), JSON.stringify({ webURL, screenshots, gates, metrics, errors }, null, 2));
console.log(JSON.stringify({ webURL, screenshots: screenshots.length, gates, layouts: metrics.filter(item => item.layout), errors, version: manifest.version }, null, 2));
