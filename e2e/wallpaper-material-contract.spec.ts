import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { readGlassMaterial } from '../scripts/read-glass-material.mjs';

const wallpaperUrl = 'https://material.example/contract.svg';

async function prepareMaterial(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route(wallpaperUrl, route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#7689a2"/><circle cx="450" cy="400" r="300" fill="#d5b9c7"/></svg>' }));
  await page.evaluate(url => {
    const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
    state.sites = state.sites.filter((site: { id: string }) => ['google', 'github'].includes(site.id))
      .map((site: Record<string, unknown>) => ({ ...site, iconSource: 'brand' }));
    state.wallpaper = { ...state.wallpaper, source: 'url', url, blur: 6, overlay: 0,
      glassBlur: 24, glassSaturation: 100, glassRefraction: true, glassRefractionStrength: 32,
      glassTransparency: 90, glassControlTransparency: 90, glassPanelTransparency: 90, glassPopoverTransparency: 90,
      topbarStyle: 'glass', topbarReadability: 'page', topbarBlurEnabled: true, topbarBlur: 4,
      sidebarStyle: 'glass', sidebarBlurEnabled: true, sidebarBlur: 8 };
    localStorage.setItem('site-hub:v1', JSON.stringify(state));
  }, wallpaperUrl);
  await page.reload();
  await expect.poll(() => page.getByTestId('site-card-google').evaluate(readGlassMaterial, true))
    .toMatchObject({ sampling: 'wallpaper', blur: 24, refraction: true });
  await page.evaluate(() => document.fonts.ready);
}

async function refreshMaterial(page: Page) {
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('resize'));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function openImportMenu(page: Page) {
  await page.getByRole('button', { name: '打开数据', exact: true }).click();
  await page.getByLabel('选择要导入的数据文件').setInputFiles({ name: 'material-contract.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'site-hub-group-export', exportVersion: 1, exportedAt: '2026-10-03T00:00:00Z',
    group: { name: 'Material contract', icon: 'folder' }, sites: [{ name: 'Example', url: 'https://example.com/', order: 0 }],
  })) });
  await page.getByRole('button', { name: '导入方式', exact: true }).click();
  const menu = page.locator('.data-workspace .select-menu-popover');
  await expect(menu).toBeVisible();
  return menu;
}

async function remainingFilters(page: Page) {
  return page.evaluate(() => {
    const remaining: string[] = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (!(element instanceof HTMLElement) || element.closest('.wallpaper-layer')) continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) continue;
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        if (pseudo && (style.content === 'none' || style.display === 'none')) continue;
        if (style.backdropFilter !== 'none' || (element.matches('.site-card, .add-site-card') && style.filter !== 'none')) {
          remaining.push(`${element.tagName.toLowerCase()}.${element.className}${pseudo ?? ''}: ${style.backdropFilter}; ${style.filter}`);
        }
      }
    }
    return remaining;
  });
}

async function backgroundAlpha(locator: Locator) {
  return locator.evaluate(element => {
    const color = getComputedStyle(element).backgroundColor;
    return Number(color.match(/\/\s*([\d.]+)\)$/)?.[1] ?? color.match(/^rgba\(.+,\s*([\d.]+)\)$/)?.[1] ?? 1);
  });
}

test('data import menus keep their own blur through material refreshes', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material contract');
  await prepareMaterial(page);
  const menu = await openImportMenu(page);
  for (let pass = 0; pass < 3; pass++) {
    await refreshMaterial(page);
    expect(await menu.evaluate(readGlassMaterial, false), `Refresh ${pass}: the menu must not inherit the enclosing 24px panel blur`)
      .toMatchObject({ sampling: 'backdrop', blur: 18 });
  }
  const dataCard = page.locator('.data-card').first();
  expect(await backgroundAlpha(dataCard)).toBeCloseTo(.1, 4);
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await expect.poll(() => remainingFilters(page)).toEqual([]);
  expect(await backgroundAlpha(dataCard)).toBeGreaterThanOrEqual(.96);
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] });
  await expect.poll(() => backgroundAlpha(dataCard)).toBeCloseTo(.1, 4);
  await expect.poll(() => menu.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 18 });
  await session.detach();
});

