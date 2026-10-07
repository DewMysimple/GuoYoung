import type { Locator } from "@playwright/test";
import { expectGlassMaterial } from "./glass-material";
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
  await expectGlassMaterial(tool, { blur: 12, saturation: 1.3 });
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
  await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).click();
  for (const [name, value] of [["按钮透明度", "90"], ["面板透明度", "72"], ["菜单透明度", "65"], ["阴影强度", "0"]]) {
    await panel.getByRole("slider", { name }).fill(value);
  }
  await expect.poll(() => panel.evaluate(el => getComputedStyle(el).backgroundColor)).toContain("0.28");
  await expect.poll(() => tool.evaluate(el => getComputedStyle(el).backgroundColor)).toContain("0.1");
  await expect(card).toHaveCSS("box-shadow", /rgba\(24, 43, 70, 0\)/);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(panel.getByRole("tab", { name: /壁纸/ })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("slider", { name: "阴影强度" })).toBeVisible();
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

test("uses shared glass for tab, group and site drags over wallpaper", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop glass drag regression");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("https://wallpaper.example/sea.svg", route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://wallpaper.example/sea.svg", overlay: 0, glassTransparency: 88, glassBlur: 8 };
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);

  const tab = page.locator('[data-group-sort-tab-id="search"]');
  const tabBox = await tab.boundingBox();
  if (!tabBox) throw new Error("Group tab is missing");
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tabBox.x + tabBox.width / 2 + 9, tabBox.y + tabBox.height / 2);
  const tabPreview = page.getByTestId("group-sort-horizontal-drag-preview");
  await expect(tab).toHaveCSS("opacity", "0.46");
  await expect(tabPreview).toHaveClass(/category-tab/);
  await expect(tabPreview).toHaveCSS("border-radius", await tab.evaluate(el => getComputedStyle(el).borderRadius));
  await expectGlassMaterial(tabPreview, { blur: 8 });
  expect((await tabPreview.boundingBox())?.height).toBeCloseTo(tabBox.height, 0);
  await page.screenshot({ path: screenshotPath("glass-group-tab-drag.png") });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(tab).toHaveCSS("opacity", "1");

  const heading = page.locator('.grouped-site-section[data-group-sort-section-id="search"] .grouped-site-header-main');
  const headingBox = await heading.boundingBox();
  if (!headingBox) throw new Error("Group heading is missing");
  await page.mouse.move(headingBox.x + 90, headingBox.y + headingBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(headingBox.x + 90, headingBox.y + headingBox.height / 2 + 9);
  const groupPreview = page.getByTestId("group-sort-vertical-drag-preview");
  await expectGlassMaterial(groupPreview, { blur: 8 });
  await expect(groupPreview).toHaveCSS("background-color", /\/ 0\.12\)/);
  await page.screenshot({ path: screenshotPath("glass-group-section-drag.png") });
  await page.keyboard.press("Escape");
  await page.mouse.up();

  const source = page.getByTestId("site-card-google");
  const target = page.getByTestId("site-card-bing");
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Site drag cards are missing");
  const ordinaryMaterial = await source.evaluate(readCardSurface);
  expect(ordinaryMaterial.opacity).toBe("1");
  expect(ordinaryMaterial.borderStyle).toBe("solid");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await expect.poll(() => source.evaluate(readCardSurface)).toEqual(ordinaryMaterial);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 51, sourceBox.y + sourceBox.height / 2);
  await expect.poll(() => source.evaluate(readCardSurface)).toEqual({ ...ordinaryMaterial, opacity: "0.46" });
  const sitePreview = page.getByTestId("site-card-drag-preview");
  await expectGlassMaterial(sitePreview, { blur: 8 });
  await expect.poll(() => sitePreview.evaluate(readCardSurface)).toEqual(ordinaryMaterial);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await expect(target).toHaveClass(/is-drop-target/);
  await expectGlassMaterial(target, { blur: 8 });
  await expect.poll(() => target.evaluate(readCardSurface)).toEqual(ordinaryMaterial);
  await page.screenshot({ path: screenshotPath("glass-site-drag-hover.png") });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await expectCardMaterial(sitePreview, "backdrop-filter", "none");
  await expectCardMaterial(sitePreview, "background-color", /\/ 0\.96\)/);
  const neutral = page.getByTestId("site-card-github");
  await neutral.locator(".drag-handle").evaluate(button => (button as HTMLElement).focus({ preventScroll: true }));
  for (const card of [source, target, neutral, sitePreview]) {
    await expectCardMaterial(card, "background-color", /\/ 0\.96\)/);
    await expectCardMaterial(card, "background-image", "none");
    await expectCardMaterial(card, "backdrop-filter", "none");
  }
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "no-preference" }] });
  for (const card of [source, target, neutral, sitePreview]) {
    await expect.poll(() => card.evaluate(readCardSurface)).toEqual({
      ...ordinaryMaterial, opacity: card === source ? "0.46" : "1",
    });
  }
  await cdp.detach();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(sitePreview).toHaveCount(0);
  await expect(source).toHaveCSS("opacity", "1");
  // dnd-kit retains its document click guard for 50ms after detaching a sensor.
  // The next action is an independent click, after that release-click guard.
  await page.waitForTimeout(60);

  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const handle = page.getByRole("dialog", { name: "管理分组" }).getByRole("button", { name: "拖动 搜索" });
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Group manager handle is missing");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 16);
  const managerPreview = page.locator(".group-list-item-drag-preview");
  await expectGlassMaterial(managerPreview, { blur: 8 });
  await expect(managerPreview).toHaveCSS("background-color", /\/ 0\.12\)/);
  expect(await managerPreview.evaluate(el => el.closest(".app-shell"))).toBeNull();
  await page.screenshot({ path: screenshotPath("glass-manager-portal-drag.png") });
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

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
  await expectGlassMaterial(page.locator(".topbar"), { blur: 12, saturation: 1.3 }, true);
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
  await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).click();
  await panel.getByRole("slider", { name: "玻璃透明度" }).fill("94");
  await panel.getByRole("slider", { name: "玻璃磨砂" }).fill("2");
  await expectGlassMaterial(card, { blur: 2 });
  await expect.poll(() => card.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(initial);
  await panel.locator("summary").filter({ hasText: /^顶栏外观/ }).click();
  await panel.getByRole("group", { name: "顶栏样式" }).getByRole("button", { name: "独立玻璃底板" }).click();
  await panel.getByRole("slider", { name: "顶栏透明度" }).fill("85");
  const topbarControls = panel.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^顶栏外观/ }) });
  await topbarControls.getByRole("slider", { name: "模糊强度" }).fill("0");
  await expectGlassMaterial(page.locator(".topbar"), { blur: 0 }, true);
  await expect.poll(() => page.locator(".topbar").evaluate(el => getComputedStyle(el, "::before").backgroundColor)).toContain("0.15");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).wallpaper.glassTransparency)).toBe(78);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expectCardMaterial(card, "background-color", initial);
  await expect(shell).not.toHaveClass(/glass-refraction/);
  await expect(page.locator("#wallpaper-glass-lens")).toHaveCount(0);

  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(panel.getByRole("tab", { name: /壁纸/ })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("slider", { name: "阴影强度" })).toBeVisible();
  await panel.getByRole("slider", { name: "玻璃透明度" }).fill("88");
  await panel.getByRole("slider", { name: "玻璃磨砂" }).fill("2");
  await panel.getByRole("slider", { name: "色彩饱和度" }).fill("175");
  await panel.getByRole("slider", { name: "边缘高光" }).fill("20");
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expectGlassMaterial(card, { blur: 2 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).wallpaper.glassTransparency)).toBe(88);
  await expectGlassMaterial(card, { saturation: 1.75 });
  await expect(card).toHaveCSS("border-top-color", "rgba(255, 255, 255, 0.2)");
  await page.screenshot({ path: screenshotPath(`glass-saved-${info.project.name}.png`), animations: "disabled" });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await expectCardMaterial(card, "backdrop-filter", "none");
  await expectCardMaterial(card, "display", "flex");
  await expectCardMaterial(card, "background-color", /\/ 0\.96\)/);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "no-preference" }] });
  await expectGlassMaterial(card, { blur: 2, saturation: 1.75 });

  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).click();
  await panel.getByRole("button", { name: "恢复玻璃默认" }).click();
  await expect(panel.getByRole("slider", { name: "玻璃透明度" })).toHaveValue("78");
  await expect(panel.getByRole("checkbox", { name: /玻璃折射/, hidden: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "清除壁纸" }).click();
  await expect(shell).not.toHaveClass(/has-wallpaper/);
  await expect(page.locator("html")).toHaveCSS("background-image", "none");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(shell).toHaveClass(/has-wallpaper/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("offers six standalone appearance presets with the reference material and optional panel application", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop appearance presets");
  await page.route("https://wallpaper.example/sea.svg", route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://wallpaper.example/sea.svg", zoom: 110, overlay: 0,
      topbarStyle: "glass", topbarTransparency: 37, topbarBlur: 7, sidebarStyle: "glass", sidebarTransparency: 61, sidebarBlur: 9 };
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).wallpaper);
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  await expect(panel.getByRole("slider")).toHaveCount(0);
  expect(await panel.locator(".wallpaper-settings > .appearance-card").evaluateAll(nodes => nodes.map(node =>
    node.querySelector(":scope > summary > span")?.firstChild?.textContent ?? node.getAttribute("aria-label"))))
    .toEqual(["壁纸来源", "外观预设", "基础设置", "玻璃外观", "顶栏外观", "侧栏外观"]);
  const section = panel.locator(".wallpaper-presets");
  await section.locator("summary").click();
  const presets = section.locator(".glass-preset");
  await expect(presets).toHaveCount(6);
  await expect(section.getByRole("slider")).toHaveCount(0);
  await expect(presets.nth(4)).toBeDisabled();
  await expect(presets.nth(5)).toBeDisabled();
  const positions = await presets.evaluateAll(buttons => buttons.map(button => {
    const box = button.getBoundingClientRect(); return { x: box.x, y: box.y };
  }));
  expect(new Set(positions.map(position => position.x)).size).toBe(3);
  expect(new Set(positions.map(position => position.y)).size).toBe(2);
  const scope = section.getByRole("checkbox", { name: "预设同时应用顶栏和侧栏" });
  await expect(scope).toBeChecked();
  await scope.uncheck();
  await presets.nth(0).click();
  await expect(page.locator(".app-shell")).toHaveCSS("--glass-opacity", "0%");
  await expectGlassMaterial(page.locator(".site-card").first(), { blur: 21, saturation: 1 });
  await expect.poll(() => page.locator(".topbar").evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toBe("blur(7px)");
  await expect(panel).toHaveCSS("backdrop-filter", "blur(9px)");
  await scope.check(); // A scope change alone does not apply a preset.
  await expect(presets.locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(panel).toHaveCSS("backdrop-filter", "blur(9px)");
  const names = [["清透磨砂", "0%", 21], ["轻盈透景", "4%", 0], ["柔光薄雾", "20%", 12], ["凝霜静读", "58%", 26]] as const;
  for (const [name, opacity, blur] of names) {
    const option = section.getByRole("button", { name: new RegExp(`^${name}`) });
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".app-shell")).toHaveCSS("--glass-opacity", opacity);
    await expectGlassMaterial(page.locator(".site-card").first(), { blur, saturation: name === "柔光薄雾" ? 1.1 : 1 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).wallpaper)).toEqual(original);
  }
  await presets.nth(0).click();
  await page.screenshot({ path: screenshotPath("appearance-six-presets.png") });
  await panel.locator("summary").filter({ hasText: /^玻璃外观/ }).click();
  for (const [label, value] of [["玻璃透明度", "100"], ["按钮透明度", "100"], ["面板透明度", "100"], ["菜单透明度", "100"],
    ["阴影强度", "72"], ["玻璃磨砂", "21"], ["色彩饱和度", "100"], ["边缘高光", "18"]]) {
    await expect(panel.getByRole("slider", { name: label, exact: true })).toHaveValue(value);
  }
  await panel.getByRole("slider", { name: "阴影强度" }).fill("17");
  await expect(presets.locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(section.locator("summary")).toContainText("已自定义");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await presets.nth(0).click();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expectGlassMaterial(page.locator(".site-card").first(), { blur: 21, saturation: 1 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).wallpaper)).toMatchObject({
    source: original.source, url: original.url, zoom: 110, overlay: 0, glassShadow: 72, glassHighlight: 18,
    topbarStyle: "glass", topbarTransparency: 100, topbarBlur: 21, sidebarStyle: "glass", sidebarTransparency: 100, sidebarBlur: 21,
  });
});

