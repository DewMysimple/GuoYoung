// Production web and native MV3 settings controls. All data and artwork are synthetic.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";

const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const report = { version: manifest.version, matrix: [], interactions: [], screenshots: [], errors: [] };
const wallpaperURL = "https://settings-options.example/wallpaper.svg";
const wallpaper = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#abc8dc"/><stop offset=".55" stop-color="#647c96"/><stop offset="1" stop-color="#3b5076"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><circle cx="1250" cy="360" r="260" fill="#cba475"/></svg>';
const logo = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#3367d6"/><circle cx="80" cy="50" r="30" fill="#ffe2a7"/></svg>';
let server, browser;
let webURL = process.env.CAPTURE_URL;
if (!webURL) {
  const root = resolve("dist");
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    try { response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  webURL = `http://127.0.0.1:${server.address().port}`;
}

async function readState(page, native) {
  return page.evaluate(async native => JSON.parse(native
    ? (await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"] : localStorage.getItem("site-hub:v1")), native);
}

function syntheticState(base, theme, withWallpaper) {
  const state = structuredClone(base);
  state.appearance = { ...state.appearance, theme, accentColor: "#3367d6", interfaceScale: 100, fontScale: 100,
    settingsPresentation: "overlay", textColorMode: "theme", fontFamily: "default", allowTextSelection: false };
  state.wallpaper = { ...state.wallpaper, source: withWallpaper ? "url" : "none", url: wallpaperURL };
  state.trashRetentionDays = 30;
  const site = state.sites.find(item => item.id === "github");
  state.deletedSites = [{ site: { ...site, id: "options-trash", name: "设置选项回收站示例" },
    originalGroupId: site.groupId, originalGroupName: "其他", deletedAt: new Date().toISOString() }];
  return state;
}

async function seed(page, native, state) {
  await page.evaluate(async ({ native, state }) => {
    localStorage.setItem("site-hub:settings-panel-width", "440");
    if (native) await chrome.storage.local.set({ "site-hub:v1": JSON.stringify(state) });
    else localStorage.setItem("site-hub:v1", JSON.stringify(state));
  }, { native, state });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "打开设置", exact: true })).toBeVisible();
  if (state.wallpaper.source === "url") await page.locator(".wallpaper-layer img").evaluate(image => image.decode());
  await page.evaluate(() => document.fonts.ready);
}

async function openSettings(page, tab) {
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: tab, exact: true }).click();
  return panel;
}

async function expand(panel, title) {
  const summary = panel.locator("summary").filter({ hasText: new RegExp(`^${title}`) });
  if (!await summary.evaluate(element => element.parentElement.open)) await summary.click();
}

async function choose(group, name, role = "button") {
  const option = group.getByRole(role, { name, exact: true });
  await option.click();
  await expect(option).toHaveAttribute(role === "radio" ? "aria-checked" : "aria-pressed", "true");
}

