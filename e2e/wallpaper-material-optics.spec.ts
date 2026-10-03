import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { readGlassMaterial } from '../scripts/read-glass-material.mjs';

async function regionPixels(page: Page, region: { x: number; y: number; width: number; height: number }) {
  const screenshot = await page.screenshot();
  return page.evaluate(async ({ encoded, region }) => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = region.width; canvas.height = region.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    return Array.from(context.getImageData(0, 0, region.width, region.height).data);
  }, { encoded: screenshot.toString('base64'), region });
}

function pixelDifference(first: number[], second: number[]) {
  const differences = first.flatMap((value, index) => index % 4 === 3 ? [] : [Math.abs(value - second[index])]);
  return { mean: differences.reduce((sum, value) => sum + value, 0) / differences.length, max: Math.max(...differences) };
}

test('neutral glass samples the same blurred wallpaper at each wallpaper zoom', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop wallpaper optics');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://material.example/blurred-stripes.svg', route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="white"/><rect width="20" height="40" fill="black"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>' }));
  const comparisons: { zoom: number; mean: number; max: number; positiveControlMean: number }[] = [];
  for (const zoom of [100, 150]) {
    await page.evaluate(zoom => {
      const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
      state.sites = state.sites.filter((site: { id: string }) => site.id === 'google')
        .map((site: Record<string, unknown>) => ({ ...site, iconSource: 'brand' }));
      state.appearance = { ...state.appearance, cardWidth: 220, cardHeight: 200 };
      state.wallpaper = { ...state.wallpaper, source: 'url', url: 'https://material.example/blurred-stripes.svg', fit: 'cover',
        positionX: 50, positionY: 50, zoom, blur: 8, overlay: 0, glassBlur: 0, glassSaturation: 100,
        glassTransparency: 100, glassControlTransparency: 100, glassPanelTransparency: 100, glassPopoverTransparency: 100,
        glassHighlight: 0, glassShadow: 0, glassRefraction: true, glassRefractionStrength: 0 };
      // A zero-strength lens keeps the real material path active without
      // changing pixels; the card adds no blur, tint, rim or shadow of its own.
      localStorage.setItem('site-hub:v1', JSON.stringify(state));
    }, zoom);
    await page.reload();
    const card = page.getByTestId('site-card-google');
    await expect.poll(() => card.evaluate(readGlassMaterial, true)).toMatchObject({ sampling: 'wallpaper', blur: 0, strength: 0 });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '.site-card > * { visibility: hidden !important; }' });
    await page.mouse.move(5, 850);
    const box = (await card.boundingBox())!;
    const region = { x: Math.round(box.x + 35), y: Math.round(box.y + 65), width: 140, height: 70 };
    const glass = await regionPixels(page, region);
    const original = await card.evaluate(card => {
      const filterId = getComputedStyle(card, '::before').filter.match(/#([^"')]+)/)![1];
      const href = document.getElementById(filterId)!.querySelector('feImage[result="colored"]')!.getAttribute('href')!;
      const source = document.getElementById(href.slice(1))!.querySelector('image')!;
      const original = source.getAttribute('style')!;
      source.setAttribute('style', 'filter:blur(0px)');
      return { id: href.slice(1), original };
    });
    const unblurred = await regionPixels(page, region);
    const positiveControlMean = pixelDifference(glass, unblurred).mean;
    await page.evaluate(original => document.getElementById(original.id)!.querySelector('image')!.setAttribute('style', original.original), original);
    // Opacity removes the entire composed material without moving the region.
    // Visibility is unsuitable here: Chromium can retain fragment-filter pixels.
    await page.addStyleTag({ content: '.site-card { opacity: 0 !important; }' });
    await expect(card).toHaveCSS('opacity', '0');
    const wallpaper = await regionPixels(page, region);
    comparisons.push({ zoom, ...pixelDifference(glass, wallpaper), positiveControlMean });
  }
  await info.attach('wallpaper-blur-zoom-pixels', { body: JSON.stringify(comparisons, null, 2), contentType: 'application/json' });
  for (const comparison of comparisons) {
    expect(comparison.positiveControlMean, `${comparison.zoom}% zoom: source blur must visibly affect the material`).toBeGreaterThan(20);
    expect(comparison.mean, `${comparison.zoom}% zoom: transparent neutral glass must match the wallpaper`).toBeLessThan(2);
    expect(comparison.max, `${comparison.zoom}% zoom: no stripe edge may diverge from the wallpaper`).toBeLessThan(6);
  }
});
