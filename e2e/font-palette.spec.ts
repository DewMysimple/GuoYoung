import { expect, test, screenshotPath } from "./fixtures";

test("keeps the palette discoverable in theme mode and preserves inline picker editing", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop typography settings");
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "字体调节" }).click();
  await panel.locator("summary").filter({ hasText: "文字颜色" }).click();
  const theme = panel.getByRole("checkbox", { name: "主题关联字体颜色", exact: true });
  await expect(theme).toBeChecked();
  await expect(panel.getByRole("group", { name: "文字配色预设" }).getByRole("button")).toHaveCount(4);
  const trigger = panel.getByRole("button", { name: "自定义主要文字颜色", exact: true });
  await trigger.click();
  const picker = panel.getByRole("dialog", { name: "选择自定义颜色", exact: true });
  await expect(picker).toBeVisible();
  await expect(theme).toBeChecked(); // Opening does not silently change the palette.
  await expect(picker).toHaveCSS("position", "static");
  await picker.getByRole("textbox", { name: "十六进制颜色" }).fill("4b277c");
  await picker.getByRole("textbox", { name: "十六进制颜色" }).press("Enter");
  await expect(theme).not.toBeChecked();
  await expect(page.locator(".site-name").first()).toHaveCSS("color", "rgb(75, 39, 124)");
  await expect(picker).toBeVisible();
  await page.screenshot({ path: screenshotPath("font-palette-expanded.png"), animations: "disabled" });
  await trigger.click();
  await theme.check();
  await expect(trigger).toBeVisible();
  await panel.getByRole("button", { name: "墨色文字" }).click();
  await expect(theme).not.toBeChecked();
  await panel.getByRole("checkbox", { name: "区分主次文字" }).check();
  await panel.getByRole("button", { name: "自定义次要文字颜色" }).click();
  await expect(picker).toBeVisible();
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".site-name").first()).toHaveCSS("color", "rgb(23, 28, 38)");
});

test("plain themes retain semantic colors and selected font dividers stay distinct", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop typography settings");
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const navigation = page.locator(".topbar-history-button.active");
    const colors = await navigation.evaluate(el => ({ actual: getComputedStyle(el).color, primary: getComputedStyle(document.body).color }));
    expect(colors.actual).not.toBe(colors.primary);
    await page.getByRole("button", { name: "打开设置" }).click();
    const panel = page.getByRole("dialog", { name: "设置", exact: true });
    await panel.getByRole("tab", { name: "字体调节" }).click();
    for (const font of ["默认字体", "系统字体", "霞鹜文楷"]) {
      const button = panel.getByRole("button", { name: font, exact: true });
      await button.click();
      const divider = button.locator(".typography-font-label");
      await expect(divider).toHaveCSS("border-top-width", "1px");
      const style = await divider.evaluate(el => ({ line: getComputedStyle(el).borderTopColor, edge: getComputedStyle(el.parentElement!).borderTopColor, background: getComputedStyle(el.parentElement!).backgroundColor }));
      expect(style.line).toBe(style.edge);
      expect(style.line).not.toBe(style.background);
    }
    await page.screenshot({ path: screenshotPath(`font-divider-${theme}.png`), animations: "disabled" });
    await panel.getByRole("button", { name: "取消", exact: true }).click();
  }
});
