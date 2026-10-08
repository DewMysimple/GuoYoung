import { expect, test } from "./fixtures";

test("topbar and sidebar share aligned controls, follow public glass and retain independent drafts", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop panel material settings");
  await page.route("https://panels.example/background.svg", route => route.fulfill({ contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#528cab"/></svg>' }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://panels.example/background.svg",
      topbarStyle: "shared", sidebarStyle: "shared", topbarTransparency: 63, topbarBlur: 7, sidebarTransparency: 81, sidebarBlur: 9 };
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
  const sections = ["顶栏", "侧栏"].map(label => panel.locator("details").filter({
    has: page.locator("summary").filter({ hasText: new RegExp(`^${label}外观`) }),
  }));
  for (const section of sections) {
    await section.locator("summary").click();
    await expect(section.getByRole("group").getByRole("button")).toHaveText(["跟随公共", "独立玻璃底板"]);
    await expect(section.getByRole("slider")).toHaveCount(0);
  }
  await expect(panel.getByRole("checkbox", { name: /玻璃折射/, hidden: true })).toHaveCount(0);
  await expect(panel.getByRole("slider", { name: "折射强度", hidden: true })).toHaveCount(0);
  await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).click();
  await panel.getByRole("slider", { name: "面板透明度" }).fill("73");
  await panel.getByRole("slider", { name: "玻璃磨砂" }).fill("5");
  await panel.getByRole("slider", { name: "色彩饱和度" }).fill("160");
  const topbar = page.locator(".topbar");
  await expect(panel).toHaveCSS("backdrop-filter", "blur(5px) saturate(1.6)");
  await expect.poll(() => topbar.evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toBe("blur(5px) saturate(1.6)");
  await expect.poll(() => topbar.evaluate(el => getComputedStyle(el, "::before").backgroundColor)).toContain("0.27");
  expect(await topbar.evaluate(el => getComputedStyle(el, "::before").backgroundImage)).toBe(await panel.evaluate(el => getComputedStyle(el).backgroundImage));
  for (const [index, label, transparency, blur] of [[0, "顶栏", "63", "7"], [1, "侧栏", "81", "9"]] as const) {
    const section = sections[index];
    await section.getByRole("button", { name: "独立玻璃底板" }).click();
    await expect(section.getByRole("slider", { name: `${label}透明度` })).toHaveValue(transparency);
    await expect(section.getByRole("slider", { name: "模糊强度" })).toHaveValue(blur);
    await section.getByRole("slider", { name: `${label}透明度` }).fill("100");
    await section.getByRole("slider", { name: "模糊强度" }).fill("0");
  }
  await expect(panel).toHaveCSS("backdrop-filter", "none");
  await expect(panel).toHaveCSS("background-image", "none");
  await expect.poll(() => topbar.evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toBe("none");
  await expect.poll(() => topbar.evaluate(el => getComputedStyle(el, "::before").backgroundImage)).toBe("none");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!))).toEqual(original);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  for (const section of sections) await expect(section.getByRole("button", { name: "跟随公共" })).toHaveAttribute("aria-pressed", "true");
  await sections[0].getByRole("button", { name: "独立玻璃底板" }).click();
  await sections[0].getByRole("slider", { name: "顶栏透明度" }).fill("57");
  await sections[0].getByRole("button", { name: "跟随公共" }).click();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  expect(saved).toEqual({ ...original, wallpaper: { ...original.wallpaper, topbarTransparency: 57 } });
  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
  await sections[0].locator("summary").click();
  await sections[0].getByRole("button", { name: "独立玻璃底板" }).click();
  await expect(sections[0].getByRole("slider", { name: "顶栏透明度" })).toHaveValue("57");
  await expect(sections[0].getByRole("slider", { name: "模糊强度" })).toHaveValue("7");
});

test("legacy enabled optics are removed while independent topbar and collection survive migration", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop legacy material migration");
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    const { topbarStyle: _style, topbarTransparency: _alpha, ...wallpaper } = state.wallpaper;
    state.version = 23;
    state.wallpaper = { ...wallpaper, topbarOpacity: 37, topbarBlur: 9, glassRefraction: true, glassRefractionStrength: 40 };
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  const legacy = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  await page.reload();
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
  await panel.locator("summary").filter({ hasText: /^顶栏外观/ }).click();
  await expect(panel.getByRole("slider", { name: "顶栏透明度" })).toHaveValue("63");
  await panel.getByRole("button", { name: "保存设置" }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  const { topbarOpacity: _opacity, glassRefraction: _optics, glassRefractionStrength: _strength, ...wallpaper } = legacy.wallpaper;
  expect(saved).toEqual({ ...legacy, version: 27, wallpaper: { ...wallpaper, topbarStyle: "glass", topbarTransparency: 63 } });
  await expect(page.locator("filter, feDisplacementMap")).toHaveCount(0);
});
