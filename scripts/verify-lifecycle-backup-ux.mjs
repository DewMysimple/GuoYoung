// Production webpage / real MV3 acceptance using synthetic collections and repo-licensed Manrope.
// Build both modes and start the production preview before running this script.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const key = "site-hub:v1";
const base = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4175";
const { version } = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${version}/screenshots`);
const fontPath = resolve("node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2");
await mkdir(output, { recursive: true });
const report = { version, environments: [], captures: [], errors: [], externalRequestsBlocked: 0 };
const fontNotice = page => page.getByRole("status", { name: "字体恢复提示", exact: true });
const panel = page => page.getByRole("dialog", { name: "设置", exact: true });
const dataPage = page => page.getByRole("region", { name: "数据页面", exact: true });

async function state(page, extension) {
  return page.evaluate(async ({ key, extension }) => JSON.parse(extension
    ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key)), { key, extension });
}
async function persist(page, extension, value) {
  await page.evaluate(async ({ key, extension, value }) => {
    if (extension) await chrome.storage.local.set({ [key]: JSON.stringify(value) });
    else localStorage.setItem(key, JSON.stringify(value));
  }, { key, extension, value });
}
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflows horizontally`);
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true, animations: "disabled" });
  report.captures.push(name);
}
async function waitForFont(page, assetId) {
  await expect.poll(() => page.evaluate(assetId => [...document.fonts].some(face =>
    face.family.replaceAll('"', "") === `Mysimple_Local_${assetId}` && face.status === "loaded"), assetId)).toBe(true);
}
async function verifyMissingFontFallback(page, assetId) {
  const evidence = await page.evaluate(async assetId => {
    await document.fonts.ready;
    const family = `Mysimple_Local_${assetId}`;
    const registered = [...document.fonts].some(face => face.family.replaceAll('"', "") === family);
    const currentStack = getComputedStyle(document.body).fontFamily;
    const defaultStack = '"Manrope Variable", "PingFang SC", "Microsoft YaHei", sans-serif';
    const render = stack => {
      const canvas = document.createElement("canvas");
      canvas.width = 800; canvas.height = 80;
      const drawing = canvas.getContext("2d");
      drawing.font = `32px ${stack}`;
      const sample = "Mysimple Aa 012345";
      drawing.fillText(sample, 0, 45);
      return { width: drawing.measureText(sample).width, pixels: drawing.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const current = render(currentStack), fallback = render(defaultStack);
    return { family, registered, currentStack, expectedFamilyInCss: currentStack.includes(family),
      currentWidth: current.width, fallbackWidth: fallback.width,
      visibleChannels: current.pixels.filter(channel => channel > 0).length,
      differentChannels: current.pixels.reduce((count, channel, index) => count + Number(channel !== fallback.pixels[index]), 0) };
  }, assetId);
  assert.equal(evidence.registered, false, "A missing font must not be present in the document FontFaceSet");
  assert.equal(evidence.expectedFamilyInCss, true, "Fallback must not permanently remove the imported CSS font reference");
  assert.ok(evidence.currentWidth > 0 && evidence.visibleChannels > 0);
  assert.equal(evidence.currentWidth, evidence.fallbackWidth);
  assert.equal(evidence.differentChannels, 0, "The missing-family stack must render exactly like the normal fallback stack");
  return evidence;
}
async function chooseFont(page) {
  await panel(page).getByRole("button", { name: "本地字体", exact: true }).click();
  await panel(page).getByLabel("字体文件", { exact: true }).setInputFiles(fontPath);
  await expect(panel(page).getByText("当前字体：manrope-latin-wght-normal", { exact: true })).toBeVisible();
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
}
async function openFonts(page) {
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  await panel(page).getByRole("tab", { name: "字体调节", exact: true }).click();
}
async function importFile(page, payload, destination = "replace") {
  if (!await dataPage(page).count()) await page.getByRole("button", { name: "打开数据", exact: true }).click();
  await page.getByRole("button", { name: "导入", exact: true }).click();
  await page.getByLabel("选择要导入的数据文件").setInputFiles({ name: "synthetic-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)) });
  if (destination === "replace") {
    await page.getByRole("button", { name: "导入方式", exact: true }).click();
    await page.getByRole("option", { name: "替换全局数据", exact: true }).click();
  }
  await page.getByRole("button", { name: "预览并导入", exact: true }).click();
  if (destination === "replace") await expect(page.getByRole("alertdialog", { name: "导入并替换收藏？", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
}
async function savedImport(page, sites = 2) {
  await expect(dataPage(page).getByRole("status").filter({ hasText: `已导入 ${sites} 个网站` })).toBeVisible();
}
async function saveProbe(page, extension) {
  await page.evaluate(({ key, extension }) => {
    const probe = window.__backupSaveProbe = { reject: true, calls: 0 };
    if (extension) {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      Object.defineProperty(chrome.storage.local, "set", { configurable: true, value: async values => {
        if (key in values) {
          probe.calls++;
          if (probe.reject) throw new Error("Synthetic write rejection");
        }
        return original(values);
      } });
    } else {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key) {
          probe.calls++;
          if (probe.reject) throw new DOMException("Synthetic write rejection", "QuotaExceededError");
        }
        return original.call(this, name, value);
      };
    }
  }, { key, extension });
}
async function prepareContext(context, extension) {
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (!/^https?:$/.test(url.protocol) || url.origin === new URL(base).origin) return route.continue();
    report.externalRequestsBlocked++;
    return route.abort("internetdisconnected");
  });
  if (extension) await context.addInitScript(() => {
    // Only history/search APIs are fixtures; runtime, storage, IndexedDB and FontFace remain native.
    window.__historyProbe = { searches: 0, deletes: 0, webSearches: 0 };
    const items = [{ id: "synthetic-history", title: "Lifecycle History", url: "https://history.example/Docs?view=AbC#entry", lastVisitTime: Date.now(), visitCount: 2 }];
    const originalContains = chrome.permissions.contains.bind(chrome.permissions);
    Object.defineProperty(chrome.permissions, "contains", { configurable: true, value: (details, callback) => {
      if (!details.permissions?.includes("history")) return originalContains(details, callback);
      const result = Promise.resolve(true);
      if (callback) result.then(callback);
      return result;
    } });
    Object.defineProperty(chrome, "history", { configurable: true, value: {
      search(details, callback) {
        window.__historyProbe.searches++;
        const result = items.filter(item => !details.text || `${item.title} ${item.url}`.toLowerCase().includes(details.text.toLowerCase()));
        if (callback) queueMicrotask(() => callback(result));
        return Promise.resolve(result);
      },
      deleteUrl() { window.__historyProbe.deletes++; return Promise.resolve(); },
    } });
    Object.defineProperty(chrome.search, "query", { configurable: true, value: async () => { window.__historyProbe.webSearches++; } });
  });
}
async function newPage(context, url, prefix) {
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(`${prefix}: ${error.message}`));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "打开数据", exact: true })).toBeVisible();
  return page;
}
async function sourceBackup(context, url, extension) {
  const prefix = extension ? "extension" : "web";
  const result = { environment: `${prefix}-source`, sameEnvironmentFont: false };
  report.environments.push(result);
  const page = await newPage(context, url, prefix);
  result.userAgent = await page.evaluate(() => navigator.userAgent);
  const seeded = await state(page, extension);
  seeded.appearance.theme = "light";
  seeded.wallpaper.source = "none";
  const group = seeded.groups.find(group => group.workspace === "main");
  const github = seeded.groups.find(group => group.workspace === "github");
  const stamp = "2026-10-31T00:00:00Z";
  seeded.sites = [
    { id: "backup-main", name: "Synthetic Main", url: "https://collection.example/Docs?view=AbC#entry", groupId: group.id, order: 0, globalOrder: 0, clickCount: 0, createdAt: stamp, updatedAt: stamp },
    { id: "backup-github", name: "Synthetic Repository", url: "https://github.com/example/Synthetic", groupId: github.id, order: 0, globalOrder: 1, clickCount: 0, createdAt: stamp, updatedAt: stamp },
  ];
  await persist(page, extension, seeded);
  await page.reload();
  await openFonts(page);
  await chooseFont(page);
  await panel(page).getByRole("button", { name: "保存设置", exact: true }).click();
  await expect.poll(async () => (await state(page, extension)).appearance.customFontAssetId).toMatch(/^font-/);
  const selected = (await state(page, extension)).appearance.customFontAssetId;
  await waitForFont(page, selected);
  await page.getByRole("button", { name: "打开数据", exact: true }).click();
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await expect(dataPage(page)).toContainText(/字体文件/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  const exported = JSON.parse(await readFile(await (await downloadPromise).path(), "utf8"));
  assert.equal(exported.state.appearance.customFontAssetId, selected);
  assert.equal(exported.state.sites.length, 2);
  assert.deepEqual(exported.state.searchHistory, []);
  assert.deepEqual(exported.state.deletedSites, []);
  await capture(page, `${prefix}-backup-export-boundary`);
  await importFile(page, exported);
  await savedImport(page);
  await waitForFont(page, selected);
  await expect(fontNotice(page)).toHaveCount(0);
  assert.equal((await state(page, extension)).appearance.customFontAssetId, selected);
  result.sameEnvironmentFont = true;
  await capture(page, `${prefix}-backup-font-available`);
  await page.reload();
  await waitForFont(page, selected);
  assert.equal((await state(page, extension)).appearance.customFontAssetId, selected);
  result.sameEnvironmentReload = true;
  await page.close();
  return exported;
}
async function checkFocus(page, inputLabel, clearLabel, workspace, results) {
  const input = page.getByRole("searchbox", { name: inputLabel, exact: true });
  const clear = page.getByRole("button", { name: clearLabel, exact: true });
  for (const method of ["mouse", "Enter", "Space"]) {
    await input.fill("first");
    if (method === "mouse") await clear.click();
    else {
      await input.press("Tab");
      await expect(clear).toBeFocused();
      await clear.press(method);
    }
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    await expect(clear).toHaveCount(0);
    await page.keyboard.type("next");
    await expect(input).toHaveValue("next");
    assert.equal(await input.evaluate(element => document.activeElement === element), true);
    results.push({ workspace, method, activeElementIsInput: true, nextValue: await input.inputValue() });
    await clear.click();
  }
}
async function dailyUx(page, extension, result) {
  const prefix = extension ? "extension" : "web";
  await page.getByRole("button", { name: "打开收藏主页", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "搜索网页或筛选收藏", exact: true })).not.toBeFocused();
  result.searchFocus = [];
  await checkFocus(page, "搜索网页或筛选收藏", "清空搜索", "main", result.searchFocus);
  await page.getByRole("button", { name: "打开 GitHub 收藏", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "搜索网页或筛选收藏", exact: true })).not.toBeFocused();
  await checkFocus(page, "搜索网页或筛选收藏", "清空搜索", "github", result.searchFocus);
  if (extension) {
    const before = await page.evaluate(() => ({ ...window.__historyProbe }));
    const searches = (await state(page, extension)).searchHistory;
    await page.getByRole("button", { name: "打开历史记录", exact: true }).click();
    await expect(page.getByRole("searchbox", { name: "搜索浏览历史", exact: true })).toBeVisible();
    await checkFocus(page, "搜索浏览历史", "清空历史搜索", "history", result.searchFocus);
    assert.equal(await page.evaluate(() => window.__historyProbe.deletes), before.deletes);
    assert.equal(await page.evaluate(() => window.__historyProbe.webSearches), before.webSearches);
    assert.deepEqual((await state(page, extension)).searchHistory, searches);
    result.historyApiFixture = true;
    await capture(page, `${prefix}-search-clear-history`);
  } else result.history = "not applicable: web mode has no browser-history API";
  await page.getByRole("button", { name: "打开收藏主页", exact: true }).click();
  result.headerGeometry = [];
  for (const width of [980, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const trash = page.getByRole("button", { name: "打开回收站", exact: true });
    await expect(trash).toHaveText("回收站");
    await expect(trash).toHaveAttribute("title", "回收站");
    const buttons = await page.locator(".topbar-actions > button, .topbar-actions > .topbar-add").evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, right: bounds.right, width: bounds.width };
    }));
    for (let index = 0; index < buttons.length - 1; index++) assert.ok(buttons[index].right <= buttons[index + 1].x, "Header buttons must not overlap");
    result.headerGeometry.push({ width, buttons });
    await capture(page, `${prefix}-trash-header-${width}`);
  }
  await page.getByRole("button", { name: "打开回收站", exact: true }).click();
  await expect(panel(page).getByText("链接回收站", { exact: true }).first()).toBeVisible();
  await panel(page).getByRole("button", { name: "取消", exact: true }).click();
  result.trashOpensExistingSettings = true;
}
async function cleanRestore(context, url, extension, backup) {
  const prefix = extension ? "extension" : "web";
  const result = { environment: `${prefix}-clean` };
  report.environments.push(result);
  const page = await newPage(context, url, prefix);
  result.userAgent = await page.evaluate(() => navigator.userAgent);
  if (extension) result.extensionId = new URL(url).host;
  const original = await state(page, extension);
  const hasFontBlob = await page.evaluate(async assetId => {
    if (!(await indexedDB.databases()).some(database => database.name === "site-hub-assets")) return false;
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open("site-hub-assets");
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const database = opening.result;
        const read = database.transaction("fonts", "readonly").objectStore("fonts").get(assetId);
        read.onerror = () => { database.close(); reject(read.error); };
        read.onsuccess = () => { database.close(); resolve(read.result instanceof Blob); };
      };
    });
  }, backup.state.appearance.customFontAssetId);
  assert.equal(hasFontBlob, false);
  result.noFontBlobBeforeImport = true;
  await saveProbe(page, extension);
  await importFile(page, backup);
  await expect(dataPage(page).getByRole("alert")).toContainText("尚未确认保存成功");
  await expect(fontNotice(page)).toHaveCount(0);
  assert.deepEqual(await state(page, extension), original);
  await capture(page, `${prefix}-backup-save-failure`);
  await page.evaluate(() => { window.__backupSaveProbe.reject = false; });
  await page.getByRole("button", { name: "重试保存导入结果", exact: true }).click();
  await savedImport(page);
  await expect(fontNotice(page)).toContainText("收藏已保存");
  await expect(fontNotice(page)).toContainText("未找到");
  const missing = backup.state.appearance.customFontAssetId;
  result.missingFontFallback = await verifyMissingFontFallback(page, missing);
  const saved = await state(page, extension);
  assert.equal(saved.appearance.customFontAssetId, missing);
  assert.deepEqual(saved.sites, backup.state.sites);
  assert.equal(await page.evaluate(() => window.__backupSaveProbe.calls), 2);
  result.saveFailureThenRetry = true;
  result.savedCollectionWithMissingFont = true;
  await capture(page, `${prefix}-backup-missing-font`);
  await fontNotice(page).getByRole("button", { name: "打开字体设置", exact: true }).click();
  await expect(panel(page).getByRole("tab", { name: "字体调节", exact: true })).toHaveAttribute("aria-selected", "true");
  await chooseFont(page);
  assert.equal((await state(page, extension)).appearance.customFontAssetId, missing, "Choosing a draft font must not write the saved import configuration");
  await panel(page).getByRole("button", { name: "取消", exact: true }).click();
  assert.equal((await state(page, extension)).appearance.customFontAssetId, missing);
  await expect(fontNotice(page)).toBeVisible();
  result.cancelKeepsImportedConfiguration = true;
  await fontNotice(page).getByRole("button", { name: "打开字体设置", exact: true }).click();
  await chooseFont(page);
  await panel(page).getByRole("button", { name: "保存设置", exact: true }).click();
  await expect.poll(async () => (await state(page, extension)).appearance.customFontAssetId).not.toBe(missing);
  const restored = (await state(page, extension)).appearance.customFontAssetId;
  await waitForFont(page, restored);
  await expect(fontNotice(page)).toHaveCount(0);
  await page.reload();
  await waitForFont(page, restored);
  assert.equal((await state(page, extension)).appearance.customFontAssetId, restored);
  result.reselectSaveReload = true;
  await capture(page, `${prefix}-backup-restored-font`);

  result.noFalseWarning = [];
  for (const [family, name] of [["default", ""], ["system", ""], ["custom", "Arial"]]) {
    const imported = structuredClone(backup);
    imported.state.appearance.fontFamily = family;
    imported.state.appearance.customFontFamily = name;
    delete imported.state.appearance.customFontAssetId;
    await importFile(page, imported);
    await savedImport(page);
    await expect(fontNotice(page)).toHaveCount(0);
    result.noFalseWarning.push({ family, systemName: name });
  }
  const beforeGroupsOnly = await state(page, extension);
  await importFile(page, backup, "new");
  await savedImport(page, 0);
  await expect(dataPage(page).getByRole("status").filter({ hasText: "跳过 2 个链接" })).toBeVisible();
  await expect(fontNotice(page)).toHaveCount(0);
  const afterGroupsOnly = await state(page, extension);
  assert.deepEqual(afterGroupsOnly.appearance, beforeGroupsOnly.appearance);
  assert.deepEqual(afterGroupsOnly.wallpaper, beforeGroupsOnly.wallpaper);
  result.groupAppendIgnoresBackupAppearance = true;
  await dailyUx(page, extension, result);
  await page.close();
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
report.webBrowserVersion = browser.version();
try {
  const source = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await prepareContext(source, false);
  const backup = await sourceBackup(source, base, false);
  await source.close();
  const clean = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await prepareContext(clean, false);
  await cleanRestore(clean, base, false, backup);
  await clean.close();
} finally { await browser.close(); }
const extension = resolve("dist-extension");
async function extensionContext() {
  const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mysimple-backup-ux-")), {
    channel: "chromium", headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  await prepareContext(context, true);
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  report.extensionBrowserVersion = context.browser().version();
  return { context, url: `chrome-extension://${new URL(worker.url()).host}/index.html` };
}
const source = await extensionContext();
let backup;
try { backup = await sourceBackup(source.context, source.url, true); }
finally { await source.context.close(); }
const clean = await extensionContext();
try { await cleanRestore(clean.context, clean.url, true, backup); }
finally { await clean.context.close(); }
assert.deepEqual(report.errors, []);
await writeFile(join(output, "lifecycle-backup-ux-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ version, captures: report.captures.length, webBrowserVersion: report.webBrowserVersion,
  extensionBrowserVersion: report.extensionBrowserVersion, environments: report.environments, externalRequestsBlocked: report.externalRequestsBlocked, errors: report.errors }));
