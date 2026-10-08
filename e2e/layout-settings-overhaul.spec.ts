import type { Locator, Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, screenshotPath, test } from "./fixtures";

async function saveDiagnostic(page: Page, name: string, value: unknown) {
  const directory = "artifacts/working/layout-overhaul";
  await mkdir(directory, { recursive: true });
  const path = `${directory}/${name}-${Date.now()}.json`;
  await writeFile(path, JSON.stringify(value, null, 2));
  await test.info().attach(name, { path, contentType: "application/json" });
  await page.screenshot({ path: path.replace(/\.json$/, ".png"), animations: "disabled" });
}

async function seedLayout(page: Page, appearance: Record<string, string | number> = {}) {
  await page.evaluate(appearance => {
    const key = "site-hub:v1", state = JSON.parse(localStorage.getItem(key)!);
    const timestamp = "2026-10-08T00:00:00.000Z";
    const template = state.sites.find((site: { id: string }) => site.id === "github");
    const githubGroups = new Set(state.groups.filter((group: { workspace?: string }) => group.workspace === "github").map((group: { id: string }) => group.id));
    state.groups = state.groups.filter((group: { workspace?: string; isProtected: boolean }) => group.workspace === "github" || group.isProtected);
    state.groups.find((group: { id: string }) => group.id === "other").order = 2;
    const sites = state.sites.filter((site: { groupId: string }) => githubGroups.has(site.groupId));
    for (const [index, suffix] of ["a", "b"].entries()) {
      const id = `layout-${suffix}`;
      state.groups.push({ id, name: `布局测试 ${suffix.toUpperCase()}`, icon: "code", workspace: "main", isProtected: false,
        order: index, createdAt: timestamp, updatedAt: timestamp });
      for (let item = 0; item < 24; item++) sites.push({ ...template, id: `${id}-${item}`, groupId: id,
        name: `布局网站 ${suffix.toUpperCase()} ${item + 1}`, url: `https://layout.example/${suffix}/${item}`,
        iconSource: "brand", order: item, clickCount: 0, createdAt: timestamp, updatedAt: timestamp });
    }
    state.sites = sites.map((site: object, globalOrder: number) => ({ ...site, globalOrder }));
    state.appearance = { ...state.appearance, theme: "light", interfaceScale: 100, settingsPresentation: "overlay",
      contentWidthMode: "fixed", contentWidth: 1600, cardShape: "free", cardLayout: "adaptive", cardColumns: 6,
      cardWidth: 160, cardHeight: 160, gap: 12, ...appearance };
    state.displayModeByWorkspace.main = "flat";
    state.sortModeByWorkspace.main = "manual";
    localStorage.setItem(key, JSON.stringify(state));
  }, appearance);
  await page.reload();
  await expect(page.locator("[data-site-dnd-id]")).toHaveCount(48);
}

async function openAppearance(page: Page) {
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "外观", exact: true }).click();
  return panel;
}

