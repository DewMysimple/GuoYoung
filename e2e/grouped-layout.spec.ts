import { expect, test, screenshotPath } from "./fixtures";
import { LAYOUT_PRESETS } from "../src/data/defaults";

test("aligns group headers, actions and cards across layout sizes and long names", async ({ page }, testInfo) => {
  for (const [preset, geometry] of Object.entries(LAYOUT_PRESETS)) {
    await page.evaluate(({ preset, geometry }) => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      state.displayModeByWorkspace.main = "grouped";
      state.appearance = { ...state.appearance, ...geometry, layoutPreset: preset, fontScale: 110 };
      state.groups.find((group: { id: string }) => group.id === "search").name = "网站审美与交互设计参考收藏";
      localStorage.setItem("site-hub:v1", JSON.stringify(state));
    }, { preset, geometry });
    await page.reload();
    const first = page.locator('[data-group-sort-section-id="search"]');
    await expect(first).toBeVisible();
    await first.locator(".grouped-site-header-main").hover();
    const boxes = await first.evaluate(section => {
      const rect = (element: Element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, cy: box.top + box.height / 2, width: box.width };
      };
      const child = (selector: string) => rect(section.querySelector(selector)!);
      return {
        heading: rect(document.querySelector(".collection-heading")!),
        icon: child(".grouped-site-icon"), add: child(".group-add-trigger"),
        manage: child(".grouped-site-manage"), select: child(".grouped-site-multi-select"),
        card: child(".site-card"), title: child("h3"), count: child(".grouped-site-count"),
        // The reserved scrollbar gutter can make content narrower than the viewport.
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(Math.abs(boxes.heading.left - boxes.icon.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes.icon.left - boxes.card.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes.heading.right - boxes.select.right)).toBeLessThanOrEqual(1);
    for (const button of [boxes.add, boxes.manage, boxes.select]) expect(Math.abs(button.cy - boxes.icon.cy)).toBeLessThanOrEqual(1);
    expect(boxes.title.width).toBeGreaterThan(16);
    expect(boxes.title.right).toBeLessThanOrEqual(boxes.count.left);
    expect(boxes.add.right).toBeLessThanOrEqual(boxes.select.left);
    expect(boxes.overflow).toBe(false);
    await page.screenshot({ path: screenshotPath(`grouped-alignment-${preset}-${testInfo.project.name}.png`), fullPage: true, animations: "disabled" });
    await first.getByRole("heading", { level: 3 }).dblclick();
    const selectionBox = await first.locator(".group-selection-trigger").boundingBox();
    expect(Math.abs(selectionBox!.x - boxes.add.left)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
  }
});

test("group insertion menu keeps keyboard focus and only one menu open", async ({ page }) => {
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  const search = page.getByRole("button", { name: "在 搜索 附近添加分组" });
  await search.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "在“搜索”前添加" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "在“搜索”后添加" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).toBeFocused();
  await expect(page.getByRole("menu", { name: "添加到 搜索 附近" })).toHaveCount(0);
  await search.click();
  const develop = page.getByRole("button", { name: "在 开发 附近添加分组" });
  await develop.focus();
  await develop.click();
  await expect(page.getByRole("menu", { name: "添加到 搜索 附近" })).toHaveCount(0);
  await expect(page.getByRole("menu", { name: "添加到 开发 附近" })).toBeVisible();
  const menu = (await page.getByRole("menu", { name: "添加到 开发 附近" }).boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("group-sort-vertical-drag-preview")).toHaveCount(0);
});

test("group action buttons cannot start a group drag or title selection", async ({ page }) => {
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  const section = page.locator('[data-group-sort-section-id="search"]');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).groups);
  for (const selector of [".group-add-trigger", ".grouped-site-manage", ".grouped-site-multi-select"]) {
    const box = (await section.locator(selector).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + 65, { steps: 8 });
    await expect(page.locator(".group-sort-drag-preview")).toHaveCount(0);
    await page.mouse.up();
    await expect(section).not.toHaveClass(/is-group-selected|is-group-sorting/);
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).groups)).toEqual(before);
});

test("cancels pending and active collection sensors on page loss and can drag again", async ({ page }) => {
  const card = page.getByTestId("site-card-google");
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).sites);
  for (const [distance, event] of [[10, "pagehide"], [55, "pointercancel"]] as const) {
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 65);
    await page.mouse.down();
    await page.mouse.move(box.x + 40 + distance, box.y + 65);
    if (distance > 50) await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
    else await expect(card).toHaveClass(/is-drag-pending/);
    await page.evaluate(event => window.dispatchEvent(new Event(event)), event);
    await expect(page.getByTestId("site-card-drag-preview")).toHaveCount(0);
    await expect(card).not.toHaveClass(/is-drag-pending|is-dragging/);
    await page.mouse.up();
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).sites)).toEqual(before);
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  const groupsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).groups);
  for (const handle of [page.locator('.grouped-site-header-main').first(), page.getByRole("tab", { name: /搜索/ })]) {
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    const x = box.x + 20, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 3, y);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    // A canceled tab press must not open its 450ms long-press manager either.
    await page.waitForTimeout(520);
    await expect(page.getByRole("dialog", { name: "管理分组", exact: true })).toHaveCount(0);
    await page.mouse.move(x + 25, y);
    await expect(page.locator('.group-sort-drag-preview')).toHaveCount(0);
    await page.mouse.up();
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).groups)).toEqual(groupsBefore);
});
