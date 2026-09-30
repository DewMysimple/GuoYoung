import { test, expect, screenshotPath } from './fixtures';

async function grouped(page: import('@playwright/test').Page, wallpaper = false) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('https://interaction.example/bg.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000"><rect width="1440" height="1000" fill="#367b9b"/><circle cx="900" cy="500" r="400" fill="#b5d3c7"/></svg>' }));
  await page.evaluate(wallpaper => {
    const state = JSON.parse(localStorage.getItem('site-hub:v1')!);
    state.displayModeByWorkspace.main = 'grouped';
    if (wallpaper) state.wallpaper = { ...state.wallpaper, source: 'url', url: 'https://interaction.example/bg.svg', overlay: 0 };
    localStorage.setItem('site-hub:v1', JSON.stringify(state));
  }, wallpaper);
  await page.reload();
  await expect(page.getByRole('button', { name: '多选 搜索 网站' })).toBeVisible();
  if (wallpaper) await expect(page.locator('.app-shell')).toHaveClass(/has-wallpaper/);
}

test('group selection offers separate cancel, group and group-links actions', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop selection acceptance');
  await grouped(page);
  const section = page.locator('[data-group-sort-section-id="search"]');
  await section.getByRole('button', { name: '多选 搜索 网站' }).click();
  await expect(section.getByRole('button', { name: '取消 搜索 网站' })).toHaveText('取消');
  await expect(section.locator('.grouped-site-actions button')).toHaveCount(3);
  await section.getByRole('button', { name: '选择 搜索 分组', exact: true }).click();
  await expect(section).toHaveClass(/is-group-selected/);
  await section.getByRole('button', { name: '全选 搜索 网站', exact: true }).click();
  await expect(section).not.toHaveClass(/is-group-selected/);
  await expect(page.getByTestId('site-card-google')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('site-card-bing')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('site-card-figma')).not.toHaveClass(/is-selected/);
  await page.screenshot({ path: screenshotPath('group-selection-three-actions.png') });
  await section.getByRole('button', { name: '取消 搜索 网站', exact: true }).click();
  await expect(page.locator('.site-card.is-selected')).toHaveCount(0);
  await section.getByRole('button', { name: '多选 搜索 网站' }).click();
  await page.getByTestId('site-card-google').click();
  await expect(section.getByRole('button', { name: '取消 搜索 网站' })).toBeVisible();
  await page.locator('.collection-heading h2').click();
  await expect(section.getByRole('button', { name: '多选 搜索 网站' })).toBeVisible();
  await expect(page.locator('.site-card.is-selected')).toHaveCount(0);
});

test('topbar bottom edge resizes from both sides and persists', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop edge resize');
  const handle = page.getByRole('separator', { name: '调整顶栏高度' });
  for (const fraction of [0.1, 0.9]) {
    const before = Number(await handle.getAttribute('aria-valuenow'));
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    await expect(handle.locator('span')).toHaveCSS('width', '96px');
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2 + 8);
    await page.mouse.up();
    await expect(handle).toHaveAttribute('aria-valuenow', String(before + 8));
    await page.reload();
    await expect(handle).toHaveAttribute('aria-valuenow', String(before + 8));
  }
});

test('sidebar material previews, cancels and saves independently of shared and topbar glass', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop sidebar material');
  await grouped(page, true);
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('site-hub:v1')!).wallpaper);
  const panel = page.getByRole('dialog', { name: '设置', exact: true });
  async function open() {
    await page.getByRole('button', { name: '打开设置' }).click();
    await panel.getByRole('tab', { name: '壁纸' }).click();
    const disclosure = panel.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^设置侧栏外观/ }) });
    if (await disclosure.getAttribute('open') === null) await disclosure.locator('summary').click();
    return disclosure;
  }
  let controls = await open();
  await controls.getByRole('button', { name: '独立玻璃底板', exact: true }).click();
  await controls.getByRole('slider', { name: '侧栏透明度' }).fill('88');
  await controls.getByRole('slider', { name: '模糊强度' }).fill('7');
  await expect(panel).toHaveCSS('backdrop-filter', 'blur(7px) saturate(1.3)');
  await expect.poll(() => panel.evaluate(el => getComputedStyle(el).backgroundColor)).toContain('0.12');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('site-hub:v1')!).wallpaper)).toEqual(original);
  await panel.getByRole('button', { name: '取消', exact: true }).click();
  controls = await open();
  await expect(controls.getByRole('button', { name: '跟随公共玻璃' })).toHaveAttribute('aria-pressed', 'true');
  await controls.getByRole('button', { name: '融入壁纸', exact: true }).click();
  await expect(panel).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(panel).toHaveCSS('backdrop-filter', 'none');
  await controls.getByRole('button', { name: '独立玻璃底板', exact: true }).click();
  await controls.getByRole('slider', { name: '侧栏透明度' }).fill('80');
  await controls.getByRole('checkbox', { name: '模糊壁纸', exact: true }).uncheck();
  await expect(panel).toHaveCSS('backdrop-filter', 'none');
  await page.screenshot({ path: screenshotPath('sidebar-independent-glass.png') });
  await panel.getByRole('button', { name: '保存设置' }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('site-hub:v1')!).wallpaper);
  expect(saved).toEqual({ ...original, sidebarStyle: 'glass', sidebarTransparency: 80, sidebarBlurEnabled: false });
});

test('hover and menus preserve glass texture and never activate dashed drag surfaces', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop glass frame regression');
  await grouped(page, true);
  const card = page.getByTestId('site-card-google');
  const add = page.locator('.add-site-card').first();
  const texture = await card.evaluate(el => getComputedStyle(el).backgroundImage);
  const box = await card.boundingBox();
  for (const target of [card, add, page.getByRole('button', { name: '多选 搜索 网站' })]) {
    await target.hover();
    for (let frame = 0; frame < 8; frame++) {
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await expect(page.locator('.is-group-drag-over,.is-drop-target,.site-card-drop-placeholder,.is-dragging')).toHaveCount(0);
      expect(await card.boundingBox()).toEqual(box);
      await expect(card).toHaveCSS('background-image', texture);
      await expect(add).toHaveCSS('border-top-style', 'solid');
    }
  }
  await page.getByRole('button', { name: '多选 搜索 网站' }).click();
  await card.click();
  const selectedBox = await card.boundingBox();
  await card.hover();
  await expect(card).toHaveCSS('transform', 'none');
  expect(await card.boundingBox()).toEqual(selectedBox);
  await page.getByRole('button', { name: '取消 搜索 网站' }).click();
  const icon = add.locator('.add-site-card-icon');
  await expect(icon).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(icon).toHaveCSS('background-image', /linear-gradient/);
  await page.locator('.view-control-button').filter({ hasText: '排列' }).click();
  await page.getByRole('menuitemradio', { name: '热量排列' }).hover();
  await expect(page.locator('.is-group-drag-over,.is-drop-target,.site-card-drop-placeholder')).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('hover-menu-stable-glass.png') });
});
