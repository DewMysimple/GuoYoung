import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { readGlassMaterial } from '../scripts/read-glass-material.mjs';
import { prepareMaterialPage as prepareChangingMaterial } from './wallpaper-fixture';

test('wallpaper material survives React selection class changes', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material lifecycle');
  await prepareChangingMaterial(page);
  const card = page.getByTestId('site-card-google');
  const expectWallpaper = async () => {
    await expect.poll(() => card.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 12 });
  };
  await expectWallpaper();
  await page.getByRole('button', { name: '多选', exact: true }).click();
  await expect(card).toHaveClass(/is-selection-mode/);
  await expectWallpaper();
  await card.getByRole('button', { name: '选择 Google', exact: true }).click();
  await expect(card).toHaveClass(/is-selected/);
  await expectWallpaper();
  await page.getByRole('button', { name: '完成 1', exact: true }).click();
  await expect(card).not.toHaveClass(/is-selection-mode/);
  await expectWallpaper();
});

test('native button glass survives a long button press and cancellation', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material transition lifecycle');
  await prepareChangingMaterial(page);
  const button = page.getByRole('button', { name: '打开设置', exact: true });
  await expect.poll(() => button.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 12 });
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => button.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 12 });
  // Hold beyond the press transition, then release away from the button so
  // cancellation does not open a panel or mutate application state.
  await page.waitForTimeout(550);
  await page.mouse.move(5, 850);
  await page.mouse.up();
  await expect(page.locator('.settings-panel')).toHaveCount(0);
  await expect(button).toHaveCSS('transform', 'none');
  await expect.poll(() => button.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 12 });
});

test('wallpaper image transitions settle without changing native card sampling', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material input transitions');
  await prepareChangingMaterial(page);
  for (const [property, value, transition] of [
    ['--wallpaper-zoom', '1.3', 'transform'],
    ['--wallpaper-position-x', '25%', 'object-position'],
    ['--wallpaper-blur', '8px', 'filter'],
  ]) {
    await page.evaluate(async ({ property, value, transition }) => {
      const image = document.querySelector<HTMLImageElement>('.wallpaper-layer img')!;
      const finished = new Promise<void>(resolve => {
        const ended = (event: TransitionEvent) => {
          if (event.target !== image || event.propertyName !== transition) return;
          image.removeEventListener('transitionend', ended);
          resolve();
        };
        image.addEventListener('transitionend', ended);
      });
      document.querySelector<HTMLElement>('.app-shell')!.style.setProperty(property, value);
      await finished;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, { property, value, transition });
    const settled = await page.getByTestId('site-card-google').evaluate((card, { property, value }) => {
      const paint = getComputedStyle(card);
      const image = document.querySelector<HTMLImageElement>('.wallpaper-layer img')!;
      const style = getComputedStyle(image);
      const transform = new DOMMatrixReadOnly(style.transform);
      const actual = property === '--wallpaper-zoom' ? Math.hypot(transform.a, transform.b)
        : property === '--wallpaper-position-x' ? parseFloat(style.objectPosition)
          : parseFloat(style.filter.match(/blur\(([^)]+)/)?.[1] ?? '0');
      const expected = parseFloat(value) * (property === '--wallpaper-zoom' ? 1.02 : 1);
      return {
        imageReady: image.complete && image.naturalWidth > 0,
        visibility: style.visibility,
        settledDifference: Math.abs(actual - expected),
        cardFilter: paint.filter,
        cardBackdrop: paint.backdropFilter,
        cardImage: paint.backgroundImage,
      };
    }, { property, value });
    expect(settled.imageReady, `${property}: the real wallpaper is decoded`).toBe(true);
    expect(settled.visibility, `${property}: the original image remains visible`).toBe('visible');
    expect(settled.settledDifference, `${property}: the actual image reaches the requested value`).toBeLessThan(.01);
    expect(settled.cardFilter, `${property}: cards do not paint a copied wallpaper`).toBe('none');
    expect(settled.cardImage).not.toContain('url(');
    expect(settled.cardBackdrop).toBe('blur(12px) saturate(1.3)');
  }
});

test('dense wallpaper cards scroll without per-card forced style recalculation', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop CDP rendering metrics');
  await page.setViewportSize({ width: 1920, height: 926 });
  await page.route('https://material.example/performance.svg', route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#79829a"/><circle cx="600" cy="500" r="300" fill="#d5b9c7"/></svg>' }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
    const template = state.sites[0];
    state.sites = Array.from({ length: 117 }, (_, index) => ({ ...template, id: `material-perf-${index}`, name: `Material ${index}`, url: `https://example.com/${index}`, iconSource: 'brand', order: index, globalOrder: index }));
    state.appearance = { ...state.appearance, cardWidth: 140, cardHeight: 124 };
    state.wallpaper = { ...state.wallpaper, source: 'url', url: 'https://material.example/performance.svg', blur: 0, overlay: 0, glassBlur: 24, glassTransparency: 90, glassSaturation: 100 };
    localStorage.setItem('site-hub:v1', JSON.stringify(state));
  });
  await page.reload();
  await page.locator('.wallpaper-layer img').evaluate(image => (image as HTMLImageElement).decode());
  await expect.poll(() => page.locator('.site-card').first().evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 24 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
  const before = await metrics();
  await page.evaluate(async () => {
    for (let step = 0; step < 24; step++) {
      window.scrollTo(0, 12 * step);
      // Give scroll events a complete rendering turn.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
  });
  const after = await metrics();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(200);
  expect(after.RecalcStyleCount - before.RecalcStyleCount, 'Style recalculation should scale with rendered frames, not visible card count').toBeLessThan(120);
  await expect.poll(() => page.locator('.site-card').first().evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 24 });
});

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

test('wallpaper materials visibly blur fine source stripes', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material optics');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://material.example/stripes.svg', route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="white"/><rect width="8" height="16" fill="black"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>' }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
    state.appearance = { ...state.appearance, theme: 'dark', cardWidth: 190, cardHeight: 160 };
    state.wallpaper = { ...state.wallpaper, source: 'url', url: 'https://material.example/stripes.svg', blur: 0, overlay: 0, glassBlur: 12, glassSaturation: 100 };
    localStorage.setItem('site-hub:v1', JSON.stringify(state));
  });
  const prepare = async () => {
    await page.reload();
    await page.locator('.wallpaper-layer img').evaluate(image => (image as HTMLImageElement).decode());
    await expect.poll(() => page.locator('.site-card').first().evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop' });
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
  const disable = await page.addStyleTag({ content: '.site-card { backdrop-filter:none!important }' });
  expect(variation(await pixels(page, center)).deviation, 'The unfiltered wallpaper really contains contrasting stripes').toBeGreaterThan(40);
  await disable.evaluate(element => element.remove());
});