async function auditSwatches(panel) {
  const geometry = await panel.getByRole("group", { name: "主题色选择", exact: true })
    .locator('.settings-option[data-variant="swatch"]').evaluateAll(buttons => buttons.map(button => {
      const sample = button.querySelector(".settings-option-color");
      const shell = button.getBoundingClientRect(), color = sample.getBoundingClientRect();
      const css = getComputedStyle(button), sampleCSS = getComputedStyle(sample);
      const length = property => parseFloat(css.getPropertyValue(property));
      const horizontal = length("padding-left") + length("padding-right") + length("border-left-width") + length("border-right-width");
      const vertical = length("padding-top") + length("padding-bottom") + length("border-top-width") + length("border-bottom-width");
      const shellWidth = parseFloat(css.width) + (css.boxSizing === "border-box" ? 0 : horizontal);
      const shellHeight = parseFloat(css.height) + (css.boxSizing === "border-box" ? 0 : vertical);
      const scaleX = shell.width / shellWidth, scaleY = shell.height / shellHeight;
      const radius = property => {
        const value = sampleCSS.getPropertyValue(property);
        return value.endsWith("%") ? parseFloat(value) / 100 * color.width : parseFloat(value) * scaleX;
      };
      return { label: button.getAttribute("aria-label"), custom: button.classList.contains("custom-accent-swatch"),
        hasCheck: !button.classList.contains("custom-accent-swatch") && Boolean(button.querySelector("svg")),
        width: color.width, height: color.height, expectedWidth: shell.width - horizontal * scaleX,
        expectedHeight: shell.height - vertical * scaleY,
        offsetX: color.left - shell.left - (length("padding-left") + length("border-left-width")) * scaleX,
        offsetY: color.top - shell.top - (length("padding-top") + length("border-top-width")) * scaleY,
        radii: ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"].map(radius) };
    }));
  const presets = geometry.filter(sample => !sample.custom);
  assert.ok(presets.some(sample => sample.hasCheck), "Swatch geometry includes the selected Check overlay");
  assert.ok(presets.some(sample => !sample.hasCheck), "Swatch geometry includes unselected samples without Check");
  assert.deepEqual(geometry.filter(sample => sample.width < 12 || sample.height < 12 || Math.abs(sample.width - sample.height) > .5
    || Math.abs(sample.width - sample.expectedWidth) > .5 || Math.abs(sample.height - sample.expectedHeight) > .5
    || Math.abs(sample.offsetX) > .5 || Math.abs(sample.offsetY) > .5
    || sample.radii.some(radius => radius < sample.width / 2 - .5)), [], "Every internal color sample fills its padded shell as a visible circle");
  return geometry;
}

async function auditOptions(scope) {
  const styles = await scope.locator(".settings-option, .settings-option-input").evaluateAll(elements => {
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
    const rgba = color => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    return elements.filter(element => element.getClientRects().length).map(element => {
      const css = getComputedStyle(element);
      const selected = element.getAttribute("aria-pressed") === "true" || element.getAttribute("aria-checked") === "true"
        || element.getAttribute("aria-selected") === "true" || element.classList.contains("is-selected")
        || (element instanceof HTMLInputElement && element.checked);
      return { label: element.getAttribute("aria-label") ?? element.textContent?.trim(), selected,
        disabled: element instanceof HTMLButtonElement || element instanceof HTMLInputElement ? element.disabled : false,
        background: css.backgroundColor, rgba: rgba(css.backgroundColor),
        borders: [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth],
        borderColor: css.borderTopColor, borderAlpha: rgba(css.borderTopColor)[3],
        className: element.className };
    });
  });
  assert.ok(styles.length > 0, "Settings contain shared option controls");
  assert.deepEqual(styles.filter(item => item.borders.some(width => parseFloat(width) < 1) || item.borderAlpha === 0), [], "Every option owns a visible outer border");
  const selected = styles.filter(item => item.selected);
  assert.ok(selected.length > 0, "Settings have selected controls");
  assert.deepEqual(selected.filter(({ rgba: [red, green, blue, alpha] }) => alpha <= 0 || alpha >= 255 || blue <= red || blue <= green), [], "Every selected surface is translucent blue");
  assert.equal(new Set(selected.map(item => item.background)).size, 1, "All selected controls use the same material in this section");
  const hovered = scope.locator('.settings-option:is([aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], .is-selected):not(:disabled)').last();
  const baseline = await hovered.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor }));
  await hovered.hover();
  assert.deepEqual(await hovered.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor })), baseline, "Hover retains the shared selected material");
  return styles;
}