async function expandGeometry(panel: Locator) {
  const details = panel.getByRole("button", { name: /布局微调/ });
  if (await details.count() && await details.getAttribute("aria-expanded") !== "true") await details.click();
  const dimensions = panel.locator("summary").filter({ hasText: /^界面尺寸/ });
  if (await dimensions.count() && !await dimensions.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await dimensions.click();
}

async function enterNumber(panel: Locator, label: string, value: number) {
  const input = panel.getByRole("spinbutton", { name: `${label}数值`, exact: true });
  await input.fill(String(value));
  await input.press("Enter");
  await expect(input).toHaveValue(String(value));
  await expect(panel.getByRole("slider", { name: label, exact: true })).toHaveValue(String(value));
}

async function gridGeometry(grid: Locator, cardSelector = "[data-site-dnd-id]") {
  return grid.evaluate((element, cardSelector) => {
    const bounds = element.getBoundingClientRect();
    const cards = [...element.querySelectorAll<HTMLElement>(cardSelector)].map(card => {
      const rect = card.getBoundingClientRect();
      return { x: rect.x, y: rect.y, layoutTop: card.offsetTop, width: rect.width, height: rect.height, right: rect.right,
        scrollWidth: card.scrollWidth, clientWidth: card.clientWidth };
    });
    return { width: bounds.width, left: bounds.left, right: bounds.right, count: cards.length,
      firstRow: cards.filter(card => Math.abs(card.layoutTop - cards[0].layoutTop) < 1).length,
      tracks: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
      squareError: Math.max(...cards.map(card => Math.abs(card.width - card.height))),
      cardWidthRange: Math.max(...cards.map(card => card.width)) - Math.min(...cards.map(card => card.width)),
      overflow: element.scrollWidth > element.clientWidth + 1, cards };
  }, cardSelector);
}

async function expectSquareGrid(grid: Locator, columns: number, cardSelector?: string) {
  await expect.poll(async () => (await gridGeometry(grid, cardSelector)).firstRow).toBe(columns);
  await expect.poll(async () => (await gridGeometry(grid, cardSelector)).tracks).toBe(columns);
  await expect.poll(async () => (await gridGeometry(grid, cardSelector)).squareError).toBeLessThan(1);
  const geometry = await gridGeometry(grid, cardSelector);
  expect(geometry.cardWidthRange).toBeLessThan(1);
  expect(geometry.overflow).toBe(false);
  expect(geometry.cards.at(columns - 1)!.right).toBeCloseTo(geometry.right, 0);
}

async function cardContentOverflow(grid: Locator) {
  return grid.evaluate(element => [...element.querySelectorAll<HTMLElement>("[data-site-dnd-id]")].flatMap(card => {
    const bounds = card.getBoundingClientRect();
    const escaped = [...card.querySelectorAll<HTMLElement>("*")].flatMap(child => {
      const style = getComputedStyle(child), rect = child.getBoundingClientRect();
      if (!child.getClientRects().length || style.visibility === "hidden" || style.display === "none") return [];
      return rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1
        ? [{ className: child.getAttribute("class"), rect: rect.toJSON() }] : [];
    });
    return card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1 || escaped.length
      ? [{ id: card.dataset.siteDndId, rect: bounds.toJSON(), scrollWidth: card.scrollWidth, clientWidth: card.clientWidth,
        scrollHeight: card.scrollHeight, clientHeight: card.clientHeight, escaped }] : [];
  }));
}

async function expectInViewport(page: Page, locator: Locator) {
  let box = (await locator.boundingBox())!;
  expect(box).not.toBeNull();
  if (box.x < -1 || box.y < -1 || box.x + box.width > page.viewportSize()!.width + 1 || box.y + box.height > page.viewportSize()!.height + 1) {
    const probe = await page.evaluate(async () => {
      const frames = [];
      const describe = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const css = getComputedStyle(element), rect = element.getBoundingClientRect();
        return { rect: rect.toJSON(), inlineLeft: element.style.left, inlineTop: element.style.top,
          position: css.position, left: css.left, top: css.top, width: css.width, maxWidth: css.maxWidth,
          font: css.font, transform: css.transform, zoom: css.zoom, overflowX: css.overflowX,
          scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
      };
      for (let frame = 0; frame < 8; frame++) {
        frames.push({ html: describe("html"), body: describe("body"), panel: describe(".settings-panel"),
          tooltip: describe('[role="tooltip"]'), anchor: describe('[aria-label="文字增强说明"]') });
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      return frames;
    });
    await saveDiagnostic(page, "viewport-position-frames", probe);
  }
  await expect.poll(async () => {
    const current = (await locator.boundingBox())!, viewport = page.viewportSize()!;
    return current.x >= -1 && current.y >= -1 && current.x + current.width <= viewport.width + 1 && current.y + current.height <= viewport.height + 1;
  }).toBe(true);
  box = (await locator.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop layout settings acceptance");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("overlays settings by default and previews, cancels and persists an explicit push layout", async ({ page }) => {
  await seedLayout(page);
  const main = page.locator("main.page-container");
  const baseline = (await main.boundingBox())!;
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  const panel = await openAppearance(page);
  const push = panel.getByRole("checkbox", { name: "设置面板推开页面", exact: true });
  await expect(push).not.toBeChecked();
  await expect.poll(async () => (await main.boundingBox())!.width).toBeCloseTo(baseline.width, 0);
  await expect.poll(async () => (await main.boundingBox())!.x).toBeCloseTo(baseline.x, 0);
  await page.screenshot({ path: screenshotPath("layout-settings-overlay.png"), animations: "disabled" });

  await push.check();
  await expect.poll(async () => (await main.boundingBox())!.width).toBeLessThan(baseline.width - 100);
  await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector(".topbar")!.getBoundingClientRect().right
    - document.querySelector(".settings-panel")!.getBoundingClientRect().left))).toBeLessThan(1);
  expect((await main.boundingBox())!.x + (await main.boundingBox())!.width).toBeLessThanOrEqual((await panel.boundingBox())!.x + 1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!))).toEqual(saved);
  await page.screenshot({ path: screenshotPath("layout-settings-push-preview.png"), animations: "disabled" });
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect.poll(async () => (await main.boundingBox())!.width).toBeCloseTo(baseline.width, 0);

  await openAppearance(page);
  await expect(push).not.toBeChecked();
  await push.check();
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance.settingsPresentation)).toBe("push");
  await openAppearance(page);
  await expect(push).toBeChecked();
  await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector(".topbar")!.getBoundingClientRect().right
    - document.querySelector(".settings-panel")!.getBoundingClientRect().left))).toBeLessThan(1);
});

