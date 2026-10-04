import { expect, test } from './fixtures';
import { prepareMaterialPage } from './wallpaper-fixture';
import { readGlassMaterial } from '../scripts/read-glass-material.mjs';
import type { Locator, Page } from '@playwright/test';

async function materialPixels(page: Page, surface: Locator) {
  const box = (await surface.boundingBox())!;
  const screenshot = await page.screenshot();
  return page.evaluate(async ({ encoded, box }) => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 40;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, Math.round(box.x + 20), Math.round(box.y + 20), 80, 40, 0, 0, 80, 40);
    return Array.from(context.getImageData(0, 0, 80, 40).data);
  }, { encoded: screenshot.toString('base64'), box });
}

test('favicon content changes do not remeasure unchanged glass cards', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material update scope');
  await prepareMaterialPage(page);
  const reads = await page.evaluate(async () => {
    const original = window.getComputedStyle;
    let count = 0;
    window.getComputedStyle = function(element, pseudo) {
      if (element.matches('.site-card')) count++;
      return original.call(window, element, pseudo);
    };
    try {
      const frame = document.querySelector('.site-card .favicon-frame')!;
      for (let index = 0; index < 12; index++) {
        const placeholder = document.createElement('span');
        placeholder.className = 'favicon-letter';
        placeholder.textContent = 'G';
        frame.append(placeholder);
        await new Promise(resolve => requestAnimationFrame(resolve));
        placeholder.remove();
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return count;
    } finally { window.getComputedStyle = original; }
  });
  expect(reads, 'Fixed-size icon content does not change any glass sampling geometry').toBe(0);
});

test('scrolling a body portal does not resample the stationary collection', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material update scope');
  await prepareMaterialPage(page);
  await page.getByRole('button', { name: '打开设置' }).click();
  const panel = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(panel).toHaveCSS('transform', 'none');
  await panel.getByRole('button', { name: '布局微调' }).click();
  await expect.poll(() => panel.locator('.settings-body').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.waitForTimeout(400);
  const result = await page.evaluate(async () => {
    const body = document.querySelector('.settings-body')!;
    const original = window.getComputedStyle;
    let reads = 0;
    window.getComputedStyle = function(element, pseudo) {
      if (element.matches('.site-card')) reads++;
      return original.call(window, element, pseudo);
    };
    try {
      for (let index = 0; index < 8; index++) {
        body.scrollTop += 20;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      return { reads, scrollTop: body.scrollTop };
    } finally { window.getComputedStyle = original; }
  });
  expect(result.scrollTop).toBeGreaterThan(0);
  expect(result.reads, 'Portal scrolling must not invalidate unrelated wallpaper surfaces').toBe(0);
});

test('a nested card samples its current viewport position and returns to the same pixels', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material update scope');
  await prepareMaterialPage(page);
  await page.evaluate(() => {
    const scroller = document.createElement('div');
    scroller.id = 'material-scroller';
    scroller.style.cssText = 'position:absolute;left:630px;top:400px;width:220px;height:180px;overflow:auto';
    const content = document.createElement('div');
    content.style.cssText = 'height:600px;padding-top:80px';
    const surface = document.createElement('div');
    surface.id = 'nested-material';
    surface.className = 'site-card';
    surface.style.cssText = 'width:120px;height:90px';
    content.append(surface); scroller.append(content);
    document.querySelector('.app-shell')!.append(scroller);
  });
  const surface = page.locator('#nested-material');
  await expect.poll(() => surface.evaluate(readGlassMaterial, false)).toMatchObject({ sampling: 'backdrop', blur: 12 });
  const before = (await surface.boundingBox())!;
  const first = await materialPixels(page, surface);
  await page.locator('#material-scroller').evaluate(element => { element.scrollTop = 60; });
  await expect.poll(async () => (await surface.boundingBox())!.y).toBeCloseTo(before.y - 60, 1);
  const moved = await materialPixels(page, surface);
  const difference = first.reduce((sum, value, index) => sum + (index % 4 === 3 ? 0 : Math.abs(value - moved[index])), 0) / (first.length * .75);
  expect(difference, 'Moving through the wallpaper must change the sampled pixels').toBeGreaterThan(1);
  await page.locator('#material-scroller').evaluate(element => { element.scrollTop = 0; });
  expect(await materialPixels(page, surface), 'Returning to the same viewport position restores the same material pixels').toEqual(first);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('large scroll and return perform no root, source or card attribute writes', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material scroll ownership');
  await prepareMaterialPage(page);
  const result = await page.evaluate(async () => {
    const root = document.querySelector<HTMLElement>('.app-shell')!;
    root.style.minHeight = '3000px';
    const scroller = document.createElement('div');
    scroller.style.cssText = 'position:absolute;left:650px;top:400px;width:240px;height:200px;overflow:auto';
    scroller.innerHTML = '<div style="height:1000px;padding-top:80px"><div class="site-card" style="width:120px;height:90px"></div></div>';
    root.append(scroller);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const targets = [document.documentElement, root, ...document.querySelectorAll('.wallpaper-layer, .wallpaper-layer img, .site-card, .add-site-card, svg filter, svg filter *')];
    const writes: string[] = [];
    const observer = new MutationObserver(records => writes.push(...records.map(record => `${(record.target as Element).tagName}:${record.attributeName}`)));
    for (const target of targets) observer.observe(target, { attributes: true });
    let maximumDocumentScroll = 0, maximumNestedScroll = 0;
    try {
      for (const y of [800, 1800, 0, 1400, 0]) {
        window.scrollTo(0, y);
        scroller.scrollTop = y ? 500 : 0;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        maximumDocumentScroll = Math.max(maximumDocumentScroll, scrollY);
        maximumNestedScroll = Math.max(maximumNestedScroll, scroller.scrollTop);
      }
      return { writes, maximumDocumentScroll, maximumNestedScroll, finalScroll: scrollY };
    } finally { observer.disconnect(); }
  });
  expect(result.maximumDocumentScroll).toBeGreaterThan(1000);
  expect(result.maximumNestedScroll).toBe(500);
  expect(result.finalScroll).toBe(0);
  expect(result.writes, 'The browser owns backdrop sampling, with no JavaScript material synchronization').toEqual([]);
});
