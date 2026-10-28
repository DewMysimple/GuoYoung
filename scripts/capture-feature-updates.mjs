import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const { version } = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${version}/screenshots`);
await mkdir(output, { recursive: true });
const reportPath = join(output, "feature-updates-report.json");
const report = { version, status: "running", captures: [], measurements: [], notes: [], help: [], motion: [], popup: [], errors: [], failures: [] };
const key = "site-hub:v1";
const initialNote = "设计参考：配色、排版与落地页案例。";
const editedNote = "已核对用途：界面布局与配色参考。\n" + "包含组件、动效和落地页资料，便于日后辨认。".repeat(8);
const wallpaperURL = "https://feature-wallpaper.example/background.svg";
const iconURL = "https://feature-icons.example/icon.svg";
const iconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="#397a9b"/><path fill="white" d="m16 32 16-16 16 16-16 16z"/></svg>';
const wallpaper = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#c3e2e6"/><stop offset=".5" stop-color="#247d9e"/><stop offset="1" stop-color="#152847"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1920v1080H0z"/><g fill="none" stroke="#e8f4f2" stroke-opacity=".4" stroke-width="3"><path d="M0 380Q400 0 1000 450T1920 300M0 900Q650 250 1300 800T1920 600"/></g></svg>';
const flushReport = () => writeFile(reportPath, JSON.stringify(report, null, 2));

function observe(page, mode) {
  page.on("pageerror", error => report.errors.push({ mode, message: error.message }));
}

async function readState(page, extension) {
  return page.evaluate(async ({ key, extension }) => JSON.parse(extension
    ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key)), { key, extension });
}

async function settle(page, locator) {
  await locator?.evaluate(element => Promise.all(element.getAnimations({ subtree: true })
    .filter(animation => Number.isFinite(animation.effect?.getTiming().iterations))
    .map(animation => animation.finished.catch(() => {}))));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function seed(page, extension, theme, withWallpaper, count = 4) {
  await page.evaluate(async ({ key, extension, theme, withWallpaper, wallpaperURL, iconURL, initialNote, count }) => {
    const state = JSON.parse(extension ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key));
    const stamp = "2026-10-28T00:00:00.000Z";
    state.groups = state.groups.filter(group => group.workspace === "github" || group.isProtected);
    state.groups.find(group => group.id === "other").order = count;
    state.sites = [];
    for (let i = 0; i < count; i++) {
      state.groups.push({ id: `feature-group-${i}`, name: `参考分组 ${i + 1}`, icon: "folder", workspace: "main",
        isProtected: false, order: i, createdAt: stamp, updatedAt: stamp });
      for (let j = 0; j < 12; j++) state.sites.push({ id: `feature-site-${i}-${j}`,
        name: i === 0 && j === 0 ? "界面参考" : `参考条目 ${i + 1} · ${j + 1}`,
        note: i === 0 && j === 0 ? initialNote : `用途：第 ${i + 1} 类参考资料`,
        url: `https://feature-example.com/${i}/${j}`, groupId: `feature-group-${i}`,
        iconSource: "custom", customIconUrl: iconURL, order: j, globalOrder: i * 12 + j,
        clickCount: j === 0 ? 77 : j + 1, createdAt: stamp, updatedAt: stamp });
    }
    state.displayModeByWorkspace.main = "grouped";
    state.sortModeByWorkspace.main = "manual";
    state.appearance = { ...state.appearance, theme, fontScale: 100, interfaceScale: 100, showSiteNotes: true,
      settingsPresentation: "overlay", contentWidthMode: "fixed", cardShape: "free", cardLayout: "adaptive", groupNavigationGap: 20 };
    state.wallpaper = { ...state.wallpaper, source: withWallpaper ? "url" : "none", url: wallpaperURL,
      overlay: 0, glassPanelTransparency: 88, glassBlur: 4 };
    if (extension) await chrome.storage.local.set({ [key]: JSON.stringify(state) });
    else localStorage.setItem(key, JSON.stringify(state));
  }, { key, extension, theme, withWallpaper, wallpaperURL, iconURL, initialNote, count });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("navigation", { name: "分组定位" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  assert.equal((await readState(page, extension)).version, 28, "Current schema version is retained");
  await settle(page);
  if (withWallpaper) await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(page.locator('.group-section-nav [aria-current="location"]')).toHaveText("参考分组 1");
}

async function capture(page, name, popup = false) {
  await settle(page);
  const metrics = await page.evaluate(() => {
    const nav = document.querySelector(".group-section-nav");
    const navRect = nav?.getBoundingClientRect();
    const content = document.querySelector(".grouped-site-sections")?.getBoundingClientRect();
    const footer = document.querySelector(".group-section-nav-footer")?.getBoundingClientRect();
    const noteBounds = [...document.querySelectorAll("[data-site-dnd-id]")].flatMap(card => {
      const box = card.getBoundingClientRect();
      return [...card.querySelectorAll(".site-note, .site-click-count, .site-category")]
        .filter(element => element.getClientRects().length).flatMap(element => {
          const rect = element.getBoundingClientRect();
          return rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1
            ? [{ site: card.dataset.siteDndId, className: element.className, bounds: rect.toJSON(), card: box.toJSON() }] : [];
        });
    });
    const popupButton = document.querySelector(".quick-page .popup-primary")?.getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
      nav: navRect?.width ? { x: navRect.x, bottom: navRect.bottom, footerBottom: footer.bottom,
        gap: content.left - navRect.right,
        expectedGap: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--group-nav-gap")) } : null,
      noteBounds, popupButtonBottom: popupButton?.bottom,
      active: nav?.querySelector('[aria-current="location"]')?.textContent };
  });
  report.measurements.push({ name, ...metrics });
  assert.equal(metrics.overflow, false, `${name}: horizontal overflow`);
  assert.deepEqual(metrics.noteBounds, [], `${name}: card note/count/category escape their card`);
  if (metrics.nav) {
    assert(metrics.nav.x >= 0 && metrics.nav.bottom <= metrics.height, `${name}: navigation bounds`);
    assert(metrics.nav.footerBottom <= metrics.height, `${name}: navigation footer reachable`);
    assert(Math.abs(metrics.nav.gap - metrics.nav.expectedGap) < 1, `${name}: navigation overlaps content`);
  }
  if (popup) assert(metrics.popupButtonBottom > 0 && metrics.popupButtonBottom <= 600, `${name}: popup action reachable`);
  await (popup ? page.locator(".popup-shell") : page).screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
  report.captures.push(name);
}

async function openSettings(page) {
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await expect(panel).toHaveCSS("transform", "none");
  return panel;
}

async function captureCombination(page, extension, mode, theme, withWallpaper) {
  const name = `features-${mode}-${theme}-${withWallpaper ? "wallpaper" : "plain"}`;
  await seed(page, extension, theme, withWallpaper);
  const card = page.locator('[data-testid="site-card-feature-site-0-0"]');
  await expect(card.locator(".site-note")).toHaveText(initialNote);
  await expect(card.locator(".site-click-count")).toHaveCount(0);
  await capture(page, `${name}-manual-notes`);
  await page.getByRole("button", { name: "手动排列", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "热量排列", exact: true }).click();
  await expect(card.locator(".site-click-count")).toHaveText("77");
  const ordering = await card.evaluate(element => {
    const heat = element.querySelector(".site-click-count").getBoundingClientRect();
    const note = element.querySelector(".site-note").getBoundingClientRect();
    const group = element.querySelector(".site-category").getBoundingClientRect();
    return { heatBottom: heat.bottom, noteTop: note.top, noteBottom: note.bottom, categoryTop: group.top };
  });
  assert(ordering.heatBottom <= ordering.noteTop + 1 && ordering.noteBottom <= ordering.categoryTop + 1,
    `${name}: heat, note and category stay in the requested order`);
  await capture(page, `${name}-heat-notes`);
  await card.hover();
  await card.getByRole("button", { name: "编辑 界面参考", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "编辑网站", exact: true });
  await settle(page, dialog);
  await expect(dialog.getByRole("textbox", { name: "网站备注", exact: true })).toHaveValue(initialNote);
  await dialog.getByRole("textbox", { name: "网站备注", exact: true }).fill(editedNote);
  const editorBounds = await dialog.getByRole("textbox", { name: "网站备注", exact: true }).evaluate(element => {
    const field = element.closest(".input-shell").getBoundingClientRect();
    const input = element.getBoundingClientRect();
    const next = element.closest(".field-group").nextElementSibling.getBoundingClientRect();
    return { field: field.toJSON(), input: input.toJSON(), nextTop: next.top };
  });
  report.measurements.push({ name: `${name}-editor`, ...editorBounds });
  assert(editorBounds.input.height >= 82 && editorBounds.input.width > editorBounds.field.width - 4,
    `${name}: multiline editor fills the full field`);
  assert(editorBounds.input.left >= editorBounds.field.left && editorBounds.input.right <= editorBounds.field.right
    && editorBounds.input.top >= editorBounds.field.top && editorBounds.input.bottom <= editorBounds.field.bottom
    && editorBounds.nextTop >= editorBounds.field.bottom, `${name}: multiline editor stays within its field`);
  await capture(page, `${name}-edit-note`);
  await dialog.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.locator(".site-note")).toHaveText(editedNote);
  await expect.poll(async () => (await readState(page, extension)).sites.find(site => site.id === "feature-site-0-0").note).toBe(editedNote);

  let panel = await openSettings(page);
  const notes = panel.getByRole("checkbox", { name: "显示网站备注", exact: true });
  await expect(notes).toBeChecked();
  await notes.uncheck();
  await expect(card.locator(".site-note")).toHaveCount(0);
  assert.equal((await readState(page, extension)).appearance.showSiteNotes, true, `${name}: preview does not persist`);
  await capture(page, `${name}-notes-hidden-preview`);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(card.locator(".site-note")).toHaveText(editedNote);
  panel = await openSettings(page);
  await panel.getByRole("checkbox", { name: "显示网站备注", exact: true }).uncheck();
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect.poll(async () => (await readState(page, extension)).appearance.showSiteNotes).toBe(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(card).toBeVisible();
  await expect(card.locator(".site-note")).toHaveCount(0);
  assert.equal((await readState(page, extension)).sites.find(site => site.id === "feature-site-0-0").note, editedNote);
  panel = await openSettings(page);
  await panel.getByRole("checkbox", { name: "显示网站备注", exact: true }).check();
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect.poll(async () => (await readState(page, extension)).appearance.showSiteNotes).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(card.locator(".site-note")).toHaveText(editedNote);
  panel = await openSettings(page);
  const layout = panel.getByRole("button", { name: "页面布局", exact: true });
  await expect(layout).toHaveAttribute("aria-expanded", "false");
  for (const preset of ["紧凑", "标准", "宽松"]) await expect(panel.getByRole("button", { name: preset, exact: true })).toBeVisible();
  await expect(panel.getByRole("group", { name: "页面宽度模式", exact: true })).toBeHidden();
  await capture(page, `${name}-layout-collapsed`);
  for (const [label, text] of [["界面缩放说明", "一起调整卡片、文字、图标与间距"], ["主题说明", "选择界面的明暗"],
    ["页面布局说明", "选择喜欢的疏密"]]) {
    await panel.getByRole("button", { name: label, exact: true }).focus();
    await expect(page.getByRole("tooltip")).toContainText(text);
    const bounds = await page.getByRole("tooltip").boundingBox();
    const viewport = page.viewportSize();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1,
      `${name}: ${label} tooltip stays visible`);
    report.help.push({ name, label, text: await page.getByRole("tooltip").innerText(), bounds });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(layout).toHaveAttribute("aria-expanded", "false");
  }
  await layout.click();
  await panel.getByRole("button", { name: "正方形", exact: true }).click();
  await panel.getByRole("button", { name: "卡片排列说明", exact: true }).click();
  await expect(page.getByRole("tooltip")).toContainText("根据卡片最小宽度自动排列");
  await expect(page.getByRole("tooltip")).toContainText("正方形的高度始终跟随实际宽度");
  report.help.push({ name, label: "卡片排列说明", text: await page.getByRole("tooltip").innerText(), bounds: await page.getByRole("tooltip").boundingBox() });
  await capture(page, `${name}-layout-expanded-help`);
  await page.keyboard.press("Escape");
  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  const fontScale = panel.getByRole("spinbutton", { name: "整体字号数值", exact: true });
  await fontScale.fill("130");
  await fontScale.press("Enter");
  await expect(panel.getByRole("slider", { name: "整体字号", exact: true })).toHaveValue("130");
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(card.locator(".site-note")).toHaveText(editedNote);
  await capture(page, `${name}-square-130-heat-notes`);
  report.notes.push({ name, sortModes: ["manual", "heat"], editedNote, ordering,
    hiddenPreviewCancelled: true, hiddenSaveReload: true, restoredSaveReload: true, squareFontScale: 130 });
  await flushReport();
}

