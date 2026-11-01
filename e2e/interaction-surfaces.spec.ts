import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const wallpaperURL = "https://interaction-surfaces.example/wallpaper.svg";
const darkWallpaper = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#101827"/><path d="M0 180H1920M0 220H1920M0 260H1920M0 300H1920" stroke="#557a9a" stroke-width="14"/></svg>';
const brightWallpaper = darkWallpaper.replace('</svg>', '<rect x="1250" y="120" width="670" height="300" fill="#e6d7aa"/><path d="M1250 180H1920M1250 260H1920" stroke="#9f7143" stroke-width="18"/></svg>');

async function seed(page: Page, theme: "light" | "dark", wallpaper: "none" | "dark" | "bright") {
  await page.route(wallpaperURL, route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper === "bright" ? brightWallpaper : darkWallpaper }));
  await page.evaluate(({ theme, wallpaper, wallpaperURL }) => {
    const key = "site-hub:v1", state = JSON.parse(localStorage.getItem(key)!);
    state.appearance = { ...state.appearance, theme, interfaceScale: 100, fontScale: 100 };
    state.wallpaper = { ...state.wallpaper, source: wallpaper === "none" ? "none" : "url", url: wallpaperURL,
      glassTransparency: 60, glassControlTransparency: 60, glassPopoverTransparency: 25,
      glassBlur: 8, glassSaturation: 100, glassHighlight: 18, overlay: 0 };
    state.sortModeByWorkspace.main = "manual";
    state.displayModeByWorkspace.main = "flat";
    state.trashRetentionDays = 30;
    localStorage.setItem(key, JSON.stringify(state));
  }, { theme, wallpaper, wallpaperURL });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.getByRole("button", { name: "显示", exact: true })).toBeVisible();
  if (wallpaper !== "none") await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
}

