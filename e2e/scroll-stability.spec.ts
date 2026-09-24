import { expect, test, screenshotPath } from "./fixtures";

// Headless Chromium normally hides scrollbars, masking the Windows layout bug.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("keeps settings card edges fixed when expanded content needs a scrollbar", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1320 });
  await page.evaluate(() => localStorage.setItem("site-hub:settings-panel-width", "580"));
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  const card = panel.getByRole("region", { name: "主题", exact: true });
  const body = panel.locator(".settings-body");
  await expect(panel).toHaveCSS("width", "580px");
  await expect.poll(() => body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(false);
  await card.hover();
  const before = (await card.boundingBox())!;
  await panel.getByRole("button", { name: "布局微调" }).click();
  await expect.poll(() => body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  const expanded = (await card.boundingBox())!;
  expect(expanded.x).toBeCloseTo(before.x, 1);
  expect(expanded.width).toBeCloseTo(before.width, 1);
  await page.screenshot({ path: screenshotPath(`settings-stable-scroll-${info.project.name}.png`) });
  await panel.getByRole("button", { name: "布局微调" }).click();
  await expect.poll(() => body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(false);
  expect((await card.boundingBox())!.width).toBeCloseTo(before.width, 1);
});

test("keeps the workspace width when page overflow and modal scroll locks change", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const heading = page.locator(".collection-heading");
  const before = (await heading.boundingBox())!;
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  const grouped = (await heading.boundingBox())!;
  expect(grouped.x).toBeCloseTo(before.x, 1);
  expect(grouped.width).toBeCloseTo(before.width, 1);
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  expect((await heading.boundingBox())!.width).toBeCloseTo(grouped.width, 1);
  await page.getByRole("dialog", { name: "管理分组", exact: true }).getByRole("button", { name: "关闭", exact: true }).click();
  expect((await heading.boundingBox())!.width).toBeCloseTo(grouped.width, 1);
});
