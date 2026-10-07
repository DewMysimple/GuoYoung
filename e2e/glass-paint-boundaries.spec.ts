import { expect, test, screenshotPath } from './fixtures';
import { expectGlassMaterial } from './glass-material';
import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

async function captureRegion(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const screenshot = await page.screenshot();
  const encoded = await page.evaluate(async ({ image, clip }) => {
    const bitmap = new Image(); bitmap.src = `data:image/png;base64,${image}`; await bitmap.decode();
    const canvas = document.createElement('canvas'); canvas.width = clip.width; canvas.height = clip.height;
    canvas.getContext('2d')!.drawImage(bitmap, clip.x, clip.y, clip.width, clip.height, 0, 0, clip.width, clip.height);
    return canvas.toDataURL().split(',')[1];
  }, { image: screenshot.toString('base64'), clip });
  return Buffer.from(encoded, 'base64');
}

test('editing tools, display menus and left-side drags leave distant glass pixels unchanged', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop compositing regression');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('https://paint.example/wallpaper.svg', route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><pattern id="p" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#194652"/><path d="M0 0H80V40H0Z" fill="#91afbb"/><path d="M0 0L80 80" stroke="#e6e3d7" stroke-width="12"/></pattern></defs><rect width="1920" height="1080" fill="url(#p)"/></svg>' }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
    state.displayModeByWorkspace.main = 'grouped';
    state.sortModeByWorkspace.main = 'heat';
    state.appearance = { ...state.appearance, theme: 'dark', cardWidth: 190, cardHeight: 160, contentWidth: 1760 };
    state.wallpaper = { ...state.wallpaper, source: 'url', url: 'https://paint.example/wallpaper.svg', overlay: 0, glassBlur: 12, glassSaturation: 130 };
    const seed = state.sites.find((site: { groupId: string }) => site.groupId === 'search');
    state.sites = Array.from({ length: 117 }, (_, i) => ({ ...seed, id: `paint-${i}`, name: `Sample ${i}`, url: `https://example.com/${i}`, iconSource: 'custom',
      customIconUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#307abb"/></svg>'),
      groupId: i < 11 ? 'search' : state.groups[1 + Math.floor((i - 11) / 22)].id, order: i, globalOrder: i, clickCount: 117 - i }));
    localStorage.setItem('site-hub:v1', JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveClass(/has-wallpaper/);
  await page.locator('.wallpaper-layer img').evaluate(image => (image as HTMLImageElement).decode());
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-group-sort-section-id="search"] .favicon-frame img.is-loaded')).toHaveCount(11);
  await page.mouse.move(5, 850);
  const cards = page.locator('.site-card[data-site-dnd-id]');
  const card = cards.nth(6);
  for (const surface of [card, page.locator('.add-site-card').first()]) {
    await expectGlassMaterial(surface, { blur: 12, saturation: 1.3 });
    expect(await surface.evaluate(el => {
      const host = getComputedStyle(el);
      return { filter: host.filter, clip: host.clipPath, promoted: host.willChange,
        copiedImage: host.backgroundImage.includes('url('),
        pseudos: ['::before', '::after'].map(pseudo => {
          const paint = getComputedStyle(el, pseudo);
          return { filter: paint.filter, backdrop: paint.backdropFilter,
            copiedImage: paint.backgroundImage.includes('url(') };
        }) };
    })).toEqual({ filter: 'none', clip: 'none', promoted: 'auto', copiedImage: false,
      pseudos: [{ filter: 'none', backdrop: 'none', copiedImage: false }, { filter: 'none', backdrop: 'none', copiedImage: false }] });
  }
  // A compositing fix must preserve the foreground fade/slide, not hide the
  // repaint defect by removing the interaction which triggers it.
  const foreground = cards.first().locator('.card-actions');
  await expect(foreground).toHaveCSS('opacity', '0');
  await cards.first().hover();
  const animated = await foreground.evaluate(async element => {
    const transitions = element.getAnimations();
    const properties = transitions.map(animation => (animation as CSSTransition).transitionProperty);
    await Promise.all(transitions.map(animation => animation.finished));
    return properties;
  });
  expect(animated).toContain('opacity');
  expect(animated).toContain('transform');
  await expect(foreground).toHaveCSS('opacity', '1');
  await page.mouse.move(5, 850);
  await expect(foreground).toHaveCSS('opacity', '0');
  // Include padding and the gap between cards, where the reported strip appeared.
  const first = (await cards.nth(8).boundingBox())!;
  const last = (await cards.nth(10).boundingBox())!;
  const row = { x: Math.floor(first.x), y: Math.floor(first.y - 5), width: Math.ceil(last.x + last.width - first.x), height: 38 };
  const right = (await cards.nth(7).boundingBox())!;
  const edge = { x: Math.floor(right.x - 5), y: Math.floor(right.y), width: 35, height: Math.ceil(right.height) };
  await page.waitForTimeout(200); // Let favicon opacity finish before pixel comparison.
  const baselineRow = await captureRegion(page, row);
  const baselineEdge = await captureRegion(page, edge);
  const geometry = await cards.evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()));
  await card.getByRole('button', { name: '编辑 Sample 6' }).hover();
  const hoverRow = await captureRegion(page, row);
  if (!hoverRow.equals(baselineRow)) {
    writeFileSync(screenshotPath('glass-boundary-row-before.png'), baselineRow);
    writeFileSync(screenshotPath('glass-boundary-row-hover.png'), hoverRow);
    await test.info().attach('remote-row-before', { body: baselineRow, contentType: 'image/png' });
    await test.info().attach('remote-row-hover', { body: hoverRow, contentType: 'image/png' });
  }
  expect(hoverRow.equals(baselineRow), 'Edit hover cannot repaint the next row').toBe(true);
  await page.getByRole('button', { name: '显示', exact: true }).click();
  expect((await captureRegion(page, row)).equals(baselineRow), 'Display menu cannot repaint the next row').toBe(true);
  await page.keyboard.press('Escape');
  const source = (await cards.nth(2).boundingBox())!;
  await page.mouse.move(source.x + 60, source.y + 70);
  await page.mouse.down();
  await page.mouse.move(source.x - 60, source.y + 85, { steps: 5 });
  await expect(page.getByTestId('site-card-drag-preview')).toBeVisible();
  for (const x of [240, 265, 290]) {
    await page.mouse.move(x, source.y + 90);
    const dragEdge = await captureRegion(page, edge);
    if (!dragEdge.equals(baselineEdge)) {
      writeFileSync(screenshotPath('glass-boundary-edge-before.png'), baselineEdge);
      writeFileSync(screenshotPath('glass-boundary-edge-drag.png'), dragEdge);
      await test.info().attach('remote-edge-drag-materials', { contentType: 'application/json', body: JSON.stringify(await cards.evaluateAll(elements => elements.map(element => ({
        id: element.getAttribute('data-site-dnd-id'), style: element.getAttribute('style'),
        box: element.getBoundingClientRect().toJSON(), filter: getComputedStyle(element).filter,
        backdrop: getComputedStyle(element).backdropFilter,
        ancestors: [...function* () { for (let parent = element.parentElement; parent; parent = parent.parentElement) yield parent; }()].filter(parent => getComputedStyle(parent).transform !== 'none').map(parent => ({ class: parent.className, style: parent.getAttribute('style'), transform: getComputedStyle(parent).transform })),
      }))), null, 2) });
    }
    expect(dragEdge.equals(baselineEdge), 'Left-side drag cannot repaint the distant right edge').toBe(true);
  }
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await cards.evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()))).toEqual(geometry);
});
