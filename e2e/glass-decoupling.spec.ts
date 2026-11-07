import type { Locator, Page } from "@playwright/test";
import { expect, screenshotPath, test } from "./fixtures";
import { glassTexture } from "./glass-texture";
import { expectGlassMaterial } from "./glass-material";

const wallpaperURL = "https://glass-decoupling.example/detail.svg";
const manager = (page: Page) => page.getByRole("dialog", { name: "管理分组", exact: true });

async function seed(page: Page, settings: Record<string, number | boolean> = {}, theme = "dark", kind: "none" | "light" | "dark" | "complex" = "complex") {
  await page.route(wallpaperURL, route => route.fulfill({ contentType: "image/svg+xml", body: glassTexture(kind === "none" ? "complex" : kind) }));
  await page.evaluate(({ settings, theme, kind, wallpaperURL }) => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.appearance = { ...state.appearance, theme, cardWidth: 240, cardHeight: 200 };
    state.sites = state.sites.map((site: Record<string, unknown>) => ({ ...site, iconSource: "brand" }));
    state.wallpaper = { ...state.wallpaper, source: kind === "none" ? "none" : "url", url: wallpaperURL,
      blur: 0, overlay: 0, glassTransparency: 100, glassBlur: 0, glassSaturation: 100,
      overlayTransparency: 25, overlayBlur: 24, overlayBackdropDim: 30, overlayReadabilityProtection: true, ...settings };
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  }, { settings, theme, kind, wallpaperURL });
  await page.reload();
  if (kind !== "none") {
    // The startup thumbnail can decode before useWallpaper installs the full
    // texture. Pixel comparisons require the identical full-resolution source.
    await expect(page.locator(".wallpaper-layer img")).toHaveAttribute("src", wallpaperURL);
    await page.locator(".wallpaper-layer img").evaluate(img => (img as HTMLImageElement).decode());
  }
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function pixels(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const buffer = await page.screenshot({ clip: box, animations: "disabled" });
  const sample = await page.evaluate(async encoded => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
    return { values: [...ctx.getImageData(0, 0, image.width, image.height).data], width: image.width };
  }, buffer.toString("base64"));
  return { ...sample, png: buffer };
}

function energy(sample: Awaited<ReturnType<typeof pixels>>) {
  let total = 0, count = 0;
  for (let index = 4; index < sample.values.length; index += 4) {
    if ((index / 4) % sample.width === 0) continue;
    for (let color = 0; color < 3; color++) { total += Math.abs(sample.values[index + color] - sample.values[index - 4 + color]); count++; }
  }
  return total / count;
}

function difference(first: Awaited<ReturnType<typeof pixels>>, second: Awaited<ReturnType<typeof pixels>>) {
  return first.values.reduce((sum, value, index) => sum + (index % 4 === 3 ? 0 : Math.abs(value - second.values[index])), 0) / (first.values.length * .75);
}

