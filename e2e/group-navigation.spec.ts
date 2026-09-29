import { expect, test, screenshotPath } from "./fixtures";
import type { Page } from "@playwright/test";

async function seedGroups(page: Page, count = 12) {
  await page.evaluate(count => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    const timestamp = "2026-01-01T00:00:00.000Z";
    state.groups = state.groups.filter((group: { workspace: string; isProtected: boolean }) => group.workspace === "github" || group.isProtected);
    state.groups.find((group: { id: string }) => group.id === "other").order = count;
    state.sites = [];
    for (let i = 0; i < count; i++) {
      state.groups.push({ id: `nav-${i}`, name: i === 2 ? "设计灵感与交互参考资料收藏" : `分组 ${i + 1}`,
        icon: ["star", "code", "palette", "book-open"][i % 4], workspace: "main", isProtected: false,
        order: i, createdAt: timestamp, updatedAt: timestamp });
      for (let j = 0; j < (i === count - 1 ? 0 : 14); j++) state.sites.push({
        id: `site-${i}-${j}`, name: `参考网站 ${i + 1} · ${j + 1}`, url: `https://example.com/${i}/${j}`,
        groupId: `nav-${i}`, order: j, globalOrder: i * 14 + j, clickCount: 0, createdAt: timestamp, updatedAt: timestamp,
      });
    }
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  }, count);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "分组定位" })).toBeVisible();
}

test("group navigator tracks real scroll and locates sections without switching views", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop group navigation");
  await seedGroups(page);
  const nav = page.getByRole("navigation", { name: "分组定位" });
  const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
  await expect(nav.locator('[aria-current="location"]')).toHaveText("分组 1");
  await nav.getByRole("button", { name: "定位到 分组 5", exact: true }).click();
  await expect(nav.locator('[aria-current="location"]')).toHaveText("分组 5");
  await expect.poll(() => page.locator('[data-group-sort-section-id="nav-4"]').evaluate(node =>
    Math.abs(node.getBoundingClientRect().top - document.querySelector(".topbar")!.getBoundingClientRect().bottom - 24)
  )).toBeLessThan(2);
  await page.screenshot({ path: screenshotPath("group-navigation-middle.png") });
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, -650);
  await expect(nav.locator('[aria-current="location"]')).not.toHaveText("分组 5");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(nav.locator('[aria-current="location"]')).toHaveText("其他");
  const list = nav.locator("ol");
  const active = nav.locator('[aria-current="location"]');
  expect((await active.boundingBox())!.y).toBeGreaterThanOrEqual((await list.boundingBox())!.y);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(nav.locator('[aria-current="location"]')).toHaveText("分组 1");
  expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
});

test("group navigator supports keyboard, reduced motion and many groups", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop group navigation");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedGroups(page, 24);
  const nav = page.getByRole("navigation", { name: "分组定位" });
  const last = nav.getByRole("button", { name: "定位到 分组 24", exact: true });
  await last.focus();
  await page.keyboard.press("Enter");
  // A short group near the bottom still remains the clicked destination.
  await expect(nav.locator('[aria-current="location"]')).toHaveText("分组 24");
  await expect(last).toBeFocused();
  expect(await nav.locator("ol").evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: screenshotPath("group-navigation-many.png") });
});

test("navigator follows scope and current group order, and stays clear of content", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop group navigation");
  await seedGroups(page, 4);
  for (const width of [900, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const nav = page.getByRole("navigation", { name: "分组定位" });
    await expect.poll(async () => {
      const rail = (await nav.boundingBox())!;
      const content = (await page.locator(".grouped-site-sections").boundingBox())!;
      return content.x - rail.x - rail.width;
    }).toBeGreaterThanOrEqual(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 900) {
      await page.getByRole("button", { name: "打开设置" }).click();
      await expect(nav).toBeHidden();
      await page.getByRole("button", { name: "关闭设置" }).click();
      await expect(nav).toBeVisible();
    }
  }
  const header = (await page.locator(".grouped-site-header-main").first().boundingBox())!;
  await page.mouse.move(header.x + 15, header.y + 15);
  await page.mouse.down();
  await page.mouse.move(header.x + 15, header.y + 30, { steps: 4 });
  await expect(page.getByRole("button", { name: "定位到 分组 1", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "定位到 分组 1", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "全部平铺" }).click();
  await expect(page.getByRole("navigation", { name: "分组定位" })).toHaveCount(0);
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  await page.locator(".category-tab").filter({ hasText: "分组 1" }).click();
  await expect(page.getByRole("navigation", { name: "分组定位" })).toHaveCount(0);
  await page.locator(".category-tab").filter({ hasText: "全部" }).click();
  const order = await page.locator(".grouped-site-section h3").allTextContents();
  expect(await page.locator(".group-section-nav-name").allTextContents()).toEqual(order);
  await page.getByRole("searchbox", { name: "搜索网页或筛选收藏" }).fill("参考");
  await expect(page.getByRole("navigation", { name: "分组定位" })).toHaveCount(0);
});

test("navigator follows saved order, live deletion and the GitHub workspace", async ({ page, context }, info) => {
  test.skip(info.project.name === "mobile", "Desktop group navigation");
  await seedGroups(page, 4);
  const writer = await context.newPage();
  await writer.goto("/");
  await writer.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.groups.find((group: { id: string }) => group.id === "nav-2").order = -1;
    state.groups.find((group: { id: string }) => group.id === "nav-2").name = "更新后的设计组";
    state.groups = state.groups.filter((group: { id: string }) => group.id !== "nav-1");
    state.sites = state.sites.filter((site: { groupId: string }) => site.groupId !== "nav-1");
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  // The web store reads other tabs on reload; live subscriptions belong to the extension store.
  await page.reload();
  await expect(page.locator(".group-section-nav-name").first()).toHaveText("更新后的设计组");
  await expect(page.getByRole("button", { name: "定位到 分组 2", exact: true })).toHaveCount(0);
  await writer.close();
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "管理分组", exact: true });
  await manager.getByRole("button", { name: /分组 1 14 个网站/ }).click();
  await manager.getByRole("button", { name: "删除这个分组", exact: true }).click();
  await manager.getByRole("button", { name: "再次点击删除这个分组", exact: true }).click();
  await expect(page.getByRole("button", { name: "定位到 分组 1", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  await expect(page.getByRole("navigation", { name: "分组定位" })).toHaveCount(0);
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  await expect(page.locator(".group-section-nav-name")).toHaveText(["仓库", "工具", "文档", "其他"]);
  await page.getByRole("button", { name: "定位到 文档", exact: true }).click();
  await expect(page.locator('.group-section-nav [aria-current="location"]')).toHaveText("文档");
});