/** Canvas normalizes color-mix/color(srgb)/rgba without assuming serialization. */
async function material(element: Locator) {
  return element.evaluate(async element => {
    getComputedStyle(element).backgroundColor;
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined)));
    const css = getComputedStyle(element), canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    const rgba = (color: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    return { background: rgba(css.backgroundColor), image: css.backgroundImage, color: rgba(css.color),
      border: css.borderColor, shadow: css.boxShadow, filter: css.backdropFilter,
      outline: css.outlineStyle, outlineWidth: parseFloat(css.outlineWidth), outlineOffset: parseFloat(css.outlineOffset), opacity: css.opacity,
      hovered: element.matches(":hover"), focused: element.matches(":focus-visible") };
  });
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop interaction surface acceptance");
  await page.setViewportSize({ width: 1720, height: 1050 });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const [theme, wallpaper] of [["light", "none"], ["dark", "none"], ["dark", "dark"], ["dark", "bright"]] as const) {
  test(`keeps select materials continuous through hover, open, active and keyboard: ${theme}/${wallpaper}`, async ({ page }) => {
    await seed(page, theme, wallpaper);
    const sort = page.locator(".collection-view-controls .select-menu-trigger").first();
    const display = page.getByRole("button", { name: "显示", exact: true });
    for (const trigger of [sort, display]) {
      await page.mouse.move(0, 0);
      const normal = await material(trigger);
      await trigger.hover();
      const hovered = await material(trigger);
      expect(hovered.hovered).toBe(true);
      expect(hovered.color[3]).toBe(255);
      expect(hovered.background).not.toEqual(normal.background);
      if (wallpaper !== "none") {
        expect(hovered.background[3], "Moderate wallpaper hover remains translucent").toBeLessThan(250);
        expect(hovered.background[3]).toBeGreaterThan(0);
        expect(hovered.image, "Hover preserves the glass image layer").not.toBe("none");
        expect(hovered.filter).toContain("blur(8px)");
      }
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      const menu = page.getByRole("menu", { name: trigger === sort ? "排列方式" : "显示方式", exact: true });
      await expect(menu).toBeVisible();
      const open = await material(trigger);
      await page.mouse.move(0, 0);
      expect((await material(trigger)).background, "Open persists after pointer leaves").toEqual(open.background);
      const selected = menu.getByRole("menuitemradio", { checked: true });
      await expect(selected).toHaveCount(1);
      const selectedMaterial = await material(selected);
      await selected.hover();
      expect((await material(selected)).background, "Selected menu tint survives hover").toEqual(selectedMaterial.background);
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(trigger).toBeFocused();
      const focus = await material(trigger);
      expect(focus.focused).toBe(true);
      expect(focus.outline).toBe("solid");
      expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
      await page.keyboard.press("Enter");
      await expect(selected).toBeFocused();
      await page.keyboard.press("End");
      await expect(menu.getByRole("menuitemradio").last()).toBeFocused();
      await page.keyboard.press("Home");
      await expect(menu.getByRole("menuitemradio").first()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Space");
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveClass(/active/);
      await page.mouse.move(0, 0);
      const active = await material(trigger);
      await trigger.hover();
      expect((await material(trigger)).background, "Business active wins over hover").toEqual(active.background);
      await trigger.click();
      expect((await material(trigger)).background, "Active + open + hover uses the same selected material").toEqual(active.background);
      await page.keyboard.press("Escape");
      if (wallpaper !== "none") expect(active.background[3]).toBeLessThan(250);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(sort).toHaveClass(/active/);
    await expect(display).toHaveClass(/active/);
  });
}

test("keeps plain view buttons and disabled selectors independent of settings portal surfaces", async ({ page }) => {
  await seed(page, "dark", "dark");
  const multi = page.locator('.collection-view-controls [data-selection-surface="selection-switch"]');
  await multi.hover();
  const hovered = await material(multi);
  expect(hovered.background[3]).toBeLessThan(250);
  await multi.click();
  const active = await material(multi);
  await page.mouse.move(0, 0);
  expect((await material(multi)).background).toEqual(active.background);
  await multi.click();
  const sort = page.locator(".collection-view-controls .select-menu-trigger").first();
  await page.getByRole("searchbox").fill("GitHub");
  await expect(sort).toBeDisabled();
  await page.mouse.move(0, 0);
  const disabled = await material(sort);
  await sort.hover();
  expect((await material(sort)).background).toEqual(disabled.background);
  await expect(sort).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "打开回收站", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  expect(await panel.evaluate(element => !element.closest(".app-shell"))).toBe(true);
  const settingsSelect = panel.getByRole("button", { name: "回收站自动清理期限", exact: true });
  const settingsMaterial = await material(settingsSelect);
  await settingsSelect.hover();
  expect((await material(settingsSelect)).background).toEqual(settingsMaterial.background);
  await settingsSelect.press("ArrowDown");
  const selected = panel.getByRole("option", { selected: true });
  await expect(selected).toBeFocused();
  expect((await material(selected)).background).toEqual(settingsMaterial.background);
  expect((await material(selected)).outlineOffset, "Settings retains its own outward focus ring").toBe(2);
  const first = panel.getByRole("option").first();
  const unselected = await material(first);
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  const focusedOption = await material(first);
  expect(focusedOption.outlineOffset).toBe(2);
  expect(focusedOption.background, "Focus does not replace the settings option's surface").toEqual(unselected.background);
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await expect(settingsSelect).toBeFocused();
});

test("uses the intentional reduced-transparency material without changing saved preferences", async ({ page }) => {
  await seed(page, "dark", "dark");
  const saved = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [
    { name: "prefers-reduced-transparency", value: "reduce" },
    { name: "prefers-reduced-motion", value: "reduce" },
  ] });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches)).toBe(true);
  const trigger = page.getByRole("button", { name: "显示", exact: true });
  for (const state of ["normal", "hover", "open"] as const) {
    if (state === "hover") await trigger.hover();
    if (state === "open") await trigger.click();
    const css = await material(trigger);
    expect(css.background[3]).toBeGreaterThanOrEqual(240);
    expect(css.image).toBe("none");
    expect(css.filter).toBe("none");
  }
  const menu = page.getByRole("menu", { name: "显示方式", exact: true });
  expect((await material(menu)).background[3]).toBeGreaterThanOrEqual(240);
  expect((await material(menu)).image).toBe("none");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(saved);
  await cdp.detach();
});
