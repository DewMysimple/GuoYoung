import type { Page } from "@playwright/test";
import { expect, test, screenshotPath } from "./fixtures";

async function seedWallpaper(page: Page, theme = "light", sort = "heat") {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.route("https://material.example/wall.svg", route => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g"><stop stop-color="#28567c"/><stop offset=".5" stop-color="#bed7c8"/><stop offset="1" stop-color="#564d6b"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><path d="M0 650L1600 120M0 800L1600 270" stroke="#e3e6cf" stroke-width="70"/></svg>',
  }));
  await page.evaluate(({ theme, sort }) => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.appearance.theme = theme;
    state.sortModeByWorkspace.main = sort;
    state.displayModeByWorkspace.main = "flat";
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://material.example/wall.svg",
      zoom: 100, blur: 0, overlay: 0, glassTransparency: 78, glassBlur: 8, glassRefraction: false };
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  }, { theme, sort });
  await page.reload();
  await expect(page.locator(".has-wallpaper .site-card").first()).toBeVisible();
}

for (const theme of ["light", "dark"]) {
  for (const sort of ["manual", "heat", "name-asc", "name-desc", "newest", "oldest"]) {
    test(`card paint stays translucent under pointer during ${sort} drag (${theme})`, async ({ page }, info) => {
      test.skip(info.project.name !== "chromium", "Desktop material state matrix");
      await seedWallpaper(page, theme, sort);
      const cards = page.locator(".site-card[data-site-dnd-id]");
      // Keep identities stable while manual sorting changes DOM order.
      const source = page.getByTestId((await cards.nth(0).getAttribute("data-testid"))!);
      const target = page.getByTestId((await cards.nth(1).getAttribute("data-testid"))!);
      const sourceBox = (await source.boundingBox())!, targetBox = (await target.boundingBox())!;
      await page.mouse.move(sourceBox.x + 40, sourceBox.y + 65);
      await page.mouse.down();
      await page.mouse.move(sourceBox.x + 100, sourceBox.y + 65, { steps: 4 });
      const preview = page.getByTestId("site-card-drag-preview");
      await expect(preview).toBeVisible();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 70, { steps: 5 });
      if (sort === "manual") {
        await expect(target).toHaveClass(/is-drop-target/);
      } else {
        await expect.poll(() => target.evaluate(el => el.matches(":hover"))).toBe(true);
        await expect(target).not.toHaveClass(/is-drop-target/);
      }
      for (const card of [source, target, preview, page.locator(".add-site-card").first()]) {
        await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(card).toHaveCSS("background-image", "none");
        await expect(card).toHaveCSS("backdrop-filter", "none");
      }
      const material = await target.evaluate(el => {
        const paint = getComputedStyle(el, "::before");
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = paint.backgroundColor; ctx.fillRect(0, 0, 1, 1);
        return { alpha: ctx.getImageData(0, 0, 1, 1).data[3] / 255, filter: paint.backdropFilter };
      });
      expect(material.alpha).toBeGreaterThan(0.2);
      expect(material.alpha).toBeLessThan(0.3);
      expect(material.filter).toContain("blur(8px)");
      if (sort === "heat") await page.screenshot({ path: screenshotPath(`material-drag-hover-${theme}.png`) });
      await page.keyboard.press("Escape"); await page.mouse.up();
      await expect(preview).toHaveCount(0);
      await target.locator("button").first().focus();
      await expect(target).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    });
  }
}

test("wallpaper wheel previews cross 100 percent continuously before gesture commit", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop wallpaper gesture");
  await seedWallpaper(page);
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("tab", { name: "壁纸", exact: true }).click();
  await page.locator("summary").filter({ hasText: /^位置与构图/ }).click();
  await page.getByRole("button", { name: "在页面拖动调整", exact: true }).click();
  const canvas = page.locator(".wallpaper-edit-canvas");
  const image = page.locator(".wallpaper-layer img");
  await expect(image).toHaveCSS("transform", "none");
  await page.clock.install();
  // Each observation is before the 140 ms trailing commit. The old class gate
  // leaves transform:none here even though the zoom variable has changed.
  for (const [delta, scale] of [[-100, 1.08], [100, 1], [1.25, 0.999], [-1.25, 1]]) {
    await canvas.dispatchEvent("wheel", { deltaY: delta });
    await page.clock.runFor(32);
    const actual = await image.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
    expect(actual).toBeCloseTo(scale, 5);
  }
  await page.clock.runFor(200);
  await expect(image).toHaveCSS("transform", "none");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).wallpaper.zoom)).toBe(100);
});