async function captureMotion(page, extension, mode) {
  await seed(page, extension, "dark", true, 18);
  await settle(page);
  const trace = await page.evaluate(async () => {
    const offset = document.querySelector(".topbar").getBoundingClientRect().bottom + 24;
    const sections = [...document.querySelectorAll("[data-group-sort-section-id]")]
      .map(section => ({ id: section.dataset.groupSortSectionId, top: scrollY + section.getBoundingClientRect().top }));
    const start = scrollY, height = innerHeight;
    const target = Math.max(0, Math.min(sections.find(section => section.id === "feature-group-14").top - offset,
      document.documentElement.scrollHeight - innerHeight));
    const original = HTMLElement.prototype.getBoundingClientRect;
    let reads = 0;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute("data-group-sort-section-id")) reads++;
      return original.call(this);
    };
    try {
      const startedAt = performance.now();
      document.querySelector('.group-section-nav button[aria-label="定位到 参考分组 15"]').click();
      const clickReads = reads;
      const samples = [];
      let settled = 0;
      while (settled < 6) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        let group = sections[0].id;
        for (const section of sections) if (section.top <= scrollY + offset + 1) group = section.id;
        samples.push({ time: performance.now(), y: scrollY, group });
        settled = Math.abs(scrollY - target) < 2 ? settled + 1 : 0;
        if (performance.now() - startedAt > 15_000) throw new Error("Long navigation did not finish within 15 seconds");
      }
      return { start, target, height, samples, elapsedMs: performance.now() - startedAt, clickReads, scrollingReads: reads - clickReads };
    } finally { HTMLElement.prototype.getBoundingClientRect = original; }
  });
  assert(trace.target - trace.start > 2 * trace.height, `${mode}: navigation spans multiple viewports`);
  assert(new Set(trace.samples.filter(sample => sample.y > trace.start + 2 && sample.y < trace.target - 2).map(sample => sample.y)).size > 2,
    `${mode}: multiple intermediate positions`);
  assert(new Set(trace.samples.map(sample => sample.group)).size >= 5, `${mode}: several actual document groups pass the reading line`);
  assert.equal(trace.scrollingReads, 0, `${mode}: scrolling reuses document group coordinates`);
  assert(trace.elapsedMs >= (trace.target - trace.start) / (trace.height * 1.8) * 1000 * .8, `${mode}: long navigation remains readable`);
  report.motion.push({ mode, ...trace });
  await capture(page, `features-${mode}-long-navigation`);
  await flushReport();
}