test("keeps rendered cards square and honors a saved row count in flat, focused and grouped views", async ({ page }) => {
  await seedLayout(page, { cardWidth: 132, contentWidth: 1440 });
  const panel = await openAppearance(page);
  await expandGeometry(panel);
  await panel.getByRole("button", { name: "正方形", exact: true }).click();
  await panel.getByRole("button", { name: "指定每行数量", exact: true }).click();
  await enterNumber(panel, "每行卡片数量", 6);
  await expect(panel.getByRole("spinbutton", { name: "卡片宽度数值", exact: true })).toBeDisabled();
  await expect(panel.getByRole("spinbutton", { name: "卡片高度数值", exact: true })).toBeDisabled();
  await expectSquareGrid(page.locator(".site-grid"), 6);
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.reload();
  await expectSquareGrid(page.locator(".site-grid"), 6);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  expect(saved.version).toBe(27);
  expect(saved.appearance).toMatchObject({ cardShape: "square", cardLayout: "columns", cardColumns: 6 });
  expect(saved.appearance).toMatchObject({ cardWidth: 132, cardHeight: 160 });

  await page.getByRole("tab", { name: /布局测试 A/ }).click();
  await expect(page.locator("[data-site-dnd-id]")).toHaveCount(24);
  await expectSquareGrid(page.locator(".site-grid"), 6);
  await page.getByRole("tab", { name: /全部/ }).click();
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示", exact: true }).click();
  for (const group of ["layout-a", "layout-b"]) {
    await expectSquareGrid(page.locator(`[data-group-sort-section-id="${group}"] .grouped-site-track`), 6);
  }
  try {
    await expect.poll(() => page.getByRole("navigation", { name: "分组定位" }).evaluate(nav =>
      document.querySelector(".grouped-site-sections")!.getBoundingClientRect().left - nav.getBoundingClientRect().right)).toBeGreaterThanOrEqual(8);
  } catch (error) {
    await saveDiagnostic(page, "group-nav-overlap", await page.evaluate(() => ["html", "body", ".app-shell", ".main-content", ".group-section-nav", ".grouped-site-sections"].map(selector => {
      const element = document.querySelector<HTMLElement>(selector)!, css = getComputedStyle(element);
      return { selector, rect: element.getBoundingClientRect().toJSON(), inlineLeft: element.style.left, position: css.position,
        left: css.left, width: css.width, marginLeft: css.marginLeft, transform: css.transform, zoom: css.zoom,
        offsetWidth: element.offsetWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        navWidth: css.getPropertyValue("--group-nav-width"), navGap: css.getPropertyValue("--group-nav-gap"), navLane: css.getPropertyValue("--group-nav-lane") };
    })));
    throw error;
  }
  await page.screenshot({ path: screenshotPath("layout-settings-square-grouped.png"), animations: "disabled" });
  await openAppearance(page);
  await expandGeometry(panel);
  await panel.getByRole("button", { name: "自由比例", exact: true }).click();
  await panel.getByRole("button", { name: "自动适配", exact: true }).click();
  await expect(panel.getByRole("spinbutton", { name: "卡片宽度数值", exact: true })).toBeEnabled();
  await expect(panel.getByRole("spinbutton", { name: "卡片宽度数值", exact: true })).toHaveValue("132");
  await expect(panel.getByRole("spinbutton", { name: "卡片高度数值", exact: true })).toBeEnabled();
  await expect(panel.getByRole("spinbutton", { name: "卡片高度数值", exact: true })).toHaveValue("160");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance)).toEqual(saved.appearance);
});