test("custom appearance slots save, apply, overwrite and cancel within the settings transaction", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop custom appearance presets");
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  const presets = panel.locator(".wallpaper-presets");
  const topbar = panel.locator(".wallpaper-settings > details").filter({ has: page.locator("summary").filter({ hasText: /^顶栏外观/ }) });
  const open = async () => {
    await page.getByRole("button", { name: "打开设置" }).click();
    await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
    for (const title of ["外观预设", "玻璃外观", "顶栏外观"]) {
      const summary = panel.locator("summary").filter({ hasText: new RegExp(`^${title}`) });
      if (await summary.evaluate(el => !el.parentElement!.hasAttribute("open"))) await summary.click();
    }
  };
  await open();
  await presets.getByRole("checkbox").uncheck();
  await presets.getByRole("button", { name: "保存当前到自定义 1", exact: true }).click();
  await topbar.getByRole("button", { name: "独立玻璃底板" }).click();
  await topbar.getByRole("slider", { name: "顶栏透明度" }).fill("37");
  await topbar.getByRole("slider", { name: "模糊强度" }).fill("7");
  await panel.getByRole("slider", { name: "阴影强度" }).fill("17");
  await presets.getByRole("button", { name: "保存当前到自定义 2", exact: true }).click();
  await presets.locator('[data-preset="custom-1"]').click();
  await expect(topbar.getByRole("slider", { name: "顶栏透明度" })).toHaveValue("37");
  await expect(panel.getByRole("slider", { name: "阴影强度" })).toHaveValue("35");
  await presets.getByRole("checkbox").check();
  await presets.locator('[data-preset="custom-1"]').click();
  await expect(topbar.getByRole("button", { name: "跟随公共" })).toHaveAttribute("aria-pressed", "true");
  await presets.locator('[data-preset="custom-2"]').click();
  await expect(topbar.getByRole("slider", { name: "顶栏透明度" })).toHaveValue("37");
  await panel.getByRole("slider", { name: "阴影强度" }).fill("29");
  await presets.getByRole("button", { name: "覆盖自定义 1", exact: true }).click();
  await presets.locator('[data-preset="custom-2"]').click();
  await expect(panel.getByRole("slider", { name: "阴影强度" })).toHaveValue("17");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!))).toEqual(original);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await open();
  for (const button of await presets.locator('[data-preset^="custom-"]').all()) await expect(button).toBeDisabled();
  await panel.getByRole("slider", { name: "阴影强度" }).fill("29");
  await presets.getByRole("button", { name: "保存当前到自定义 1", exact: true }).click();
  await panel.getByRole("slider", { name: "阴影强度" }).fill("17");
  await presets.getByRole("button", { name: "保存当前到自定义 2", exact: true }).click();
  await presets.getByRole("checkbox").uncheck();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  expect(saved.wallpaper.presetIncludesPanels).toBe(false);
  expect(saved.wallpaper.customPresets).toHaveLength(2);
  expect(saved.wallpaper.customPresets.map((preset: { glassShadow: number }) => preset.glassShadow)).toEqual([29, 17]);
  expect(Object.keys(saved.wallpaper.customPresets[0])).toHaveLength(14);
  expect(saved.sites).toEqual(original.sites);
  await open();
  await expect(presets.getByRole("checkbox")).not.toBeChecked();
  await presets.locator('[data-preset="custom-1"]').click();
  await expect(panel.getByRole("slider", { name: "阴影强度" })).toHaveValue("29");
});