test('reduced transparency disables all visible collection glass and restores it', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material accessibility');
  await prepareMaterial(page);
  await page.getByRole('button', { name: '多选', exact: true }).click();
  const badge = page.locator('.category-tab > span').first();
  await expect.poll(() => badge.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'none', blur: 0 });
  await expect.poll(() => badge.locator('..').evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 24 });
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await expect.poll(() => remainingFilters(page)).toEqual([]);
  expect(await backgroundAlpha(badge)).toBeGreaterThanOrEqual(.96);
  await expect.poll(() => page.locator('.wallpaper-layer').evaluate(element => {
    const filter = getComputedStyle(element, '::before').filter;
    return Math.abs(Math.hypot(...Array.from(filter.matchAll(/blur\(([^)]+)/g), match => parseFloat(match[1]))) - 6.12);
  })).toBeLessThan(.0001);
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] });
  await expect.poll(() => badge.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'none', blur: 0 });
  await expect.poll(() => badge.locator('..').evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 24 });
  await expect.poll(() => page.getByTestId('site-card-google').evaluate(readGlassMaterial, true))
    .toMatchObject({ sampling: 'wallpaper', blur: 24, refraction: true });
  await session.detach();
});

test('native menu filters retain their original values without wallpaper', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop native material contract');
  await expect(page.locator('.app-shell')).not.toHaveClass(/has-wallpaper/);
  const menu = await openImportMenu(page);
  await expect.poll(() => menu.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 18 });
  await expect.poll(() => page.getByRole('button', { name: '导入方式', exact: true }).evaluate(readGlassMaterial, false))
    .toMatchObject({ sampling: 'backdrop', blur: 12 });
});

test('native backdrops retain their paint and attributes through scrolling and resizing', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop native material ownership');
  await prepareMaterial(page);
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.app-shell')!;
    root.style.minHeight = '2000px';
    const parent = document.createElement('div');
    parent.className = 'data-card';
    parent.style.cssText = 'position:fixed;top:120px;left:40px;width:160px;height:100px';
    const probe = document.createElement('div');
    probe.dataset.testid = 'native-backdrop-contract';
    probe.style.cssText = 'width:100px;height:60px;backdrop-filter:blur(18px)';
    // Record transient writes too; wallpaper sampling never owns native controls.
    const writes: string[] = [];
    new MutationObserver(records => writes.push(...records.map(record => record.attributeName!)))
      .observe(probe, { attributes: true });
    Object.assign(window, { nativeProbeWrites: writes });
    parent.append(probe);
    root.append(parent);
  });
  const probe = page.getByTestId('native-backdrop-contract');
  for (let pass = 0; pass < 3; pass++) {
    await page.evaluate(y => scrollTo(0, y), 100 * (pass + 1));
    await refreshMaterial(page);
    expect(await probe.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 18 });
    expect(await page.evaluate(() => (window as unknown as { nativeProbeWrites: string[] }).nativeProbeWrites)).toEqual([]);
  }
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test('native glass preserves topbar pseudo surfaces and the settings portal', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material portal contract');
  await prepareMaterial(page);
  await expect.poll(() => page.locator('.topbar').evaluate(readGlassMaterial, true))
    .toMatchObject({ sampling: 'backdrop', blur: 4, saturation: 1.4 });
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '设置', exact: true });
  expect(await panel.evaluate(element => element.closest('.app-shell'))).toBeNull();
  await expect.poll(() => panel.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 8 });
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await expect.poll(() => remainingFilters(page)).toEqual([]);
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] });
  await expect.poll(() => panel.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 8 });
  await expect.poll(() => page.locator('.topbar').evaluate(readGlassMaterial, true))
    .toMatchObject({ sampling: 'backdrop', blur: 4, saturation: 1.4 });
  await session.detach();
});
