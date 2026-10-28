import { expect, screenshotPath, test } from "./fixtures";

test("keeps layout presets visible when collapsed and exposes concise help on demand", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop appearance disclosures");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  const layout = panel.getByRole("button", { name: "页面布局", exact: true });
  await expect(layout).toHaveAttribute("aria-expanded", "false");
  for (const name of ["紧凑", "标准", "宽松"]) {
    await expect(panel.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(panel.getByRole("group", { name: "页面宽度模式", exact: true })).toBeHidden();
  await expect(panel.getByRole("button", { name: /布局微调/ })).toBeHidden();
  await panel.getByRole("button", { name: "宽松", exact: true }).click();
  await expect(panel.getByRole("button", { name: "宽松", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(layout).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: screenshotPath("appearance-layout-collapsed.png"), animations: "disabled" });

  for (const [label, content] of [["界面缩放说明", "一起调整卡片、文字、图标与间距"],
    ["主题说明", "选择界面的明暗，或随系统自动切换"], ["页面布局说明", "选择喜欢的疏密，卡片与间距一起调整"]]) {
    await panel.getByRole("button", { name: label, exact: true }).focus();
    await expect(page.getByRole("tooltip")).toContainText(content);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(layout).toHaveAttribute("aria-expanded", "false");
  }

  await layout.focus();
  await page.keyboard.press("Enter");
  await expect(layout).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByRole("group", { name: "页面宽度模式", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "正方形", exact: true }).click();
  await panel.getByRole("button", { name: "卡片排列说明", exact: true }).click();
  await expect(page.getByRole("tooltip")).toContainText("根据卡片最小宽度自动排列");
  await expect(page.getByRole("tooltip")).toContainText("正方形的高度始终跟随实际宽度");
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await page.screenshot({ path: screenshotPath("appearance-layout-expanded.png"), animations: "disabled" });
  await layout.focus();
  await page.keyboard.press("Space");
  await expect(layout).toHaveAttribute("aria-expanded", "false");
  await expect(panel.getByRole("group", { name: "卡片形状", exact: true })).toBeHidden();
  for (const name of ["紧凑", "标准", "宽松"]) await expect(panel.getByRole("button", { name, exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "取消", exact: true }).click();
});