test("uses full window width and clamps the rendered row count without losing the requested count", async ({ page }) => {
  await seedLayout(page, { cardWidth: 132, contentWidth: 1280 });
  const main = page.locator("main.page-container");
  const fixedWidth = (await main.boundingBox())!.width;
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expect.poll(async () => (await main.boundingBox())!.width).toBeCloseTo(fixedWidth, 0);
  const panel = await openAppearance(page);
  await expandGeometry(panel);
  await panel.getByRole("button", { name: "铺满窗口", exact: true }).click();
  await panel.getByRole("button", { name: "正方形", exact: true }).click();
  await panel.getByRole("button", { name: "指定每行数量", exact: true }).click();
  await enterNumber(panel, "每行卡片数量", 12);
  await expect.poll(async () => (await main.boundingBox())!.width).toBeGreaterThan(fixedWidth + 800);
  await expectSquareGrid(page.locator(".site-grid"), 12);
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect.poll(async () => (await gridGeometry(page.locator(".site-grid"))).firstRow).toBeLessThan(12);
  const narrow = await gridGeometry(page.locator(".site-grid"));
  expect(narrow.firstRow).toBeGreaterThan(0);
  expect(narrow.squareError).toBeLessThan(1);
  try {
    await expect.poll(async () => (await gridGeometry(page.locator(".site-grid"))).overflow).toBe(false);
  } catch (error) {
    await saveDiagnostic(page, "narrow-grid-overflow", await page.locator(".site-grid").evaluate(grid => {
      const rect = grid.getBoundingClientRect();
      return { grid: { rect: rect.toJSON(), style: (grid as HTMLElement).style.cssText, columns: getComputedStyle(grid).gridTemplateColumns,
        scrollWidth: grid.scrollWidth, clientWidth: grid.clientWidth },
        overflowing: [...grid.querySelectorAll<HTMLElement>("*")].filter(element => element.getBoundingClientRect().right > rect.right + 1 || element.scrollWidth > element.clientWidth + 1)
          .slice(0, 30).map(element => { const css = getComputedStyle(element); return { tag: element.tagName, className: element.className,
            rect: element.getBoundingClientRect().toJSON(), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
            width: css.width, minWidth: css.minWidth, overflowX: css.overflowX, position: css.position }; }) };
    }));
    throw error;
  }
  await expect(panel.getByRole("spinbutton", { name: "每行卡片数量数值", exact: true })).toHaveValue("12");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: screenshotPath("layout-settings-square-1366-clamped.png"), animations: "disabled" });
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expectSquareGrid(page.locator(".site-grid"), 12);
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance)).toMatchObject({ contentWidthMode: "full", cardColumns: 12 });
  await expectSquareGrid(page.locator(".site-grid"), 12);
});