test("keeps glass sampling and complete cards from the first frame when returning from history", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop workspace continuity");
  await page.route("https://wallpaper.example/sea.svg", route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://wallpaper.example/sea.svg", overlay: 0, glassBlur: 2 };
    const groupId = state.groups.find((group: { workspace: string }) => group.workspace === "github").id;
    state.sites.push({ ...state.sites[0], id: "continuity-repo", groupId, name: "Continuity repository", url: "https://github.com/example/continuity" });
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  await expect(page.getByTestId("site-card-continuity-repo")).toBeVisible();
  for (let round = 0; round < 3; round++) {
    await page.getByRole("button", { name: "打开历史记录" }).click();
    const frames = await page.evaluate(async () => {
      const button = document.querySelector<HTMLButtonElement>('[aria-label="打开 GitHub 收藏"]')!;
      button.click();
      const frames: { missing: boolean; opaque: boolean; blurred: boolean; searchTop: number }[] = [];
      for (let i = 0; i < 24; i++) {
        await new Promise(requestAnimationFrame);
        const card = document.querySelector('[data-testid="site-card-continuity-repo"]');
        const search = document.querySelector(".search-input");
        let opaque = !!card && !!search;
        for (const surface of [card, search]) for (let parent = surface?.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          // The static root blur is an identity operation. A filter on any
          // other ancestor still breaks this continuity check (and can move
          // the fixed wallpaper into that ancestor's coordinate system).
          const identityRootFilter = parent === document.documentElement && style.filter === "blur(0px)";
          if (Number(style.opacity) < 1 || (style.filter !== "none" && !identityRootFilter) || style.willChange.includes("opacity")) opaque = false;
        }
        frames.push({ missing: !card, opaque, blurred: !!card && getComputedStyle(card).backdropFilter.includes("blur(2px)"), searchTop: search?.getBoundingClientRect().top ?? -1 });
      }
      return frames;
    });
    expect(frames.every(frame => !frame.missing && frame.opaque && frame.blurred)).toBe(true);
    expect(Math.max(...frames.map(frame => frame.searchTop)) - Math.min(...frames.map(frame => frame.searchTop))).toBeLessThan(1);
  }
  await page.screenshot({ path: screenshotPath("liquid-github-after-history.png") });
});

async function expectCardMaterial(card: Locator, property: string, value: string | RegExp) {
  const actual = expect.poll(() => card.evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property));
  if (typeof value === "string") await actual.toBe(value);
  else await actual.toMatch(value);
}

function readCardSurface(element: Element) {
  const style = getComputedStyle(element);
  return { opacity: style.opacity, zIndex: style.zIndex, borderStyle: style.borderStyle, borderColor: style.borderColor,
    borderRadius: style.borderRadius, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage,
    boxShadow: style.boxShadow, filter: style.filter, backdropFilter: style.backdropFilter };
}
