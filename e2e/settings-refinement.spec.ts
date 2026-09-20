import { expect, test, screenshotPath } from "./fixtures";

test("restores layout defaults and the last chosen preset across settings tabs", async ({ page }) => {
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("button", { name: "宽松", exact: true }).click();
  await panel.getByRole("button", { name: /布局微调/ }).click();
  await panel.getByRole("slider", { name: "卡片高度" }).fill("220");
  await panel.getByRole("button", { name: "使用颜色 #00897b" }).click();
  await panel.getByRole("tab", { name: /数据/ }).click();
  await panel.getByRole("tab", { name: /外观/ }).click();
  await panel.getByRole("button", { name: /布局微调/ }).click();
  await panel.getByRole("button", { name: "恢复上次预设", exact: true }).click();
  await expect(panel.getByRole("slider", { name: "卡片高度" })).toHaveValue("168");
  await expect(panel.getByRole("button", { name: "使用颜色 #00897b" })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "恢复默认", exact: true }).click();
  await expect(panel.getByRole("slider", { name: "卡片高度" })).toHaveValue("140");
  await panel.getByRole("button", { name: "恢复上次预设", exact: true }).click();
  await panel.getByRole("slider", { name: "卡片高度" }).fill("212");
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance))
    .toMatchObject({ cardHeight: 212, cardWidth: 190, accentColor: "#00897b" });
});

test("resizes the topbar live with cancel, keyboard, save and reload", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Direct boundary resizing is a desktop interaction");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const bar = page.locator(".topbar");
  const handle = page.getByRole("separator", { name: "调整顶栏高度", exact: true });
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(bar).toHaveCSS("height", "68px");
  await page.reload();
  await expect(bar).toHaveCSS("height", "68px");
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await expect(panel).toHaveCSS("box-shadow", "none");
  await panel.locator(".interface-dimensions summary").click();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20, { steps: 8 });
  await expect(bar).toHaveCSS("height", "88px");
  await page.mouse.up();
  await expect(panel.getByRole("slider", { name: "顶栏高度" })).toHaveValue("88");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance.topbarHeight)).toBe(68);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(bar).toHaveCSS("height", "68px");

  await page.getByRole("button", { name: "打开设置" }).click();
  await handle.focus();
  await page.keyboard.press("End");
  await expect(bar).toHaveCSS("height", "96px");
  const second = (await handle.boundingBox())!;
  await page.mouse.move(second.x + 42, second.y + 6);
  await page.mouse.down();
  await page.mouse.move(second.x + 42, second.y - 14);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await expect(bar).toHaveCSS("height", "96px");
  await expect(page.locator("html")).not.toHaveClass(/resizing-y/);
  await page.screenshot({ path: screenshotPath("topbar-resize-desktop.png"), animations: "disabled" });
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(bar).toHaveCSS("height", "96px");
  await handle.dblclick();
  await expect(bar).toHaveCSS("height", "64px");
});

test("coordinates wallpaper surfaces and exposes the reorganized data tools", async ({ page }, testInfo) => {
  await page.route("https://example.test/waves.svg", (route) => route.fulfill({ contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#065f73"/><circle cx="20" cy="20" r="10" fill="#b9f4ff"/></pattern></defs><rect width="1600" height="1000" fill="url(#p)"/></svg>' }));
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  await panel.getByLabel("网络图片地址").fill("https://example.test/waves.svg");
  await expect(panel.getByAltText("当前壁纸预览")).toBeVisible();
  await panel.getByRole("button", { name: "柔和背景", exact: true }).click();
  await expect(panel.getByRole("slider", { name: "模糊", exact: true })).toHaveValue("6");
  await panel.getByRole("button", { name: "保存设置" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  const surface = await page.locator('.category-tab:not(.active)').first().evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(surface).not.toBe("rgba(0, 0, 0, 0)");
  for (const selector of [".collection-toolbar", ".collection-heading", ".footer"]) {
    await expect(page.locator(selector)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(await page.locator(selector).evaluate((element) => getComputedStyle(element, "::before").backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  }
  await expect(page.locator(".manage-groups-button")).toHaveCSS("border-radius", "10px");
  await expect(page.locator(".footer > span")).toHaveCSS("text-shadow", "none");
  const caption = await page.locator(".footer > span").boundingBox();
  const footer = await page.locator(".footer").boundingBox();
  expect(caption!.width).toBeLessThan(footer!.width * 0.6);
  await page.screenshot({ path: screenshotPath(`wallpaper-coordination-${testInfo.project.name}.png`), animations: "disabled" });
  await page.getByRole("button", { name: "打开回收站" }).click();
  await expect(panel.getByLabel("收藏数据概况")).toBeVisible();
  await expect(panel.getByRole("button", { name: "收起", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "导入", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "导出", exact: true })).toBeVisible();
  await page.screenshot({ path: screenshotPath(`data-settings-${testInfo.project.name}.png`), animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
});