async function paint(surface: Locator, pseudo = false) {
  return surface.evaluate((el, pseudo) => {
    const css = getComputedStyle(el, pseudo ? "::before" : null);
    return { fill: css.backgroundColor, image: css.backgroundImage, filter: css.backdropFilter, foreground: css.filter, opacity: css.opacity };
  }, pseudo);
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop independent material acceptance");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("measures actual zero/high-blur pixels for clear cards and independent dialogs at fixed fill", async ({ page }, info) => {
  const samples: { cardBlur: number; overlayBlur: number; card: Awaited<ReturnType<typeof pixels>>; dialog: Awaited<ReturnType<typeof pixels>> }[] = [];
  for (const [cardBlur, overlayBlur] of [[0, 0], [30, 0], [30, 30], [0, 30]]) {
    await seed(page, { glassBlur: cardBlur, overlayBlur, overlayTransparency: 45, overlayBackdropDim: 0,
      overlayReadabilityProtection: false });
    const card = page.getByTestId("site-card-google");
    await page.mouse.move(1430, 990);
    const cardBox = (await card.boundingBox())!;
    const cardPixels = await pixels(page, { x: Math.round(cardBox.x + cardBox.width - 50), y: Math.round(cardBox.y + 65), width: 30, height: 40 });
    await info.attach(`card-pixels-${cardBlur}-${overlayBlur}`, { body: cardPixels.png, contentType: "image/png" });
    await info.attach(`card-frame-${cardBlur}-${overlayBlur}`, { body: JSON.stringify({ cardBox, scene: await page.evaluate(() => {
      const image = document.querySelector<HTMLImageElement>(".wallpaper-layer img")!;
      return { width: innerWidth, clientWidth: document.documentElement.clientWidth, scrollY,
        image: image.getBoundingClientRect().toJSON(), src: image.src,
        position: getComputedStyle(image).objectPosition, transform: getComputedStyle(image).transform };
    }) }), contentType: "application/json" });
    await page.getByRole("button", { name: "管理分组", exact: true }).click();
    await expectGlassMaterial(manager(page), { blur: overlayBlur, saturation: 1 }, true);
    const dialogBox = (await manager(page).boundingBox())!;
    // The middle of the header contains only glass. The upper right contains
    // the return/close controls and cannot measure background texture alone.
    const dialogPixels = await pixels(page, { x: Math.round(dialogBox.x + dialogBox.width / 2), y: Math.round(dialogBox.y + 64), width: 140, height: 18 });
    expect(await paint(manager(page))).toMatchObject({ foreground: "none", opacity: "1", filter: "none" });
    await page.screenshot({ path: screenshotPath(`decoupled-pixels-card${cardBlur}-overlay${overlayBlur}.png`), animations: "disabled" });
    samples.push({ cardBlur, overlayBlur, card: cardPixels, dialog: dialogPixels });
    await page.keyboard.press("Escape");
    await expect(manager(page)).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
  }
  const evidence = samples.map(sample => ({ cardBlur: sample.cardBlur, overlayBlur: sample.overlayBlur,
    cardEnergy: energy(sample.card), dialogEnergy: energy(sample.dialog) }));
  await info.attach("actual-blur-pixel-energy", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  expect(evidence[0].cardEnergy, "The clear card must expose detailed wallpaper").toBeGreaterThan(3);
  expect(evidence[1].cardEnergy, "High card blur must remove fine texture").toBeLessThan(evidence[0].cardEnergy * .4);
  expect(evidence[1].dialogEnergy, "Zero overlay blur must expose a measurable texture").toBeGreaterThan(2);
  expect(evidence[2].dialogEnergy, "High overlay blur must visibly remove texture at identical fill").toBeLessThan(evidence[1].dialogEnergy * .4);
  expect(difference(samples[0].card, samples[3].card), "Overlay changes cannot affect card pixels").toBeLessThan(.5);
  expect(difference(samples[1].card, samples[2].card), "Overlay changes cannot affect frosted card pixels").toBeLessThan(.5);
  expect(difference(samples[0].dialog, samples[1].dialog), "Card changes cannot affect the dialog's material").toBeLessThan(.5);
});

