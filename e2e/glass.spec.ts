import { expect, test, screenshotPath } from "./fixtures";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("shares glass layers across group tools, menus and panels without nested card or footer tiles", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop material regression");
  await page.route("https://wallpaper.example/sea.svg", route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://wallpaper.example/sea.svg", overlay: 0 };
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  const tool = page.locator(".grouped-site-actions .compact-icon-button").first();
  await expect(tool).toHaveCSS("backdrop-filter", "blur(12px) saturate(1.3)");
  await expect(tool).toHaveCSS("border-top-color", "rgba(255, 255, 255, 0.294)");
  for (const tab of await page.locator(".category-tab").all()) {
    const shadow = await tab.evaluate(el => getComputedStyle(el).boxShadow);
    expect(shadow.split(/,(?![^()]*\))/).every(part => part.includes("inset"))).toBe(true);
  }
  const card = page.locator(".site-card").first();
  await card.hover();
  for (const action of await card.locator(".card-actions .icon-button").all()) {
    await expect(action).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(action).toHaveCSS("box-shadow", "none");
  }
  await expect(page.locator(".footer > span")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".footer > span")).toHaveCSS("backdrop-filter", "none");
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  for (const [name, value] of [["按钮透明度", "90"], ["面板透明度", "72"], ["菜单透明度", "65"], ["阴影强度", "0"]]) {
    await panel.getByRole("slider", { name }).fill(value);
  }
  await expect.poll(() => panel.evaluate(el => getComputedStyle(el).backgroundColor)).toContain("0.28");
  await expect.poll(() => tool.evaluate(el => getComputedStyle(el).backgroundColor)).toContain("0.1");
  await expect(card).toHaveCSS("box-shadow", /rgba\(24, 43, 70, 0\)/);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  await expect(panel.getByRole("slider", { name: "阴影强度" })).toHaveValue("35");
  await panel.getByRole("slider", { name: "面板透明度" }).fill("72");
  await panel.getByRole("slider", { name: "菜单透明度" }).fill("65");
  await panel.getByRole("slider", { name: "阴影强度" }).fill("0");
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).wallpaper)).toMatchObject({
    glassPanelTransparency: 72, glassPopoverTransparency: 65, glassShadow: 0,
  });
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "管理分组", exact: true });
  await expect.poll(() => manager.evaluate(el => getComputedStyle(el).backgroundColor)).toContain("0.28");
  await expect.poll(() => page.locator(".group-manager-editor").evaluate(el => getComputedStyle(el).backgroundColor)).toContain("0.09");
  await page.screenshot({ path: screenshotPath("glass-group-manager-layers.png"), animations: "disabled" });
  await manager.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await expect.poll(() => page.locator(".display-popover").evaluate(el => getComputedStyle(el).backgroundColor)).toContain("0.35");
});

const wallpaper = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000"><defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#468aad"/><stop offset=".5" stop-color="#b6e4df"/><stop offset="1" stop-color="#456a9b"/></linearGradient><pattern id="ripples" width="150" height="90" patternUnits="userSpaceOnUse"><path d="M-30 35Q20 0 75 35T180 35M-30 65Q30 25 90 65T210 65" fill="none" stroke="#eaffff" stroke-opacity=".6" stroke-width="3"/></pattern></defs><path fill="url(#sky)" d="M0 0h1440v1000H0z"/><path fill="url(#ripples)" d="M0 0h1440v1000H0z"/></svg>`;

test("previews glass, restores cancelled drafts and persists material controls", async ({ page }, info) => {
  await page.route("https://wallpaper.example/sea.svg", route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://wallpaper.example/sea.svg", overlay: 0 };
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  const shell = page.locator(".app-shell");
  const card = page.locator(".site-card").first();
  await expect(shell).toHaveClass(/has-wallpaper/);
  await expect.poll(() => page.locator(".topbar").evaluate(el => getComputedStyle(el, "::before").display)).toBe("none");
  expect((await shell.boundingBox())!.x).toBe(0);
  const searchBox = (await page.locator(".search-input").boundingBox())!;
  expect(Math.abs(searchBox.x + searchBox.width / 2 - (await page.evaluate(() => innerWidth)) / 2)).toBeLessThan(2);
  const heading = page.locator(".collection-heading");
  const before = (await heading.boundingBox())!;
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  expect((await heading.boundingBox())!.x).toBeCloseTo(before.x, 1);
  expect((await heading.boundingBox())!.width).toBeCloseTo(before.width, 1);
  await page.getByRole("dialog", { name: "管理分组", exact: true }).getByRole("button", { name: "关闭", exact: true }).click();
  const initial = await card.evaluate(el => getComputedStyle(el).backgroundColor);
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  await panel.getByRole("slider", { name: "玻璃透明度" }).fill("94");
  await panel.getByRole("slider", { name: "玻璃磨砂" }).fill("2");
  await panel.getByRole("checkbox", { name: /玻璃折射/ }).check();
  await panel.getByRole("slider", { name: "折射强度" }).fill("32");
  await expect(card).toHaveCSS("backdrop-filter", /blur\(2px\).*wallpaper-glass-lens/);
  await expect.poll(() => card.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(initial);
  await panel.getByRole("button", { name: "玻璃底板", exact: true }).click();
  await panel.getByRole("slider", { name: "顶栏透明度" }).fill("85");
  await panel.getByRole("checkbox", { name: /模糊壁纸/ }).uncheck();
  await expect.poll(() => page.locator(".topbar").evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toContain("blur(0px)");
  await expect.poll(() => page.locator(".topbar").evaluate(el => getComputedStyle(el, "::before").backgroundColor)).toContain("0.15");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).wallpaper.glassTransparency)).toBe(78);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(card).toHaveCSS("background-color", initial);
  await expect(shell).not.toHaveClass(/glass-refraction/);
  await expect(page.locator("#wallpaper-glass-lens")).toHaveCount(0);

  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  await panel.getByRole("slider", { name: "玻璃透明度" }).fill("88");
  await panel.getByRole("slider", { name: "玻璃磨砂" }).fill("2");
  await panel.getByRole("slider", { name: "色彩饱和度" }).fill("175");
  await panel.getByRole("slider", { name: "边缘高光" }).fill("20");
  await panel.getByRole("checkbox", { name: /玻璃折射/ }).check();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(card).toHaveCSS("backdrop-filter", /blur\(2px\).*wallpaper-glass-lens/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).wallpaper.glassTransparency)).toBe(88);
  await expect(card).toHaveCSS("backdrop-filter", /saturate\(1.75\)/);
  await expect(card).toHaveCSS("border-top-color", "rgba(255, 255, 255, 0.2)");
  await page.screenshot({ path: screenshotPath(`glass-refraction-${info.project.name}.png`), animations: "disabled" });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await expect(card).toHaveCSS("backdrop-filter", "none");
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "no-preference" }] });
  await expect(card).toHaveCSS("backdrop-filter", /wallpaper-glass-lens/);

  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  await panel.getByRole("button", { name: "恢复玻璃默认" }).click();
  await expect(panel.getByRole("slider", { name: "玻璃透明度" })).toHaveValue("78");
  await expect(panel.getByRole("checkbox", { name: /玻璃折射/ })).not.toBeChecked();
  await panel.getByRole("button", { name: "清除壁纸" }).click();
  await expect(shell).not.toHaveClass(/has-wallpaper/);
  await expect(page.locator("html")).toHaveCSS("background-image", "none");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(shell).toHaveClass(/has-wallpaper/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
