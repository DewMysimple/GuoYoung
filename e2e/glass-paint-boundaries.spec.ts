import { expect, test } from './fixtures';

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
    state.wallpaper = { ...state.wallpaper, source: 'url', url: 'https://paint.example/wallpaper.svg', overlay: 0, glassBlur: 12, glassSaturation: 130, glassRefraction: false };
    const seed = state.sites.find((site: { groupId: string }) => site.groupId === 'search');
    state.sites = Array.from({ length: 117 }, (_, i) => ({ ...seed, id: `paint-${i}`, name: `Sample ${i}`, url: `https://example.com/${i}`, iconSource: 'custom',
      customIconUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#307abb"/></svg>'),
      groupId: i < 11 ? 'search' : state.groups[1 + Math.floor((i - 11) / 22)].id, order: i, globalOrder: i, clickCount: 117 - i }));
    localStorage.setItem('site-hub:v1', JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveClass(/has-wallpaper/);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-group-sort-section-id="search"] .favicon-frame img.is-loaded')).toHaveCount(11);
  await page.mouse.move(5, 850);
  const cards = page.locator('.site-card[data-site-dnd-id]');
  const card = cards.nth(6);
  for (const surface of [card, page.locator('.add-site-card').first()]) {
    await expect(surface).toHaveCSS('backdrop-filter', 'none');
    expect(await surface.evaluate(el => {
      const paint = getComputedStyle(el, '::before');
      return { filter: paint.backdropFilter, pointer: paint.pointerEvents, width: parseFloat(paint.width), height: parseFloat(paint.height), clientWidth: el.clientWidth, clientHeight: el.clientHeight };
    })).toMatchObject({ filter: 'blur(12px) saturate(1.3)', pointer: 'none' });
    const bounded = await surface.evaluate(el => {
      const paint = getComputedStyle(el, '::before');
      return Math.abs(parseFloat(paint.width) - el.clientWidth) < 1 && Math.abs(parseFloat(paint.height) - el.clientHeight) < 1;
    });
    expect(bounded, 'Paint is bounded by the card, including the add card').toBe(true);
  }
  // Include padding and the gap between cards, where the reported strip appeared.
  const first = (await cards.nth(8).boundingBox())!;
  const last = (await cards.nth(10).boundingBox())!;
  const row = { x: Math.floor(first.x), y: Math.floor(first.y - 5), width: Math.ceil(last.x + last.width - first.x), height: 38 };
  const right = (await cards.nth(7).boundingBox())!;
  const edge = { x: Math.floor(right.x - 5), y: Math.floor(right.y), width: 35, height: Math.ceil(right.height) };
  await page.waitForTimeout(200); // Let favicon opacity finish before pixel comparison.
  const baselineRow = await page.screenshot({ clip: row });
  const baselineEdge = await page.screenshot({ clip: edge });
  const geometry = await cards.evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()));
  await card.getByRole('button', { name: '编辑 Sample 6' }).hover();
  expect((await page.screenshot({ clip: row })).equals(baselineRow), 'Edit hover cannot repaint the next row').toBe(true);
  await page.getByRole('button', { name: '显示', exact: true }).click();
  expect((await page.screenshot({ clip: row })).equals(baselineRow), 'Display menu cannot repaint the next row').toBe(true);
  await page.keyboard.press('Escape');
  const source = (await cards.nth(2).boundingBox())!;
  await page.mouse.move(source.x + 60, source.y + 70);
  await page.mouse.down();
  await page.mouse.move(source.x - 60, source.y + 85, { steps: 5 });
  await expect(page.getByTestId('site-card-drag-preview')).toBeVisible();
  for (const x of [240, 265, 290]) {
    await page.mouse.move(x, source.y + 90);
    expect((await page.screenshot({ clip: edge })).equals(baselineEdge), 'Left-side drag cannot repaint the distant right edge').toBe(true);
  }
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await cards.evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()))).toEqual(geometry);
});