async function capture(page, name, targets = []) {
  await page.mouse.move(0, 0);
  for (const target of targets) await expect(target).toBeInViewport({ ratio: 1 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, `${name}: no horizontal page overflow`);
  await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
  report.screenshots.push(name);
}

async function inspectMatrix(page, native, base, platform) {
  for (const theme of ["light", "dark"]) for (const withWallpaper of [false, true]) {
    const state = syntheticState(base, theme, withWallpaper);
    await seed(page, native, state);
    const baseline = await readState(page, native);
    const panel = await openSettings(page, "外观");
    const scenario = { platform, theme, wallpaper: withWallpaper, sections: [] };
    report.matrix.push(scenario);
    const suffix = `${platform}-${theme}-${withWallpaper ? "wallpaper" : "plain"}`;
    await choose(panel.getByRole("group", { name: "布局预设", exact: true }), "紧凑");
    await choose(panel.getByRole("group", { name: "卡片形状", exact: true }), "正方形");
    await choose(panel.getByRole("group", { name: "卡片排列", exact: true }), "指定每行数量");
    await panel.getByRole("checkbox", { name: "设置面板推开页面", exact: true }).check();
    scenario.sections.push({ section: "appearance", options: await auditOptions(panel), swatchGeometry: await auditSwatches(panel) });
    await panel.locator(".appearance-preview-settings").evaluate(element => element.scrollIntoView({ block: "start" }));
    await capture(page, `settings-options-${suffix}-appearance`, [
      panel.getByRole("group", { name: "常用界面缩放", exact: true }),
      panel.getByRole("group", { name: "主题模式", exact: true }),
    ]);
    await panel.locator(".appearance-layout-controls").evaluate(element => element.scrollIntoView({ block: "start" }));
    await capture(page, `settings-options-${suffix}-layout`, [
      ...["页面宽度模式", "卡片形状", "卡片排列", "主题色选择"].map(name => panel.getByRole("group", { name, exact: true })),
    ]);

    await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
    await choose(panel.getByRole("group", { name: "字体选择", exact: true }), "系统字体");
    await expand(panel, "文字颜色");
    await choose(panel.getByRole("group", { name: "文字配色预设", exact: true }), "墨色文字");
    await panel.getByRole("checkbox", { name: "主题关联字体颜色", exact: true }).check();
    await expand(panel, "文字增强");
    await choose(panel.getByRole("group", { name: "文字效果", exact: true }), "柔光");
    await panel.getByRole("checkbox", { name: "允许选择展示文字", exact: true }).check();
    scenario.sections.push({ section: "typography", options: await auditOptions(panel) });
    await panel.getByRole("group", { name: "字体选择", exact: true }).evaluate(element => element.scrollIntoView({ block: "center" }));
    await capture(page, `settings-options-${suffix}-typography`, [panel.getByRole("group", { name: "字体选择", exact: true })]);

    await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
    await expand(panel, "外观预设");
    await panel.locator('.glass-preset[data-preset="soft"]').click();
    await expand(panel, "基础设置");
    if (withWallpaper) await choose(panel.getByRole("group", { name: "填充方式", exact: true }), "完整显示");
    else await expect(panel.getByRole("button", { name: "完整显示", exact: true })).toBeDisabled();
    for (const title of ["顶栏", "侧栏"]) {
      await expand(panel, `${title}外观`);
      await choose(panel.getByRole("group", { name: `${title}样式`, exact: true }), "独立玻璃底板");
    }
    const wallpaperOptions = await auditOptions(panel);
    if (!withWallpaper) assert.ok(wallpaperOptions.some(item => item.selected && item.disabled), "Disabled selected wallpaper choices are also audited");
    scenario.sections.push({ section: "wallpaper", options: wallpaperOptions });
    await panel.locator(".wallpaper-presets").evaluate(element => element.scrollIntoView({ block: "start" }));
    await capture(page, `settings-options-${suffix}-wallpaper`, [
      panel.getByRole("group", { name: "外观预设", exact: true }), panel.getByRole("group", { name: "填充方式", exact: true }),
    ]);
    await panel.locator("summary").filter({ hasText: /^顶栏外观/ }).evaluate(element => element.scrollIntoView({ block: "start" }));
    await capture(page, `settings-options-${suffix}-panel-materials`, [
      panel.getByRole("group", { name: "顶栏样式", exact: true }), panel.getByRole("group", { name: "侧栏样式", exact: true }),
    ]);

    await panel.getByRole("tab", { name: "数据", exact: true }).click();
    const showTrash = panel.getByRole("button", { name: "查看", exact: true });
    if (await showTrash.count()) await showTrash.click();
    await panel.getByRole("button", { name: "回收站自动清理期限", exact: true }).click();
    scenario.sections.push({ section: "data", options: await auditOptions(panel) });
    const menu = panel.getByRole("listbox", { name: "回收站自动清理期限", exact: true });
    await menu.evaluate(element => element.scrollIntoView({ block: "center" }));
    await capture(page, `settings-options-${suffix}-data`, [menu]);
    await page.keyboard.press("Escape");
    await expect(panel).toBeVisible();
    assert.deepEqual(await readState(page, native), baseline, "All option previews remain unsaved");
    await panel.getByRole("button", { name: "取消", exact: true }).click();
    assert.deepEqual(await readState(page, native), baseline, "Cancel restores the initial persisted state");
    scenario.status = "passed";
  }
}

async function inspectInteractions(page, native, base, platform) {
  await seed(page, native, syntheticState(base, "dark", true));
  const baseline = await readState(page, native);
  const panel = await openSettings(page, "外观");
  const result = { platform, checks: [] };
  report.interactions.push(result);
  await panel.getByRole("tab", { name: "外观", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(panel.getByRole("tab", { name: "字体调节", exact: true })).toBeFocused();
  await expect(panel.getByRole("tab", { name: "字体调节", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(panel.getByRole("tab", { name: "数据", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(panel.getByRole("tab", { name: "外观", exact: true })).toBeFocused();
  result.checks.push("settings-tablist-arrow-end-home");
  await panel.getByRole("button", { name: "名称与图标", exact: true }).click();
  const sources = panel.getByRole("radiogroup", { name: "Logo 来源", exact: true });
  await choose(sources, "网络地址", "radio");
  await sources.getByRole("radio", { name: "网络地址", exact: true }).press("Home");
  await expect(sources.getByRole("radio", { name: "默认方格", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(sources.getByRole("radio", { name: "网络地址", exact: true })).toBeFocused();
  await expect(sources.getByRole("radio", { name: "网络地址", exact: true })).toHaveAttribute("aria-checked", "true");
  result.checks.push("logo-radio-home-arrow-wrap");
  await choose(panel.getByRole("group", { name: "Logo 外形", exact: true }), "圆形");
  await panel.getByRole("checkbox", { name: "显示 Logo", exact: true }).uncheck();
  result.brandOptions = await auditOptions(panel);
  await panel.getByRole("radiogroup", { name: "Logo 来源", exact: true }).scrollIntoViewIfNeeded();
  await capture(page, `settings-options-${platform}-brand-checkbox`, [
    panel.getByRole("radiogroup", { name: "Logo 来源", exact: true }),
    panel.getByRole("checkbox", { name: "显示 Logo", exact: true }), panel.getByRole("checkbox", { name: "显示品牌名称", exact: true }),
  ]);

  await panel.getByLabel("选择 Logo 图片", { exact: true }).setInputFiles({ name: "options-logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(logo) });
  const editor = page.getByRole("dialog", { name: "调整 Logo 图片", exact: true });
  await expect(editor).toBeVisible();
  assert.equal(await editor.evaluate(element => Boolean(element.closest(".settings-panel"))), false, "Logo editor is a body Portal");
  await choose(editor.getByRole("group", { name: "Logo 图片外形", exact: true }), "正方形");
  const crop = editor.getByRole("checkbox", { name: "裁切选定区域", exact: true });
  await crop.check();
  result.immediateCheckboxSelection = await crop.evaluate(input => {
    const css = getComputedStyle(input);
    const selected = input.closest(".logo-image-editor").querySelector('.settings-option[aria-pressed="true"]');
    return { checked: input.checked, matchesChecked: input.matches(":checked"), background: css.backgroundColor,
      selectedBackground: getComputedStyle(selected).backgroundColor,
      transitionProperty: css.transitionProperty, activeAnimations: input.getAnimations().length,
      buttonTransitionProperty: getComputedStyle(selected).transitionProperty, buttonAnimations: selected.getAnimations().length };
  });
  assert.equal(result.immediateCheckboxSelection.checked, true);
  assert.equal(result.immediateCheckboxSelection.matchesChecked, true);
  assert.equal(result.immediateCheckboxSelection.background, result.immediateCheckboxSelection.selectedBackground, "Checkbox selection paints immediately");
  assert.equal(result.immediateCheckboxSelection.transitionProperty, "none");
  assert.equal(result.immediateCheckboxSelection.activeAnimations, 0, "Reduced motion cannot introduce an all-property checkbox transition");
  assert.equal(result.immediateCheckboxSelection.buttonTransitionProperty, "none");
  assert.equal(result.immediateCheckboxSelection.buttonAnimations, 0);
  await expect(editor.getByRole("button", { name: "压缩并应用", exact: true })).toBeEnabled();
  result.logoOptions = await auditOptions(editor);
  await capture(page, `settings-options-${platform}-logo-portal`, [editor.getByRole("group", { name: "Logo 图片外形", exact: true }), crop]);
  await crop.focus();
  await page.keyboard.press("Space");
  await expect(crop).not.toBeChecked();
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await expect(panel).toBeVisible();
  result.checks.push("logo-portal-choice-and-native-checkbox-keyboard");

  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  await expand(panel, "文字颜色");
  await choose(panel.getByRole("group", { name: "文字配色预设", exact: true }), "白色文字");
  await expect(panel.getByRole("button", { name: "白色文字", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expand(panel, "文字增强");
  await choose(panel.getByRole("group", { name: "文字效果", exact: true }), "柔光");
  result.typographyOptions = await auditOptions(panel);
  await panel.getByRole("group", { name: "文字配色预设", exact: true }).evaluate(element => element.scrollIntoView({ block: "center" }));
  await capture(page, `settings-options-${platform}-typography-colors-effects`, [
    panel.getByRole("group", { name: "文字配色预设", exact: true }), panel.getByRole("group", { name: "文字效果", exact: true }),
  ]);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  assert.deepEqual(await readState(page, native), baseline, "Nested Portal and settings edits cancel together");

  await page.getByRole("button", { name: "打开回收站", exact: true }).click();
  const trigger = panel.getByRole("button", { name: "回收站自动清理期限", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const list = panel.getByRole("listbox", { name: "回收站自动清理期限", exact: true });
  await expect(list.getByRole("option", { name: "30 天后", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(list.getByRole("option", { name: "永不自动清理", exact: true })).toBeFocused();
  result.menuOptions = await auditOptions(panel);
  await list.evaluate(element => element.scrollIntoView({ block: "center" }));
  await capture(page, `settings-options-${platform}-retention-keyboard`, [list]);
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  await expect.poll(async () => (await readState(page, native)).trashRetentionDays).toBeNull();
  await trigger.press("ArrowUp");
  await expect(list.getByRole("option", { name: "永不自动清理", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(list.getByRole("option", { name: "7 天后", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(trigger).toBeFocused();
  assert.equal((await readState(page, native)).trashRetentionDays, null, "Escape preserves the selected retention");
  const danger = panel.getByRole("button", { name: "永久删除 设置选项回收站示例", exact: true });
  await danger.click();
  await expect(panel.getByRole("button", { name: "再次点击永久删除 设置选项回收站示例", exact: true })).not.toHaveClass(/settings-option/);
  assert.equal((await readState(page, native)).deletedSites.length, 1, "Arming alone never deletes");
  result.checks.push("retention-keyboard-focus-escape-immediate-persistence", "dangerous-delete-remains-armed-action");
  await panel.getByRole("button", { name: "取消", exact: true }).click();

  await openSettings(page, "外观");
  await choose(panel.getByRole("group", { name: "卡片形状", exact: true }), "正方形");
  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  await choose(panel.getByRole("group", { name: "字体选择", exact: true }), "系统字体");
  await panel.getByRole("checkbox", { name: "允许选择展示文字", exact: true }).check();
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect.poll(async () => {
    const appearance = (await readState(page, native)).appearance;
    return { cardShape: appearance.cardShape, fontFamily: appearance.fontFamily, allowTextSelection: appearance.allowTextSelection };
  }).toEqual({ cardShape: "square", fontFamily: "system", allowTextSelection: true });
  await page.reload();
  const saved = await readState(page, native);
  assert.equal(saved.appearance.cardShape, "square");
  assert.equal(saved.appearance.fontFamily, "system");
  assert.equal(saved.appearance.allowTextSelection, true);
  assert.deepEqual(saved.sites, baseline.sites);
  assert.deepEqual(saved.groups, baseline.groups);
  await openSettings(page, "字体调节");
  await expect(panel.getByRole("button", { name: "系统字体", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("checkbox", { name: "允许选择展示文字", exact: true })).toBeChecked();
  result.checks.push("choice-checkbox-save-refresh-with-collections-preserved");
  result.status = "passed";
}

async function inspectContext(context, native, url, platform) {
  await context.route(wallpaperURL, route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push({ platform, message: error.message }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "打开设置", exact: true })).toBeVisible();
  const base = await readState(page, native);
  assert.equal(base.version, 27, "Option UI refactor retains the storage contract");
  if (native) assert.equal(await page.evaluate(() => chrome.runtime.getManifest().version), manifest.version);
  await inspectMatrix(page, native, base, platform);
  await inspectInteractions(page, native, base, platform);
  await page.close();
}

try {
  browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5, colorScheme: "light" });
  try { await inspectContext(context, false, webURL, "web"); }
  finally { await context.close(); }
  await browser.close();
  browser = undefined;
  const extension = resolve("dist-extension"), temporaryRoot = resolve(tmpdir());
  const profile = await mkdtemp(join(temporaryRoot, "mysimple-settings-options-"));
  let nativeContext;
  try {
    nativeContext = await chromium.launchPersistentContext(profile, {
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : { channel: "chromium" }),
    headless: true, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = nativeContext.serviceWorkers()[0] ?? await nativeContext.waitForEvent("serviceworker");
    await inspectContext(nativeContext, true, `chrome-extension://${new URL(worker.url()).host}/index.html`, "extension");
  } finally {
    await nativeContext?.close();
    assert.equal(dirname(resolve(profile)), temporaryRoot);
    assert.ok(basename(profile).startsWith("mysimple-settings-options-"));
    await rm(profile, { recursive: true, force: true });
  }
  assert.equal(report.matrix.length, 8);
  assert.equal(report.screenshots.length, 56);
  assert.deepEqual(report.errors, []);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = { name: error.name, message: error.message, stack: error.stack };
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await writeFile(join(output, "settings-options-metrics.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ version: manifest.version, status: report.status, matrix: report.matrix.length,
    interactions: report.interactions.length, screenshots: report.screenshots.length, errors: report.errors, failure: report.failure }, null, 2));
}