test("falls back to an overlay at 900px and 150% while preserving the requested push preference", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await seedLayout(page, { interfaceScale: 150, settingsPresentation: "push", contentWidthMode: "full",
    cardShape: "square", cardLayout: "columns", cardColumns: 12 });
  const main = page.locator("main.page-container"), shell = page.locator(".app-shell"), grid = page.locator(".site-grid");
  const before = (await main.boundingBox())!;
  const panel = await openAppearance(page);
  await expect(panel.getByRole("checkbox", { name: "设置面板推开页面", exact: true })).toBeChecked();
  await expect(shell).toHaveClass(/settings-open/);
  await expect(shell).not.toHaveClass(/settings-push/);
  await expect.poll(async () => (await main.boundingBox())!.width).toBeCloseTo(before.width, 0);
  await expect.poll(async () => (await main.boundingBox())!.x).toBeCloseTo(before.x, 0);
  await expect.poll(async () => (await gridGeometry(grid)).squareError).toBeLessThan(1);
  await expect.poll(() => cardContentOverflow(grid)).toEqual([]);
  await expectInViewport(page, panel);
  await expectInViewport(page, panel.getByRole("button", { name: "保存设置", exact: true }));
  await page.screenshot({ path: screenshotPath("layout-settings-auto-overlay-900-150.png"), animations: "disabled" });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance.settingsPresentation)).toBe("push");
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect(shell).toHaveClass(/settings-push/);
  await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector(".topbar")!.getBoundingClientRect().right
    - document.querySelector(".settings-panel")!.getBoundingClientRect().left))).toBeLessThan(1);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance.settingsPresentation)).toBe("push");
});

test("hides the group rail only when a maximum-width pushing panel leaves insufficient room", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await seedLayout(page, { settingsPresentation: "push", contentWidthMode: "full", cardShape: "square", cardLayout: "columns", cardColumns: 6 });
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "分组定位", includeHidden: true }), shell = page.locator(".app-shell");
  await expect(nav).toBeVisible();
  const panel = await openAppearance(page);
  await expect(shell).toHaveClass(/settings-push/);
  await expect(nav).toBeVisible();
  const divider = page.getByRole("separator", { name: "调整设置栏宽度", exact: true });
  await divider.focus();
  await divider.press("End");
  await expect.poll(() => divider.getAttribute("aria-valuenow")).toBe(await divider.getAttribute("aria-valuemax"));
  await expect(shell).toHaveClass(/settings-push/);
  await expect(nav).toHaveAttribute("data-compact", "");
  await expect(nav).toBeHidden();
  const grid = page.locator('[data-group-sort-section-id="layout-a"] .grouped-site-track');
  await expectSquareGrid(grid, 1);
  await expect.poll(() => cardContentOverflow(grid)).toEqual([]);
  await expectInViewport(page, panel);
  await page.screenshot({ path: screenshotPath("layout-settings-compact-nav-900-max-panel.png"), animations: "disabled" });
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(nav).toBeVisible();
  await expect.poll(() => nav.evaluate(element => document.querySelector(".grouped-site-sections")!.getBoundingClientRect().left
    - element.getBoundingClientRect().right)).toBeGreaterThanOrEqual(8);
});

