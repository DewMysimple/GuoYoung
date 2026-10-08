import { expect, test, screenshotPath } from "./fixtures";
import type { Page } from "@playwright/test";

async function expectVisibleTextColor(page: Page, expected: string) {
  const mismatches = await page.locator("body *").evaluateAll((elements, expected) => elements.flatMap(element => {
    const directText = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join("").trim();
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    if (!directText || !box.width || !box.height || style.visibility === "hidden" || style.display === "none") return [];
    return style.color === expected ? [] : [{ tag: element.tagName, class: element.className, text: directText.slice(0, 40), color: style.color }];
  }), expected);
  expect(mismatches, "All rendered text follows the unified palette").toEqual([]);
}

async function expectControlIconColor(page: Page, expected: string) {
  const mismatches = await page.locator('svg[fill="currentColor"]:not(.brand-mark svg):not(.favicon-frame svg)').evaluateAll((icons, expected) => icons.flatMap(icon => {
    const box = icon.getBoundingClientRect(), style = getComputedStyle(icon);
    return box.width && box.height && style.visibility !== "hidden" && style.color !== expected
      ? [{ class: icon.getAttribute("class"), color: style.color }] : [];
  }), expected);
  expect(mismatches, "All functional icons use the independent color").toEqual([]);
}

test("shares pure theme colors across navigation, menus, settings and group management", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop color acceptance");
  await page.route("https://colors.example/wallpaper.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#41849c"/></svg>' }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://colors.example/wallpaper.svg" };
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByRole("navigation", { name: "分组定位" })).toBeVisible();
  for (const [theme, color] of [["light", "rgb(0, 0, 0)"], ["dark", "rgb(255, 255, 255)"]]) {
    await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
    for (const selector of [".site-name", ".site-domain", ".site-category", ".category-tab.active", ".topbar-history-button.active", ".collection-heading p"]) {
      await expect(page.locator(selector).first()).toHaveCSS("color", color);
    }
    await page.locator(".view-control-button").filter({ hasText: "手动排列" }).click();
    const menu = page.getByRole("menu", { name: "排列方式" });
    await expect(menu.getByRole("menuitemradio").first()).toHaveCSS("color", color);
    await expect(menu.locator("svg").first()).toHaveCSS("color", color);
    await expectVisibleTextColor(page, color);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "打开设置" }).click();
    const panel = page.getByRole("dialog", { name: "设置", exact: true });
    await panel.getByRole("tab", { name: "字体调节" }).click();
    for (const selector of [".settings-tabs .active", ".typography-font-label", ".typography-font-sample", ".typography-size .range-control > span", ".typography-size .range-control-number", ".typography-size .range-control-number input"]) {
      await expect(panel.locator(selector).first()).toHaveCSS("color", color);
    }
    await expect(panel.locator(".typography-size .range-control-number")).toHaveCSS("opacity", "1");
    await expectVisibleTextColor(page, color);
    await panel.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "管理分组", exact: true }).click();
    const manager = page.getByRole("dialog", { name: "管理分组", exact: true });
    await expect(manager.locator(".group-icon-choice.selected")).toHaveCSS("color", color);
    await expect(manager.locator(".group-icon-choice svg").first()).toHaveCSS("color", color);
    await expectVisibleTextColor(page, color);
    await page.screenshot({ path: screenshotPath(`global-colors-manager-${theme}.png`) });
    await manager.getByRole("button", { name: "取消", exact: true }).click();
  }
});

test("previews global unified/split colors and independent icons, cancels and persists", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop color acceptance");
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByRole("navigation", { name: "分组定位" })).toBeVisible();
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "字体调节" }).click();
  await panel.locator("summary").filter({ hasText: "文字颜色" }).click();
  await panel.getByRole("checkbox", { name: "主题关联字体颜色" }).uncheck();
  await panel.getByRole("button", { name: "薄荷文字" }).click();
  const primary = "rgb(190, 248, 237)", secondary = "rgb(158, 214, 205)";
  await expect(page.locator(".site-domain").first()).toHaveCSS("color", primary);
  await expect(panel.getByRole("heading", { name: "字体", exact: true })).toHaveCSS("color", primary);
  await panel.getByRole("checkbox", { name: "区分主次文字" }).check();
  await expect(page.locator(".site-domain").first()).toHaveCSS("color", secondary);
  await expect(page.locator(".site-name").first()).toHaveCSS("color", primary);
  await panel.getByRole("checkbox", { name: "区分主次文字" }).uncheck();
  await panel.getByRole("checkbox", { name: "图标跟随文字" }).uncheck();
  await panel.getByRole("button", { name: "自定义图标颜色" }).click();
  await panel.getByRole("textbox", { name: "十六进制颜色" }).fill("fcab12");
  await panel.getByRole("textbox", { name: "十六进制颜色" }).press("Enter");
  await panel.getByRole("button", { name: "自定义图标颜色" }).click();
  await expect(page.locator(".topbar-history-button.active svg")).toHaveCSS("color", "rgb(252, 171, 18)");
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(page.locator(".site-domain").first()).toHaveCSS("color", primary);
  await expect(page.locator(".topbar-history-button.active svg")).toHaveCSS("color", "rgb(252, 171, 18)");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".site-domain").first()).toHaveCSS("color", primary);
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "管理分组", exact: true });
  await expect(manager.locator(".group-icon-choice svg").first()).toHaveCSS("color", "rgb(252, 171, 18)");
  await expect(manager.getByRole("heading", { name: "管理分组", exact: true })).toHaveCSS("color", primary);
  await expectControlIconColor(page, "rgb(252, 171, 18)");
  await manager.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "打开数据", exact: true }).click();
  await expectVisibleTextColor(page, primary);
  await expectControlIconColor(page, "rgb(252, 171, 18)");
  await page.getByRole("button", { name: "打开收藏主页", exact: true }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("tab", { name: "字体调节" }).click();
  await panel.getByRole("button", { name: "恢复默认字体" }).click();
  await expect(page.locator(".site-name").first()).toHaveCSS("color", "rgb(232, 236, 243)");
  await expect(page.locator(".topbar-history-button.active svg")).toHaveCSS("color", "color(srgb 0.552 0.667451 0.916392)");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".site-domain").first()).toHaveCSS("color", primary);
  await expect(page.locator(".topbar-history-button.active svg")).toHaveCSS("color", "rgb(252, 171, 18)");
});
