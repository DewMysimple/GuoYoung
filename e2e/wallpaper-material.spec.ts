import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function pixels(page: Page, region: { x: number; y: number; width: number; height: number }) {
  const screenshot = await page.screenshot();
  return page.evaluate(async ({ image, region }) => {
    const img = new Image(); img.src = `data:image/png;base64,${image}`; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = region.width; canvas.height = region.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(img, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    return Array.from(context.getImageData(0, 0, region.width, region.height).data);
  }, { image: screenshot.toString('base64'), region });
}

test('wallpaper materials visibly blur the source and refract its rim without moving the center', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material optics');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://material.example/stripes.svg', route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="white"/><rect width="8" height="16" fill="black"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>' }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
    state.appearance = { ...state.appearance, theme: 'dark', cardWidth: 190, cardHeight: 160 };
    state.wallpaper = { ...state.wallpaper, source: 'url', url: 'https://material.example/stripes.svg', blur: 0, overlay: 0, glassBlur: 12, glassSaturation: 100, glassRefraction: false };
    localStorage.setItem('site-hub:v1', JSON.stringify(state));
  });
  const prepare = async () => {
    await page.reload();
    await expect(page.locator('.site-card').first()).toHaveClass(/wallpaper-material-before/);
    await page.evaluate(() => document.fonts.ready);
    // Inspect the real material without text/icons obscuring the sampled pixels.
    await page.addStyleTag({ content: '.site-card > * { visibility:hidden!important }' });
    await page.mouse.move(5, 850);
  };
  await prepare();
  const card = page.locator('.site-card').first();
  const box = (await card.boundingBox())!;
  const center = { x: Math.round(box.x + 65), y: Math.round(box.y + 55), width: 50, height: 40 };
  const blurred = await pixels(page, center);
  const variation = (data: number[]) => {
    const red = data.filter((_, index) => index % 4 === 0);
    const mean = red.reduce((a, b) => a + b, 0) / red.length;
    return { mean, deviation: Math.sqrt(red.reduce((sum, value) => sum + (value - mean) ** 2, 0) / red.length) };
  };
  expect(variation(blurred).mean).toBeGreaterThan(60);
  expect(variation(blurred).mean).toBeLessThan(220);
  expect(variation(blurred).deviation, '12px blur must remove fine wallpaper stripes').toBeLessThan(8);
  const disable = await page.addStyleTag({ content: '.wallpaper-material-before::before { filter:none!important }' });
  expect(variation(await pixels(page, center)).deviation, 'The unfiltered wallpaper really contains contrasting stripes').toBeGreaterThan(40);
  await disable.evaluate(element => element.remove());

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
    state.wallpaper = { ...state.wallpaper, glassBlur: 2, glassRefraction: true, glassRefractionStrength: 32 };
    localStorage.setItem('site-hub:v1', JSON.stringify(state));
  });
  await prepare();
  const edge = { x: Math.round(box.x + 3), y: Math.round(box.y + 40), width: 14, height: 70 };
  const refractedCenter = await pixels(page, center), refractedEdge = await pixels(page, edge);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
    // Keep refraction's sheen/border styling unchanged; isolate displacement.
    state.wallpaper.glassRefractionStrength = 0;
    localStorage.setItem('site-hub:v1', JSON.stringify(state));
  });
  await prepare();
  const difference = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + (index % 4 === 3 ? 0 : Math.abs(value - b[index])), 0) / (a.length * .75);
  const centerChange = difference(refractedCenter, await pixels(page, center));
  const edgeChange = difference(refractedEdge, await pixels(page, edge));
  expect(centerChange, 'Refraction keeps the center optically anchored').toBeLessThan(3);
  expect(edgeChange, 'Refraction visibly bends the wallpaper near the rim').toBeGreaterThan(centerChange + 3);
});