test("rechecks navigation space when card text size changes without resizing the window or panel", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await seedLayout(page, { settingsPresentation: "push", contentWidthMode: "full", cardShape: "square", cardLayout: "columns",
    cardColumns: 6, fontScale: 130, cardFontScale: 100 });
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "分组定位", includeHidden: true });
  const panel = await openAppearance(page), shell = page.locator(".app-shell");
  await expect(shell).toHaveClass(/settings-push/);
  await expect(nav).toBeVisible();
  const panelWidth = (await panel.boundingBox())!.width;
  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  const section = panel.locator("summary").filter({ hasText: /^分区字号/ });
  if (!await section.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await section.click();
  await enterNumber(panel, "网站卡片字号", 140);
  await expect(nav).toHaveAttribute("data-compact", "");
  await expect(nav).toBeHidden();
  await expect(shell).toHaveClass(/settings-push/);
  expect((await panel.boundingBox())!.width).toBeCloseTo(panelWidth, 1);
  await expect(page.locator("html")).toHaveCSS("font-size", "20.8px");
  const grid = page.locator('[data-group-sort-section-id="layout-a"] .grouped-site-track');
  await expect.poll(() => cardContentOverflow(grid)).toEqual([]);
  await expect.poll(async () => (await gridGeometry(grid)).squareError).toBeLessThan(1);
  await page.screenshot({ path: screenshotPath("layout-settings-nav-reacts-to-card-font.png"), animations: "disabled" });
  await enterNumber(panel, "网站卡片字号", 80);
  await expect(nav).not.toHaveAttribute("data-compact", "");
  await expect(nav).toBeVisible();
  expect((await panel.boundingBox())!.width).toBeCloseTo(panelWidth, 1);
  await expect.poll(() => nav.evaluate(element => document.querySelector(".grouped-site-sections")!.getBoundingClientRect().left
    - element.getBoundingClientRect().right)).toBeGreaterThanOrEqual(8);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
});

