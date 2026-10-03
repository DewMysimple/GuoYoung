import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/** Local image and bundled icons keep unrelated network mutations out of lifecycle tests. */
export async function prepareMaterialPage(page: Page, glassBlur = 12) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://material.example/changing.svg', route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#79829a"/><circle cx="600" cy="500" r="300" fill="#d5b9c7"/></svg>' }));
  await page.evaluate((blur) => {
    const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
    state.sites = state.sites.filter((site: { id: string }) => ['google', 'github'].includes(site.id))
      .map((site: Record<string, unknown>) => ({ ...site, iconSource: 'brand' }));
    state.wallpaper = { ...state.wallpaper, source: 'url', url: 'https://material.example/changing.svg', fit: 'cover', positionX: 50, positionY: 50, zoom: 100, blur: 0, overlay: 0, glassBlur: blur, glassRefraction: false };
    localStorage.setItem('site-hub:v1', JSON.stringify(state));
  }, glassBlur);
  await page.reload();
  await expect(page.getByTestId('site-card-google')).toHaveClass(/wallpaper-material-before/);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}
