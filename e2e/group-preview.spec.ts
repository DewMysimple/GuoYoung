import type { Locator, Page } from "@playwright/test";
import { expect, test, screenshotPath } from "./fixtures";

async function expectContained(preview: Locator) {
  const geometry = await preview.evaluate(element => {
    const outer = element.getBoundingClientRect();
    return {
      width: outer.width,
      overflow: element.scrollWidth - element.clientWidth,
      children: [...element.querySelectorAll<HTMLElement>(
        ".group-sort-preview-heading, .group-sort-preview-grip, .group-sort-preview-sites, .group-sort-preview-site, .group-sort-preview-more, .group-sort-preview-empty",
      )].map(child => {
        const rect = child.getBoundingClientRect();
        return { name: child.className, left: rect.left - outer.left, right: outer.right - rect.right };
      }),
    };
  });
  expect(geometry.width).toBeLessThanOrEqual(360);
  expect(geometry.overflow, "Preview contents must not escape the card").toBeLessThanOrEqual(1);
  for (const child of geometry.children) {
    expect(child.left, `${child.name} left edge`).toBeGreaterThanOrEqual(0);
    expect(child.right, `${child.name} right edge`).toBeGreaterThanOrEqual(0);
  }
}

async function beginDrag(page: Page, touch: boolean) {
  const handle = page.locator('[data-group-sort-section-id="search"] .grouped-site-header-main');
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const start = { x: box.x + 20, y: box.y + box.height / 2 };
  const end = { x: start.x + 16, y: start.y + 24 };
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [end] });
    return async () => {
      await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await session.detach();
    };
  }
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  return async () => { await page.keyboard.press("Escape"); await page.mouse.up(); };
}

test("contains long group and site names in single, batch and empty drag previews", async ({ page }, info) => {
  const touch = info.project.name === "mobile";
  await page.setViewportSize({ width: touch ? 360 : 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: touch ? "dark" : "light" });
  const groupName = "网站审美与交互设计参考资源整理";
  for (const count of [11, 1, 0]) {
    await page.evaluate(({ count, groupName }) => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      state.displayModeByWorkspace.main = "grouped";
      state.groups.find((group: { id: string }) => group.id === "search").name = groupName;
      const names = [
        "Three.js – JavaScript 3D Library · Examples and Documentation",
        "MotionSites AI — Official Premium Animation & Interaction Collection",
        "全部模板 - 源铺 · 网站设计、组件与动效资源精选",
      ];
      state.sites = state.sites.filter((site: { groupId: string }) => site.groupId !== "search");
      state.sites.push(...Array.from({ length: count }, (_, index) => ({
        ...state.sites[0], id: `preview-${index}`, groupId: "search", name: names[index % names.length],
        url: `https://example.com/preview/${index}`, iconSource: "brand", order: index, globalOrder: index + 100,
      })));
      localStorage.setItem("site-hub:v1", JSON.stringify(state));
    }, { count, groupName });
    await page.reload();
    await expect(page.getByRole("heading", { level: 3, name: groupName, exact: true })).toBeVisible();
    const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
    const cancel = await beginDrag(page, touch);
    const preview = page.getByTestId("group-sort-vertical-drag-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(`${count} 个网站`);
    await expect(preview.locator(".group-sort-preview-site")).toHaveCount(Math.min(count, 3));
    if (count === 11) await expect(preview.locator(".group-sort-preview-more")).toHaveText("+8");
    if (!count) await expect(preview).toContainText("空分组");
    await page.screenshot({ path: screenshotPath(`group-preview-${count}-${info.project.name}.png`), animations: "disabled" });
    await expectContained(preview);
    await cancel();
    await expect(preview).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);

    if (count === 11) {
      await page.getByRole("heading", { level: 3, name: groupName, exact: true }).dblclick();
      await page.getByRole("heading", { level: 3, name: "设计", exact: true }).click();
      const cancelBatch = await beginDrag(page, touch);
      await expect(preview).toContainText("2 个分组 · 13 个网站");
      await expect(preview.locator(".group-sort-preview-more")).toHaveText("+10");
      await expectContained(preview);
      await page.screenshot({ path: screenshotPath(`group-preview-batch-${info.project.name}.png`), animations: "disabled" });
      await cancelBatch();
      await expect(preview).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
    }
  }
});