async function inspectPlatform(context, url, extension, mode) {
  const page = await context.newPage();
  observe(page, mode);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route(wallpaperURL, route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.route(iconURL, route => route.fulfill({ contentType: "image/svg+xml", body: iconSVG }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "打开设置", exact: true })).toBeVisible();
  try {
    for (const theme of ["light", "dark"]) for (const withWallpaper of [false, true]) {
      await captureCombination(page, extension, mode, theme, withWallpaper);
    }
    await captureMotion(page, extension, mode);
  } finally { await page.close(); }
}

async function inspectPopup(context, worker, origin) {
  for (const theme of ["light", "dark"]) for (const workspace of ["main", "github"]) {
    const name = `features-popup-${theme}-${workspace}`;
    const url = workspace === "github" ? `https://github.com/capture-check/notes-${theme}` : `https://feature-current.example/${theme}`;
    const before = await worker.evaluate(async ({ key, theme }) => {
      const state = JSON.parse((await chrome.storage.local.get(key))[key]);
      state.appearance.theme = theme;
      await chrome.storage.local.set({ [key]: JSON.stringify(state) });
      return state;
    }, { key, theme });
    const page = await context.newPage();
    observe(page, "popup");
    await page.setViewportSize({ width: 440, height: 600 });
    // Only the current-tab input is a fixture; collection read/write uses the
    // real MV3 chrome.storage API, as in capture-popup.mjs.
    await page.addInitScript(url => Object.defineProperty(window.chrome.tabs, "query", {
      configurable: true, value: async () => [{ id: 42, title: "当前网页 · 验证资料", url }],
    }), url);
    try {
      await page.goto(`${origin}/popup.html`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("textbox", { name: "网站名称", exact: true })).toHaveValue("当前网页 · 验证资料");
      await page.getByRole("button", { name: "新建分组", exact: true }).click();
      await page.getByRole("textbox", { name: "新分组名称", exact: true }).fill("取消的临时草稿");
      await page.getByRole("button", { name: "取消新建分组", exact: true }).click();
      const cancelled = await worker.evaluate(async key => JSON.parse((await chrome.storage.local.get(key))[key]), key);
      assert.deepEqual(cancelled, before, `${name}: cancellation creates no group or site`);
      await page.getByRole("button", { name: "新建分组", exact: true }).click();
      const groupName = `生产核对 · ${theme} · ${workspace}`;
      await page.getByRole("textbox", { name: "新分组名称", exact: true }).fill(groupName);
      await capture(page, `${name}-new-group`, true);
      await page.getByRole("button", { name: "新建分组并添加", exact: true }).click();
      await expect(page.getByRole("status")).toContainText(`已新建“${groupName}”，并添加当前网站。`);
      const after = await worker.evaluate(async key => JSON.parse((await chrome.storage.local.get(key))[key]), key);
      assert.equal(after.version, 28, `${name}: schema version retained`);
      const group = after.groups.find(group => group.name === groupName && group.workspace === workspace);
      const site = after.sites.find(site => site.url === url);
      assert(group && site && site.groupId === group.id, `${name}: current site is saved into the created workspace group`);
      assert.equal(after.groups.length, before.groups.length + 1);
      assert.equal(after.sites.length, before.sites.length + 1);
      for (const previous of before.sites) assert.equal(after.sites.find(site => site.id === previous.id)?.note, previous.note, `${name}: existing notes preserved`);
      await capture(page, `${name}-saved`, true);
      report.popup.push({ name, workspace, theme, url, group, site, storage: "real chrome.storage.local", currentTab: "tabs.query fixture", cancellationUnchanged: true });
      await flushReport();
    } finally { await page.close(); }
  }
}

try {
  const browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  try { await inspectPlatform(await browser.newContext(), process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:48261", false, "web"); }
  finally { await browser.close(); }
  if (!process.argv.includes("--web-only")) {
    const extension = resolve("dist-extension");
    const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mysimple-features-")), {
      channel: "chromium", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      const origin = `chrome-extension://${new URL(worker.url()).host}`;
      assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().version), version);
      await inspectPlatform(context, `${origin}/index.html`, true, "extension");
      await inspectPopup(context, worker, origin);
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []);
  report.status = "complete";
  console.log(JSON.stringify({ screenshots: report.captures.length, combinations: report.notes.length, motion: report.motion.length, popup: report.popup.length, errors: report.errors }));
} catch (error) {
  report.status = "failed";
  report.failures.push({ message: error.message, stack: error.stack, actual: error.actual, expected: error.expected, operator: error.operator });
  throw error;
} finally { await flushReport(); }