test("fits enlarged text inside square cards by reducing columns without clipping content", async ({ page }) => {
  await seedLayout(page, { interfaceScale: 125, contentWidthMode: "full", cardShape: "square", cardLayout: "columns", cardColumns: 12 });
  const grid = page.locator(".site-grid"), baseline = await gridGeometry(grid);
  const panel = await openAppearance(page);
  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  await enterNumber(panel, "整体字号", 130);
  const section = panel.locator("summary").filter({ hasText: /^分区字号/ });
  if (!await section.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await section.click();
  await enterNumber(panel, "网站卡片字号", 140);
  await expect.poll(async () => (await gridGeometry(grid)).tracks).toBeLessThan(baseline.tracks);
  await expect.poll(async () => (await gridGeometry(grid)).squareError).toBeLessThan(1);
  await expect.poll(() => page.locator(".site-name").first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(14 * 1.25 * 1.3 * 1.4, 2);
  try { await expect.poll(() => cardContentOverflow(grid)).toEqual([]); }
  catch (error) { await saveDiagnostic(page, "large-text-square-overflow", await cardContentOverflow(grid)); throw error; }
  await page.screenshot({ path: screenshotPath("layout-settings-square-large-text.png"), animations: "disabled" });
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.reload();
  await expect.poll(() => cardContentOverflow(grid)).toEqual([]);
  await expect.poll(async () => (await gridGeometry(grid)).squareError).toBeLessThan(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance)).toMatchObject({ cardColumns: 12,
    interfaceScale: 125, fontScale: 130, cardFontScale: 140, cardShape: "square" });
});

test("keeps large footer icons and open arrows inside square cards at normal and minimum text sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1418, height: 900 });
  await seedLayout(page, { contentWidthMode: "full", cardShape: "square", cardLayout: "columns", cardColumns: 12, groupIconSize: 28 });
  const grid = page.locator(".site-grid");
  await expect.poll(() => cardContentOverflow(grid)).toEqual([]);
  await expect.poll(async () => (await gridGeometry(grid)).squareError).toBeLessThan(1);
  const panel = await openAppearance(page);
  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  await enterNumber(panel, "整体字号", 70);
  const section = panel.locator("summary").filter({ hasText: /^分区字号/ });
  if (!await section.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await section.click();
  await enterNumber(panel, "网站卡片字号", 80);
  await expect.poll(() => cardContentOverflow(grid)).toEqual([]);
  await expect.poll(async () => (await gridGeometry(grid)).squareError).toBeLessThan(1);
  await page.screenshot({ path: screenshotPath("layout-settings-square-small-text-large-footer.png"), animations: "disabled" });
});

test("scales interface geometry and text once while keeping portals and settings usable", async ({ page }) => {
  await seedLayout(page, { contentWidth: 960, cardHeight: 240, fontScale: 110, cardFontScale: 130, brandFontScale: 120, groupFontScale: 90 });
  const measure = () => page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    return { topbar: box(".topbar").height, logo: box(".topbar .brand-mark").width,
      search: box(".search-input").height, icon: box(".site-card .favicon-large").width,
      cardHeight: box("[data-site-dnd-id]").height,
      gap: parseFloat(getComputedStyle(document.querySelector(".site-grid")!).columnGap),
      title: parseFloat(getComputedStyle(document.querySelector(".collection-heading h2")!).fontSize),
      siteName: parseFloat(getComputedStyle(document.querySelector(".site-name")!).fontSize) };
  });
  const baseline = await measure();
  const savedAppearance = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance);
  const panel = await openAppearance(page);
  await expandGeometry(panel);
  for (const scale of [75, 125, 150]) {
    await enterNumber(panel, "界面缩放", scale);
    for (const key of Object.keys(baseline) as Array<keyof typeof baseline>) {
      await expect.poll(async () => Math.abs((await measure())[key] - baseline[key] * scale / 100), `${key} scales once at ${scale}%`).toBeLessThan(1);
    }
    await expectInViewport(page, panel);
    await expectInViewport(page, panel.getByRole("button", { name: "保存设置", exact: true }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: screenshotPath(`layout-settings-interface-${scale}.png`), animations: "disabled" });
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance)).toEqual(savedAppearance);
  await enterNumber(panel, "界面缩放", 125);
  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  const enhancement = panel.locator("summary").filter({ hasText: /^文字增强/ });
  await enhancement.click();
  await panel.getByRole("button", { name: "文字增强说明", exact: true }).click();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expectInViewport(page, tooltip);
  await expect(tooltip).toHaveCSS("font-family", await page.locator("html").evaluate(element => getComputedStyle(element).fontFamily));
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance)).toMatchObject({ interfaceScale: 125,
    fontScale: 110, cardFontScale: 130, brandFontScale: 120, groupFontScale: 90 });
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "管理分组", exact: true });
  await expectInViewport(page, manager);
  await expect(manager.getByRole("button", { name: "取消", exact: true })).toBeVisible();
  await page.screenshot({ path: screenshotPath("layout-settings-scaled-manager-portal.png"), animations: "disabled" });
});