for (const theme of ["light", "dark"]) for (const kind of ["none", "light", "dark", "complex"] as const) {
  test(`keeps protected dialog and nested menus readable with clear cards: ${theme}/${kind}`, async ({ page }) => {
    await seed(page, {}, theme, kind);
    const cardBefore = await paint(page.getByTestId("site-card-google"));
    await page.getByRole("button", { name: "管理分组", exact: true }).click();
    const dialog = manager(page);
    expect(await dialog.evaluate(el => el.parentElement === document.body)).toBe(true);
    await expectGlassMaterial(dialog, { blur: kind === "none" ? 0 : 24 }, true);
    for (const [name, role] of [["更多分组操作", "menu"], ["所属一级分组", "listbox"]] as const) {
      const trigger = dialog.getByRole("button", { name, exact: true });
      await trigger.press("ArrowDown");
      const menu = dialog.getByRole(role, { name: role === "menu" ? "分组操作" : name });
      await expect(menu).toBeVisible();
      await expectGlassMaterial(menu, { blur: kind === "none" ? 0 : 24 });
      await expect(menu).toHaveCSS("opacity", "1");
      expect(await paint(menu)).toMatchObject({ foreground: "none", opacity: "1" });
      await page.screenshot({ path: screenshotPath(`decoupled-${theme}-${kind}-${role}.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await expect(trigger).toBeFocused();
    }
    expect(await paint(page.getByTestId("site-card-google"))).toEqual(cardBefore);
  });
}

test("fits a long parent menu into a short desktop window, scrolls internally and retains dialog focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await seed(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    const template = state.groups.find((group: { id: string }) => group.id === "design");
    state.groups.push(...Array.from({ length: 30 }, (_, index) => ({ ...template, id: `long-parent-${index}`, name: `可选一级 ${index + 1}`, isProtected: false })));
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const dialog = manager(page), trigger = dialog.getByRole("button", { name: "所属一级分组", exact: true });
  await trigger.press("ArrowDown");
  const menu = dialog.getByRole("listbox", { name: "所属一级分组" });
  await expect(menu).toBeVisible();
  expect(await menu.getByRole("option").count()).toBeGreaterThan(30);
  await expect(dialog.locator(".group-editor-parent-select")).toHaveAttribute("data-placement", "top");
  const box = (await menu.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(600);
  expect(await menu.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.keyboard.press("End");
  await expect(menu.getByRole("option").last()).toBeFocused();
  expect(await menu.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: screenshotPath("decoupled-parent-small-window.png"), animations: "disabled" });
  await page.keyboard.press("Home");
  await expect(menu.getByRole("option").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(dialog).toBeVisible();
});

test("previews both independent materials in settings and restores cancelled drafts after a saved reload", async ({ page }) => {
  await seed(page);
  const card = page.getByTestId("site-card-google");
  const cardPaint = async () => ({ shell: await paint(card), icons: await card.locator(".favicon-frame, .favicon-fallback")
    .evaluateAll(nodes => nodes.map(el => getComputedStyle(el).backgroundColor)) });
  const open = async () => {
    await page.getByRole("button", { name: "打开设置" }).click();
    const panel = page.getByRole("dialog", { name: "设置", exact: true });
    await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
    const summary = panel.locator("summary").filter({ hasText: /^玻璃外观/ });
    if (await summary.evaluate(el => !el.parentElement!.hasAttribute("open"))) await summary.click();
    return panel;
  };
  let panel = await open();
  const originalOverlay = await paint(panel, true);
  await panel.getByRole("slider", { name: "链接卡片磨砂", exact: true }).fill("30");
  await expectGlassMaterial(card, { blur: 30 });
  expect(await paint(panel, true)).toEqual(originalOverlay);
  const frozenCard = await cardPaint();
  await panel.getByRole("slider", { name: "浮窗磨砂", exact: true }).fill("7");
  await panel.getByRole("slider", { name: "浮窗透明度", exact: true }).fill("45");
  await expectGlassMaterial(panel, { blur: 7 }, true);
  expect(await cardPaint()).toEqual(frozenCard);
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expectGlassMaterial(card, { blur: 30 });
  panel = await open();
  await expectGlassMaterial(panel, { blur: 7 }, true);
  await expect(panel.getByRole("slider", { name: "浮窗透明度", exact: true })).toHaveValue("45");
  await panel.getByRole("slider", { name: "链接卡片磨砂", exact: true }).fill("0");
  await panel.getByRole("slider", { name: "浮窗磨砂", exact: true }).fill("0");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expectGlassMaterial(card, { blur: 30 });
  panel = await open();
  await expectGlassMaterial(panel, { blur: 7 }, true);
});

test("protects zero-blur overlays and supports explicit custom transparency plus reduced and unsupported fallbacks", async ({ page }) => {
  await seed(page, { overlayTransparency: 100, overlayBlur: 0 });
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  expect((await paint(manager(page), true)).fill).toContain("0.82");
  await seed(page, { overlayTransparency: 100, overlayBlur: 30, overlayReadabilityProtection: false });
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  await expectGlassMaterial(manager(page), { blur: 30 }, true);
  expect((await paint(manager(page), true)).fill).toMatch(/\/ 0\)|rgba\(0, 0, 0, 0\)/);
  const saved = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await expect.poll(() => paint(manager(page), true)).toMatchObject({ filter: "none", image: "none" });
  expect((await paint(manager(page), true)).fill).toContain("0.96");
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  // Chrome supports backdrop-filter. Activate the actual authored @supports
  // fallback rules in CSSOM, retaining their contents rather than faking paint.
  const count = await page.evaluate(() => {
    let count = 0;
    const visit = (sheet: CSSStyleSheet) => {
      for (let index = 0; index < sheet.cssRules.length; index++) {
        const rule = sheet.cssRules[index];
        if (rule instanceof CSSImportRule && rule.styleSheet) visit(rule.styleSheet);
        if (rule instanceof CSSSupportsRule && rule.conditionText === "not (backdrop-filter: blur(1px))") {
          const text = rule.cssText.replace(rule.conditionText, "(display: block)");
          sheet.deleteRule(index); sheet.insertRule(text, index); count++;
        }
      }
    };
    for (const sheet of document.styleSheets) visit(sheet);
    return count;
  });
  expect(count).toBeGreaterThanOrEqual(2);
  const fallback = await paint(manager(page), true);
  expect(fallback).toMatchObject({ filter: "none", image: "none" });
  expect(fallback.fill).toBe("rgb(32, 36, 45)");
  expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(saved);
  await cdp.detach();
});
