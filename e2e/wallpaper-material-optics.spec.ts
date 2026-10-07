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
        glassHighlight: 0, glassShadow: 0 };
      // The card adds no blur, tint, rim or shadow of its own.
      localStorage.setItem('site-hub:v1', JSON.stringify(state));
    }, zoom);
    await page.reload();
    const card = page.getByTestId('site-card-google');
    await expect.poll(() => card.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'none', blur: 0 });
    await page.locator('.wallpaper-layer img').evaluate(image => (image as HTMLImageElement).decode());
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '.site-card > * { visibility: hidden !important; }' });
    await page.mouse.move(5, 850);
    const box = (await card.boundingBox())!;
    const region = { x: Math.round(box.x + 35), y: Math.round(box.y + 65), width: 140, height: 70 };
    const glass = await regionPixels(page, region);
    // Neutral cards have no filter. The real visible image owns source blur.
    const disable = await page.addStyleTag({ content: '.wallpaper-layer img { filter:none!important;transition:none!important }' });
    const unblurred = await regionPixels(page, region);
    const positiveControlMean = pixelDifference(glass, unblurred).mean;
    await disable.evaluate(element => element.remove());
    await expect(page.locator('.wallpaper-layer img')).toHaveCSS('filter', 'blur(8px)');
    // Opacity removes the entire composed material without moving the region.
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

test('neutral normal-flow cards match a contained PNG at small and large source blur', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop contained wallpaper optics');
  await page.setViewportSize({ width: 1440, height: 900 });
  const encoded = await page.evaluate(async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1600"><defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#f6bf4b"/><rect width="12" height="24" fill="#2542b0"/></pattern></defs><rect width="900" height="1600" fill="url(#p)"/></svg>';
    const image = new Image(); image.src = `data:image/svg+xml;base64,${btoa(svg)}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1600;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const url = 'https://material.example/contained-color-stripes.png';
  await page.route(url, route => route.fulfill({ contentType: 'image/png', body: Buffer.from(encoded, 'base64') }));
  const comparisons: { sourceBlur: number; mean: number; max: number; positiveControlMean: number }[] = [];
  for (const sourceBlur of [8, 20]) {
    await page.evaluate(({ sourceBlur, url }) => {
      const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
      state.sites = state.sites.filter((site: { id: string }) => site.id === 'google')
        .map((site: Record<string, unknown>) => ({ ...site, iconSource: 'brand' }));
      state.appearance = { ...state.appearance, theme: 'light', cardWidth: 220, cardHeight: 200 };
      state.wallpaper = { ...state.wallpaper, source: 'url', url, fit: 'contain', positionX: 0, positionY: 50,
        zoom: 100, blur: sourceBlur, overlay: 0, glassBlur: 0, glassSaturation: 100,
        glassTransparency: 100, glassControlTransparency: 100, glassPanelTransparency: 100, glassPopoverTransparency: 100,
        glassHighlight: 0, glassShadow: 0 };
      localStorage.setItem('site-hub:v1', JSON.stringify(state));
    }, { sourceBlur, url });
    await page.reload();
    const card = page.getByTestId('site-card-google');
    await expect.poll(() => card.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'none', blur: 0, saturation: 1 });
    await page.locator('.wallpaper-layer img').evaluate(image => (image as HTMLImageElement).decode());
    await page.evaluate(() => document.fonts.ready);
    const box = (await card.boundingBox())!;
    // Keep the real card in its normal grid slot. Moving a fixed diagnostic
    // surface can retain a stale raster and is not this regression's trigger.
    await page.addStyleTag({ content: '.app-shell main,.topbar,.footer{visibility:hidden!important} [data-testid="site-card-google"]{visibility:visible!important} [data-testid="site-card-google"]>*{visibility:hidden!important}' });
    await page.mouse.move(1430, 880);
    const region = { x: Math.round(box.x + box.width / 2 - 60), y: Math.round(box.y + box.height / 2 - 40), width: 120, height: 80 };
    const source = await page.locator('.wallpaper-layer img').evaluate(element => {
      const image = element as HTMLImageElement;
      const style = getComputedStyle(image), box = image.getBoundingClientRect();
      const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
      const width = scale * image.naturalWidth;
      const x = parseFloat(style.objectPosition) / 100;
      const transform = new DOMMatrixReadOnly(style.transform);
      return { left: box.x + (box.width - width) * x, width,
        blur: Math.hypot(...Array.from(style.filter.matchAll(/blur\(([^)]+)/g), match => parseFloat(match[1]))) * Math.hypot(transform.a, transform.b) };
    });
    expect(source.blur).toBeCloseTo(sourceBlur * 1.02, 3);
    expect(region.x).toBeGreaterThan(source.left + 3 * source.blur);
    expect(region.x + region.width).toBeLessThan(source.left + source.width - 3 * source.blur);
    const glass = await regionPixels(page, region);
    const disable = await page.addStyleTag({ content: '.wallpaper-layer img{filter:none!important;transition:none!important}' });
    const positiveControlMean = pixelDifference(glass, await regionPixels(page, region)).mean;
    await disable.evaluate(element => element.remove());
    await expect(page.locator('.wallpaper-layer img')).toHaveCSS('filter', `blur(${sourceBlur}px)`);
    await page.addStyleTag({ content: '[data-testid="site-card-google"]{opacity:0!important}' });
    const wallpaper = await regionPixels(page, region);
    expect(await card.boundingBox(), 'Optical controls cannot move the real card').toEqual(box);
    comparisons.push({ sourceBlur, ...pixelDifference(glass, wallpaper), positiveControlMean });
  }
  await info.attach('contained-png-source-blur-pixels', { body: JSON.stringify(comparisons, null, 2), contentType: 'application/json' });
  for (const comparison of comparisons) {
    expect(comparison.positiveControlMean, `${comparison.sourceBlur}px: the actual source blur must affect pixels`).toBeGreaterThan(20);
    expect(comparison.mean, `${comparison.sourceBlur}px: neutral glass must match the contained PNG`).toBeLessThan(2);
    expect(comparison.max, `${comparison.sourceBlur}px: no stripe may diverge from the visible wallpaper`).toBeLessThan(6);
  }
});
