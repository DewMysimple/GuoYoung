import { expect, test, screenshotPath } from "./fixtures";

test("preserves historical plain-theme hierarchy and scopes monochrome to wallpaper", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop appearance acceptance");
  for (const [theme, primary, secondary, faint] of [
    ["light", "#171c26", "#596273", "#778091"],
    ["dark", "#e8ecf3", "#bac3d2", "#99a5b8"],
  ]) {
    await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return ["--theme-text", "--theme-text-secondary", "--theme-text-faint"].map(key => style.getPropertyValue(key).trim());
    })).toEqual([primary, secondary, faint]);
    const colors = await page.locator(".site-card").first().evaluate(card => [".site-name", ".site-domain"].map(selector => getComputedStyle(card.querySelector(selector)!).color));
    expect(colors[0]).not.toBe(colors[1]);
  }
});

test("help is reachable by hover and keyboard without toggling settings or clipping", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop help acceptance");
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "字体调节" }).click();
  await panel.locator("summary").filter({ hasText: "文字颜色" }).click();
  const checkbox = panel.getByRole("checkbox", { name: "主题关联字体颜色", exact: true });
  const help = panel.getByRole("button", { name: "主题关联字体颜色说明", exact: true });
  await help.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("无壁纸时保留主题的主次层次");
  await expect(tooltip).toHaveCSS("border-radius", "12px");
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await help.click();
  await expect(checkbox).toBeChecked();
  const box = await tooltip.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: screenshotPath("help-plain-theme.png") });
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await expect(panel).toBeVisible();
  await checkbox.focus();
  await help.focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
});

test("wallpaper controls share translucent surfaces and hover keeps card geometry stable", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop glass acceptance");
  await page.route("https://polish.example/background.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#367b9b"/><circle cx="900" cy="400" r="350" fill="#b5d3c7"/></svg>' }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.appearance.theme = "dark";
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://polish.example/background.svg", overlay: 0 };
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  expect(await page.locator(".group-section-nav li").first().evaluate(el => getComputedStyle(el, "::before").content)).toBe("none");
  const card = page.locator(".site-card").first();
  const before = await card.boundingBox();
  await card.hover();
  await expect(card).toHaveCSS("transform", "none");
  expect(await card.boundingBox()).toEqual(before);
  await page.locator(".view-control-button").filter({ hasText: "显示" }).click();
  await expect(page.locator(".view-popover")).toHaveCSS("animation-name", "none");
  const hit = await page.locator(".view-popover").evaluate(el => {
    const rect = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 12));
  });
  expect(hit).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  for (const selector of [".group-editor-icon", ".group-manager-check:not([aria-pressed=true])"]) {
    expect(await page.locator(selector).first().evaluate(el => {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = getComputedStyle(el).backgroundColor; ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data[3];
    })).toBeLessThan(100);
  }
  await page.getByRole("button", { name: "管理分组说明", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.getByRole("tooltip").hover();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "管理分组", exact: true })).toBeVisible();
  await page.screenshot({ path: screenshotPath("manager-translucent-controls.png") });
});