test("shares scaled square columns with history overview and detail and keeps the data page usable", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "chrome", { configurable: true, value: {
    runtime: { id: "layout-history-test" },
    permissions: { contains: async () => true, request: async () => true },
    history: { search: async () => Array.from({ length: 24 }, (_, host) =>
      Array.from({ length: 6 }, (_, item) => ({ id: `layout-history-${host}-${item}`,
        title: `布局历史 ${host + 1} / ${item + 1}`, url: `https://layout-history-${host}.example/page-${item}`,
        lastVisitTime: Date.now() - host * 1000 - item, visitCount: 2 }))).flat() },
  } }));
  await seedLayout(page, { interfaceScale: 125, contentWidth: 1440, cardShape: "square", cardLayout: "columns", cardColumns: 6 });
  const main = page.locator("main.page-container"), collectionWidth = (await main.boundingBox())!.width;
  await page.getByRole("button", { name: "打开历史记录", exact: true }).click();
  await expect(page.locator(".history-site-card")).toHaveCount(24);
  await expectSquareGrid(page.locator(".history-site-grid"), 6, "[data-history-dnd-id]");
  await expect.poll(async () => (await main.boundingBox())!.width).toBeCloseTo(collectionWidth, 0);
  await expect(page.locator(".browser-history .search-input")).toHaveCSS("height", "65px");
  await page.screenshot({ path: screenshotPath("layout-settings-history-square-scaled.png"), animations: "disabled" });
  await page.locator(".history-site-open").first().click();
  await expect(page.locator(".history-url-card")).toHaveCount(6);
  await expectSquareGrid(page.locator(".history-url-grid"), 6, "[data-history-dnd-id]");
  await page.screenshot({ path: screenshotPath("layout-settings-history-detail-square-scaled.png"), animations: "disabled" });
  await page.getByRole("button", { name: "打开数据", exact: true }).click();
  const data = page.getByRole("region", { name: "数据页面", exact: true });
  await expect(data).toBeVisible();
  await expect.poll(async () => (await main.boundingBox())!.width).toBeCloseTo(collectionWidth, 0);
  for (const mode of ["导入", "导出"]) {
    await data.getByRole("button", { name: mode, exact: true }).click();
    await expect.poll(() => data.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
  await expect(data.getByRole("button", { name: "导出 JSON", exact: true })).toBeEnabled();
  await page.screenshot({ path: screenshotPath("layout-settings-data-scaled.png"), animations: "disabled" });
});

for (const scale of [125, 150]) {
  test(`drops a scaled square card at the real target and keeps the saved order at ${scale}%`, async ({ page }) => {
    await seedLayout(page, { interfaceScale: scale, contentWidth: 960, cardWidth: 132, cardShape: "square", cardLayout: "columns", cardColumns: 4 });
    await page.getByRole("tab", { name: /布局测试 A/ }).click();
    const source = page.getByTestId("site-card-layout-a-0"), target = page.getByTestId("site-card-layout-a-1");
    const start = (await source.boundingBox())!, end = (await target.boundingBox())!;
    const x = start.x + start.width / 2, y = start.y + start.height * .65;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 55, y);
    const overlay = page.getByTestId("site-card-drag-preview");
    await expect(overlay).toBeVisible();
    await expect(source).toHaveCSS("opacity", "0.46");
    expect((await overlay.boundingBox())!.width).toBeCloseTo(start.width, 0);
    expect((await overlay.boundingBox())!.height).toBeCloseTo(start.height, 0);
    await page.mouse.move(end.x + end.width * .8, end.y + end.height / 2, { steps: 12 });
    await expect.poll(async () => (await target.boundingBox())!.x).toBeLessThan(end.x - 30);
    await page.screenshot({ path: screenshotPath(`layout-settings-drag-${scale}-held.png`), animations: "disabled" });
    await page.mouse.up();
    await expect(overlay).toHaveCount(0);
    const ids = () => page.locator(".site-grid > [data-site-dnd-id]").evaluateAll(elements => elements.map(element => element.getAttribute("data-testid")));
    await expect.poll(async () => (await ids()).slice(0, 2)).toEqual(["site-card-layout-a-1", "site-card-layout-a-0"]);
    const savedOrder = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).sites
      .filter((site: { groupId: string }) => site.groupId === "layout-a").sort((a: { order: number }, b: { order: number }) => a.order - b.order)
      .map((site: { id: string }) => site.id));
    expect(savedOrder.slice(0, 2)).toEqual(["layout-a-1", "layout-a-0"]);
    await page.reload();
    await page.getByRole("tab", { name: /布局测试 A/ }).click();
    await expect.poll(async () => (await ids()).slice(0, 2)).toEqual(["site-card-layout-a-1", "site-card-layout-a-0"]);
    await page.screenshot({ path: screenshotPath(`layout-settings-drag-${scale}-saved.png`), animations: "disabled" });
  });
}
