import { expect, test, screenshotPath } from "./fixtures";

test("previews themes, rolls back, persists explicit choice and follows live system changes", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  const root = page.locator("html");
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(panel.getByRole("button", { name: "跟随系统", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "深色", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(panel).toHaveCSS("background-color", "color(srgb 0.12549 0.141176 0.176471 / 0.97)");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance.theme)).toBe("system");
  await page.screenshot({ path: screenshotPath(`theme-dark-settings-${testInfo.project.name}.png`), animations: "disabled" });
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("button", { name: "深色", exact: true }).focus();
  await page.keyboard.press("Enter");
  await panel.getByRole("button", { name: "紧凑", exact: true }).click();
  await expect(panel.getByRole("button", { name: "深色", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("button", { name: "浅色", exact: true }).click();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("button", { name: "跟随系统", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "管理分组", exact: true });
  await expect(manager).toHaveCSS("background-color", "rgb(32, 36, 45)");
  await page.screenshot({ path: screenshotPath(`theme-dark-manager-${testInfo.project.name}.png`), animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("keeps v15 installations light and discards a theme-only draft on close", async ({ page }) => {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.version = 15;
    delete state.appearance.theme;
    state.sites.find((site: { id: string }) => site.id === "github").iconSource = "brand";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await expect(panel.getByRole("button", { name: "浅色", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "深色", exact: true }).click();
  await expect(page.getByTestId("site-card-github").getByTestId("favicon-selected-brand"))
    .toHaveCSS("background-color", "rgb(238, 241, 245)");
  await panel.getByRole("button", { name: "返回收藏主页" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
