// Real production Chrome/MV3 layout checks. All collections and wallpaper are synthetic.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";

const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const report = { version: manifest.version, matrix: [], settings: [], drag: [], boundaries: [], numericEdits: [], screenshots: [], errors: [] };
const wallpaperURL = "https://layout-visual.example/wallpaper.svg";
const wallpaper = '<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1440"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#9ebcc8"/><stop offset=".5" stop-color="#516f8d"/><stop offset="1" stop-color="#263d59"/></linearGradient></defs><rect width="2560" height="1440" fill="url(#g)"/><circle cx="1950" cy="440" r="300" fill="#d9b887"/></svg>';
let server;
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
report.webURL = webURL;

async function readState(page, native) {
  return page.evaluate(async native => JSON.parse(native
    ? (await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"] : localStorage.getItem("site-hub:v1")), native);
}

function syntheticState(base, appearance = {}, grouped = false, withWallpaper = false) {
  const state = structuredClone(base), timestamp = "2026-10-08T00:00:00.000Z";
  const template = state.sites.find(site => site.id === "github");
  const githubGroups = new Set(state.groups.filter(group => group.workspace === "github").map(group => group.id));
  const sites = state.sites.filter(site => githubGroups.has(site.groupId));
  state.groups = state.groups.filter(group => group.workspace === "github" || group.isProtected);
  state.groups.find(group => group.id === "other").order = 2;
  for (const [index, suffix] of ["a", "b"].entries()) {
    const id = `layout-${suffix}`;
    state.groups.push({ id, name: `布局测试 ${suffix.toUpperCase()}`, icon: "code", workspace: "main", isProtected: false,
      order: index, createdAt: timestamp, updatedAt: timestamp });
    for (let item = 0; item < 24; item++) sites.push({ ...template, id: `${id}-${item}`, groupId: id,
      name: `布局参考 ${suffix.toUpperCase()} · ${item + 1}`, url: `https://layout-visual.example/${suffix}/${item}`,
      order: item, iconSource: "brand", clickCount: 0, createdAt: timestamp, updatedAt: timestamp });
  }
  state.sites = sites.map((site, globalOrder) => ({ ...site, globalOrder }));
  state.displayModeByWorkspace.main = grouped ? "grouped" : "flat";
  state.sortModeByWorkspace.main = "manual";
  state.wallpaper = { ...state.wallpaper, source: withWallpaper ? "url" : "none", url: wallpaperURL };
  state.appearance = { ...state.appearance, theme: "light", fontScale: 100, cardFontScale: 100, brandFontScale: 100,
    groupFontScale: 100, textColorMode: "theme", textEffect: "none", interfaceScale: 100, settingsPresentation: "overlay",
    contentWidthMode: "full", contentWidth: 1440, cardShape: "square", cardLayout: "columns", cardColumns: 12,
    cardWidth: 160, cardHeight: 160, gap: 12, ...appearance };
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

async function auditGrid(page, selector = ".site-grid") {
  return page.locator(selector).first().evaluate(grid => {
    const rect = grid.getBoundingClientRect(), style = getComputedStyle(grid);
    const card = grid.querySelector("[data-site-dnd-id]");
    const topline = card?.querySelector(".site-card-topline"), actions = card?.querySelector(".card-actions");
    const icon = card?.querySelector(".favicon-large");
    const link = card?.querySelector(".site-card-link"), nameRow = card?.querySelector(".site-name-row");
    const domain = card?.querySelector(".site-domain"), detail = card?.querySelector(".site-click-count");
    const footer = card?.querySelector(".site-category");
    const length = (element, property) => element ? parseFloat(getComputedStyle(element)[property]) || 0 : 0;
    const height = element => element?.getBoundingClientRect().height ?? 0;
    const svgHeight = element => Math.max(0, ...[...(element?.querySelectorAll("svg") ?? [])].map(height));
    const boxInsets = element => Object.fromEntries(["paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
      "borderLeftWidth", "borderRightWidth", "borderTopWidth", "borderBottomWidth"].map(property => [property, length(element, property)]));
    const contentDimensions = {
      topline: { height: height(topline), columnGap: length(topline, "columnGap") },
      icon: { width: icon?.getBoundingClientRect().width ?? 0 },
      actions: { width: actions?.getBoundingClientRect().width ?? 0 },
      nameRow: { height: height(nameRow), svgHeight: svgHeight(nameRow), insets: boxInsets(nameRow) },
      domain: { height: height(domain), marginTop: length(domain, "marginTop") },
      detail: { height: height(detail), marginTop: length(detail, "marginTop") },
      footer: { height: height(footer), svgHeight: svgHeight(footer), marginTop: length(footer, "marginTop"), insets: boxInsets(footer) },
      link: { paddingTop: length(link, "paddingTop"), paddingBottom: length(link, "paddingBottom") },
      card: boxInsets(card),
    };
    const verticalInsets = insets => insets.paddingTop + insets.paddingBottom + insets.borderTopWidth + insets.borderBottomWidth;
    const minimumHorizontalContentWidth = contentDimensions.icon.width + contentDimensions.actions.width
      + contentDimensions.topline.columnGap + contentDimensions.card.paddingLeft + contentDimensions.card.paddingRight
      + contentDimensions.card.borderLeftWidth + contentDimensions.card.borderRightWidth;
    const minimumVerticalContentSize = contentDimensions.topline.height
      + Math.max(contentDimensions.nameRow.height, contentDimensions.nameRow.svgHeight + verticalInsets(contentDimensions.nameRow.insets))
      + contentDimensions.domain.height + contentDimensions.domain.marginTop
      + contentDimensions.detail.height + contentDimensions.detail.marginTop
      + Math.max(contentDimensions.footer.height, contentDimensions.footer.svgHeight + verticalInsets(contentDimensions.footer.insets))
      + contentDimensions.footer.marginTop + contentDimensions.link.paddingTop + contentDimensions.link.paddingBottom
      + verticalInsets(contentDimensions.card);
    const cards = [...grid.querySelectorAll("[data-site-dnd-id]")].map(card => {
      const box = card.getBoundingClientRect();
      return { x: box.x, y: box.y, layoutTop: card.offsetTop, width: box.width, height: box.height, right: box.right };
    });
    return { width: rect.width, left: rect.left, right: rect.right, gap: parseFloat(style.columnGap), count: cards.length,
      columns: cards.filter(card => Math.abs(card.layoutTop - cards[0].layoutTop) < 1).length,
      tracks: style.gridTemplateColumns.trim().split(/\s+/).length,
      squareError: Math.max(...cards.map(card => Math.abs(card.width - card.height))),
      minWidth: Math.min(...cards.map(card => card.width)), minimumHorizontalContentWidth, minimumVerticalContentSize, contentDimensions,
      overflow: grid.scrollWidth > grid.clientWidth + 1 };
  });
}

async function capture(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, `${name}: horizontal page overflow`);
  await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
  report.screenshots.push(name);
}

async function inViewport(page, locator, label) {
  const box = await locator.boundingBox(), viewport = page.viewportSize();
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${label}: within viewport`);
  return box;
}

async function inspectMatrix(page, native, base, platform, dpr) {
  for (const width of [1366, 1920, 2560]) {
    await page.setViewportSize({ width, height: width === 1366 ? 900 : width === 1920 ? 1080 : 1440 });
    for (const scale of [75, 100, 150]) {
      await seed(page, native, syntheticState(base, { interfaceScale: scale }));
      await expect.poll(async () => (await auditGrid(page)).squareError).toBeLessThan(1);
      const grid = await auditGrid(page);
      assert.equal(grid.columns, grid.tracks, "Layout row membership matches actual CSS grid tracks");
      assert.ok(grid.columns >= 1 && grid.columns <= 12, "The requested count is capped by available width");
      const minimumWidth = Math.max(132 * scale / 100, grid.minimumHorizontalContentWidth, grid.minimumVerticalContentSize);
      assert.ok(grid.minWidth >= minimumWidth - 1, "Rendered square cards fit their horizontal controls and vertical content, padding and border");
      const fittingColumns = Math.max(1, Math.floor((grid.width + grid.gap) / (minimumWidth + grid.gap) + 1e-8));
      assert.equal(grid.columns, Math.min(12, fittingColumns), "Column count uses available width and actual readable card content");
      assert.equal(grid.overflow, false);
      if (width === 2560 && scale <= 100) assert.equal(grid.columns, 12);
      const dimensions = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        return { topbar: box(".topbar").height, logo: box(".topbar .brand-mark").width,
          search: box(".search-input").height, siteIcon: box(".site-card .favicon-large").width,
          rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize), dpr: devicePixelRatio };
      });
      for (const [key, baseline] of Object.entries({ topbar: base.appearance.topbarHeight, logo: base.appearance.brandLogoSize,
        search: base.appearance.searchHeight, siteIcon: base.appearance.siteIconSize, rootFontSize: 16 })) {
        assert.ok(Math.abs(dimensions[key] - baseline * scale / 100) < 1, `${platform} ${width} ${scale}%: ${key} scales once`);
      }
      assert.equal(dimensions.dpr, dpr, "DPR is independent of the user interface setting");
      const name = `layout-${platform}-${width}-scale-${scale}-dpr-${dpr}`;
      await capture(page, name);
      report.matrix.push({ platform, viewport: page.viewportSize(), interfaceScale: scale, dpr, grid, dimensions, status: "passed" });
    }
  }
}

async function inspectSettingsAndPortals(page, native, base, platform) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, native, syntheticState(base, { interfaceScale: 125, cardColumns: 6, theme: "dark" }, true, true));
  const nav = page.getByRole("navigation", { name: "分组定位" });
  await expect(nav).toBeVisible();
  await expect.poll(() => nav.evaluate(element => document.querySelector(".grouped-site-sections").getBoundingClientRect().left - element.getBoundingClientRect().right)).toBeGreaterThanOrEqual(8);
  const grouped = await auditGrid(page, '.grouped-site-track');
  assert.equal(grouped.columns, 6);
  assert.ok(grouped.squareError < 1);
  await capture(page, `layout-${platform}-grouped-scaled-wallpaper`);
  await nav.getByRole("button", { name: "定位到 布局测试 B", exact: true }).click();
  await expect(nav.locator('[aria-current="location"]')).toHaveText("布局测试 B");
  const main = page.locator("main.page-container"), before = await main.boundingBox();
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await expect(panel.getByRole("checkbox", { name: "设置面板推开页面", exact: true })).not.toBeChecked();
  await expect.poll(async () => Math.abs((await main.boundingBox()).width - before.width)).toBeLessThan(1);
  await inViewport(page, panel, "Scaled settings");
  await inViewport(page, panel.getByRole("button", { name: "保存设置", exact: true }), "Fixed settings footer");
  await capture(page, `layout-${platform}-settings-overlay-scaled`);
  await panel.getByRole("checkbox", { name: "设置面板推开页面", exact: true }).check();
  await expect.poll(async () => (await main.boundingBox()).width).toBeLessThan(before.width - 100);
  await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector(".topbar").getBoundingClientRect().right - document.querySelector(".settings-panel").getBoundingClientRect().left))).toBeLessThan(1);
  await capture(page, `layout-${platform}-settings-push-scaled`);
  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  await panel.locator("summary").filter({ hasText: /^文字增强/ }).click();
  await panel.getByRole("button", { name: "文字增强说明", exact: true }).click();
  await inViewport(page, page.getByRole("tooltip"), "Help Portal");
  await capture(page, `layout-${platform}-help-portal-scaled`);
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "管理分组", exact: true });
  await inViewport(page, manager, "Group manager Portal");
  await capture(page, `layout-${platform}-manager-portal-scaled`);
  await manager.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "打开数据", exact: true }).click();
  const data = page.getByRole("region", { name: "数据页面", exact: true });
  await expect(data).toBeVisible();
  assert.equal(await data.evaluate(element => element.scrollWidth > element.clientWidth + 1), false, "Scaled data page has no horizontal overflow");
  await capture(page, `layout-${platform}-data-scaled`);
  report.settings.push({ platform, interfaceScale: 125, overlayPreservesWidth: true, pushReservesWidth: true,
    groupedSquare: true, groupNavigationClear: true, helpInViewport: true, managerInViewport: true, dataNoOverflow: true, status: "passed" });
}

async function inspectDrag(page, native, base, platform, scale) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, native, syntheticState(base, { interfaceScale: scale, contentWidthMode: "fixed", contentWidth: 960, cardColumns: 4 }));
  await page.getByRole("tab", { name: /布局测试 A/ }).click();
  const source = page.getByTestId("site-card-layout-a-0"), target = page.getByTestId("site-card-layout-a-1");
  const start = await source.boundingBox(), end = await target.boundingBox();
  const pointer = { x: start.x + start.width / 2, y: start.y + start.height * .65 };
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await page.mouse.move(pointer.x + 55, pointer.y);
  const overlay = page.getByTestId("site-card-drag-preview");
  await expect(overlay).toBeVisible();
  await expect(source).toHaveCSS("opacity", "0.46");
  const overlayBox = await overlay.boundingBox();
  assert.ok(Math.abs(overlayBox.width - start.width) < 1 && Math.abs(overlayBox.height - start.height) < 1, "Scaled drag preview retains actual source dimensions");
  await page.mouse.move(end.x + end.width * .8, end.y + end.height / 2, { steps: 12 });
  await expect.poll(async () => (await target.boundingBox()).x).toBeLessThan(end.x - 30);
  await capture(page, `layout-${platform}-drag-${scale}-held`);
  await page.mouse.up();
  await expect(overlay).toHaveCount(0);
  const stored = await readState(page, native);
  const order = stored.sites.filter(site => site.groupId === "layout-a").sort((a, b) => a.order - b.order).map(site => site.id);
  assert.deepEqual(order.slice(0, 2), ["layout-a-1", "layout-a-0"]);
  await page.reload();
  await page.getByRole("tab", { name: /布局测试 A/ }).click();
  await expect.poll(() => page.locator(".site-grid > [data-site-dnd-id]").evaluateAll(elements => elements.slice(0, 2).map(element => element.getAttribute("data-testid"))))
    .toEqual(["site-card-layout-a-1", "site-card-layout-a-0"]);
  await capture(page, `layout-${platform}-drag-${scale}-saved`);
  report.drag.push({ platform, interfaceScale: scale, source: "layout-a-0", target: "layout-a-1", overlayMatchesSource: true,
    heldSourceOpacity: .46, savedOrder: order.slice(0, 2), reloadPreservesOrder: true, status: "passed" });
}

async function inspectDesktopBoundaries(page, native, base, platform, dpr) {
  const main = page.locator("main.page-container"), shell = page.locator(".app-shell");
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await page.setViewportSize({ width: 900, height: 900 });
  await seed(page, native, syntheticState(base, { interfaceScale: 150, settingsPresentation: "push" }));
  const before = await main.boundingBox();
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  await expect(panel.getByRole("checkbox", { name: "设置面板推开页面", exact: true })).toBeChecked();
  await expect(shell).not.toHaveClass(/settings-push/);
  await expect.poll(async () => Math.abs((await main.boundingBox()).width - before.width)).toBeLessThan(1);
  const overlayPanel = await inViewport(page, panel, "Automatic overlay settings");
  const overlayFooter = await inViewport(page, panel.locator(".settings-footer"), "Automatic overlay settings footer");
  await expect.poll(async () => (await auditGrid(page)).squareError).toBeLessThan(1);
  const overlayGrid = await auditGrid(page);
  assert.equal(overlayGrid.overflow, false, "Automatic overlay leaves the square card grid within its available width");
  await capture(page, `layout-${platform}-automatic-overlay-900-150`);
  report.boundaries.push({ platform, dpr, scenario: "automatic-overlay-900-150", viewport: page.viewportSize(), interfaceScale: 150,
    requestedPresentation: "push", actualPresentation: "overlay", preferencePreserved: true,
    mainWidthBefore: before.width, mainWidthOpen: (await main.boundingBox()).width,
    panel: overlayPanel, footer: overlayFooter, grid: overlayGrid, status: "passed" });

  await seed(page, native, syntheticState(base, { interfaceScale: 100, cardColumns: 6, settingsPresentation: "push" }, true));
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  const separator = page.getByRole("separator", { name: "调整设置栏宽度", exact: true });
  await separator.focus();
  await separator.press("End");
  await expect.poll(() => separator.evaluate(element => element.getAttribute("aria-valuenow") === element.getAttribute("aria-valuemax"))).toBe(true);
  await expect(shell).toHaveClass(/settings-push/);
  const nav = page.locator(".group-section-nav");
  await expect(nav).toHaveAttribute("data-compact", "");
  await expect(nav).toBeHidden();
  await expect.poll(async () => (await auditGrid(page, ".grouped-site-track")).squareError).toBeLessThan(1);
  const compactGrid = await auditGrid(page, ".grouped-site-track");
  assert.equal(compactGrid.overflow, false, "Compact navigation leaves the square grouped grid within its available width");
  await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector(".topbar").getBoundingClientRect().right
    - document.querySelector(".settings-panel").getBoundingClientRect().left))).toBeLessThan(1);
  const compactPanel = await inViewport(page, panel, "Maximum width settings");
  const compactFooter = await inViewport(page, panel.locator(".settings-footer"), "Maximum width settings footer");
  const maximumPanel = await separator.evaluate(element => ({ value: Number(element.getAttribute("aria-valuenow")),
    minimum: Number(element.getAttribute("aria-valuemin")), maximum: Number(element.getAttribute("aria-valuemax")) }));
  await capture(page, `layout-${platform}-compact-nav-900-max-panel`);
  report.boundaries.push({ platform, dpr, scenario: "compact-nav-900-max-panel", viewport: page.viewportSize(), interfaceScale: 100,
    requestedPresentation: "push", actualPresentation: "push", navigationCompact: true, navigationHidden: true,
    topbarMeetsPanel: true, panelWidth: maximumPanel, panel: compactPanel, footer: compactFooter, grid: compactGrid, status: "passed" });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, native, syntheticState(base, { interfaceScale: 125, fontScale: 130, cardFontScale: 140 }));
  await expect.poll(async () => (await auditGrid(page)).squareError).toBeLessThan(1);
  const largeTextGrid = await auditGrid(page);
  assert.equal(largeTextGrid.overflow, false, "Large text square grid stays within its available width");
  const cardContents = await page.locator(".site-grid [data-site-dnd-id]").evaluateAll(cards => {
    const overflow = [], outside = [];
    let visibleElements = 0;
    const dimensions = cards.map(card => {
      const bounds = card.getBoundingClientRect(), id = card.getAttribute("data-site-dnd-id");
      const size = { id, width: bounds.width, height: bounds.height, scrollWidth: card.scrollWidth, clientWidth: card.clientWidth,
        scrollHeight: card.scrollHeight, clientHeight: card.clientHeight };
      if (card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1) overflow.push(size);
      for (const element of card.querySelectorAll("*")) {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        if (!element.getClientRects().length || style.visibility !== "visible" || style.display === "none" || Number(style.opacity) === 0
          || rect.width === 0 || rect.height === 0) continue;
        visibleElements++;
        // Ellipsis may leave text scrollable inside its own box; the visible
        // element box and the card's actual scroll dimensions must still fit.
        if (rect.left < bounds.left - 1 || rect.top < bounds.top - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1) {
          outside.push({ id, tag: element.tagName, class: element.getAttribute("class"), rect: rect.toJSON(), card: bounds.toJSON() });
        }
      }
      return size;
    });
    return { count: cards.length, visibleElements, dimensions, overflow, outside };
  });
  assert.ok(cardContents.count > 0 && cardContents.visibleElements > 0, "Large text geometry checks actual cards and visible content");
  assert.deepEqual(cardContents.overflow, [], "Large text stays within each card's horizontal and vertical content bounds");
  assert.deepEqual(cardContents.outside, [], "All visible card elements fit inside their actual square cards");
  await capture(page, `layout-${platform}-square-large-text`);
  report.boundaries.push({ platform, dpr, scenario: "square-large-text", viewport: page.viewportSize(), interfaceScale: 125,
    fontScale: 130, cardFontScale: 140, grid: largeTextGrid, cardContents, status: "passed" });
}

async function inspectNumericEditing(page, native, base, platform, dpr) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, native, syntheticState(base, { interfaceScale: 100 }));
  const savedAppearance = (await readState(page, native)).appearance;
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "外观", exact: true }).click();
  const input = panel.getByRole("spinbutton", { name: "界面缩放数值", exact: true });
  const slider = panel.getByRole("slider", { name: "界面缩放", exact: true });
  const result = { platform, dpr, viewport: page.viewportSize(), control: "界面缩放", steps: [], status: "running" };
  report.numericEdits.push(result);
  const rootFontSize = () => page.locator("html").evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  const record = async action => {
    const values = await input.evaluate(element => ({ input: element.value,
      slider: element.closest(".range-control").querySelector('input[type="range"]').value,
      rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize), focused: document.activeElement === element }));
    result.steps.push({ action, ...values });
  };

  await expect(input).toHaveValue("100");
  await expect(slider).toHaveValue("100");
  await expect.poll(rootFontSize).toBe(16);
  await record("baseline");
  await input.fill("125");
  await expect(input).toHaveValue("125");
  await expect(slider).toHaveValue("100");
  assert.equal(await rootFontSize(), 16, "Typing a numeric draft does not preview interface geometry or text");
  await record("draft-before-blur");
  await input.press("Tab");
  await expect(input).toHaveValue("125");
  await expect(slider).toHaveValue("125");
  await expect.poll(rootFontSize).toBe(20);
  await record("tab-blur-commit");

  await input.fill("150");
  await expect(slider).toHaveValue("125");
  assert.equal(await rootFontSize(), 20);
  await record("draft-before-escape");
  await input.press("Escape");
  await expect(input).toHaveValue("125");
  await expect(slider).toHaveValue("125");
  await expect(panel).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(input).toBeFocused();
  assert.equal(await rootFontSize(), 20, "Escape restores the numeric draft before Radix can dismiss settings");
  await record("escape-cancel-draft");

  await input.fill("150");
  await input.press("Enter");
  await expect(input).toHaveValue("150");
  await expect(slider).toHaveValue("150");
  await expect.poll(rootFontSize).toBe(24);
  await expect(input).toBeFocused();
  await record("enter-commit");
  result.focusedStyles = await input.evaluate(element => {
    const describe = target => {
      const style = getComputedStyle(target);
      return { borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle, boxShadow: style.boxShadow };
    };
    const shell = element.closest(".range-control-number");
    return { input: describe(element), shell: describe(shell), unit: shell.querySelector(".range-control-unit").textContent };
  });
  assert.ok(result.focusedStyles.input.borderWidths.every(width => parseFloat(width) === 0), "The numeric input has no second inner border");
  assert.equal(parseFloat(result.focusedStyles.input.outlineWidth), 0, "The numeric input has no second inner focus outline");
  assert.equal(result.focusedStyles.input.boxShadow, "none", "The numeric input has no second inner focus shadow");
  assert.ok(result.focusedStyles.shell.borderWidths.every(width => parseFloat(width) > 0), "The shared outer shell owns the visible border");
  assert.equal(result.focusedStyles.unit, "%", "The fixed unit is separate from the editable number");

  await input.fill("");
  await expect(input).toHaveValue("");
  await expect(slider).toHaveValue("150");
  await record("empty-draft-before-blur");
  await input.press("Tab");
  await expect(input).toHaveValue("150");
  await expect(slider).toHaveValue("150");
  assert.equal(await rootFontSize(), 24, "An empty draft restores the current number without applying zero");
  await record("empty-tab-restore");
  await input.focus();
  await inViewport(page, panel, "Numeric editing settings");
  await capture(page, `layout-${platform}-numeric-editing`);
  assert.deepEqual((await readState(page, native)).appearance, savedAppearance, "Numeric previews do not persist before saving");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(rootFontSize).toBe(16);
  const afterCancel = (await readState(page, native)).appearance;
  assert.deepEqual(afterCancel, savedAppearance, "Cancel restores the original appearance after numeric previews");
  result.afterCancel = { rootFontSize: await rootFontSize(), interfaceScale: afterCancel.interfaceScale, fontScale: afterCancel.fontScale };
  result.status = "passed";
}

async function inspectContext(context, native, url, platform, dpr) {
  await context.route(wallpaperURL, route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push({ platform, dpr, message: error.message }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "打开设置", exact: true })).toBeVisible();
  const base = await readState(page, native);
  assert.equal(base.version, 27, "Production state uses the layout migration");
  if (native) assert.equal(await page.evaluate(() => chrome.runtime.getManifest().version), manifest.version);
  await inspectMatrix(page, native, base, platform, dpr);
  if (dpr === 1.5) {
    await inspectSettingsAndPortals(page, native, base, platform);
    for (const scale of [125, 150]) await inspectDrag(page, native, base, platform, scale);
    await inspectDesktopBoundaries(page, native, base, platform, dpr);
    await inspectNumericEditing(page, native, base, platform, dpr);
  }
  await page.close();
}

let browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
  for (const dpr of [1, 1.5]) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr, colorScheme: "light" });
    try { await inspectContext(context, false, webURL, "web", dpr); }
    finally { await context.close(); }
  }
  await browser.close();
  browser = undefined;
  const extension = resolve("dist-extension");
  for (const dpr of [1, 1.5]) {
    const profile = await mkdtemp(join(tmpdir(), "mysimple-layout-capture-"));
    const context = await chromium.launchPersistentContext(profile, {
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : { channel: "chromium" }),
      headless: true, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      await inspectContext(context, true, `chrome-extension://${new URL(worker.url()).host}/index.html`, "extension", dpr);
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = { name: error.name, message: error.message, stack: error.stack };
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await writeFile(join(output, "layout-settings-metrics.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, matrix: report.matrix.length, settings: report.settings,
    drag: report.drag, boundaries: report.boundaries, numericEdits: report.numericEdits,
    screenshots: report.screenshots.length, errors: report.errors, failure: report.failure }, null, 2));
}
