import { expect, test } from './fixtures';
import { prepareMaterialPage } from './wallpaper-fixture';

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

test('a nested scroller still updates its descendant material sampling', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop material update scope');
  await prepareMaterialPage(page);
  await page.evaluate(() => {
    const scroller = document.createElement('div');
    scroller.id = 'material-scroller';
    scroller.style.cssText = 'position:absolute;left:500px;top:400px;width:220px;height:180px;overflow:auto';
    const content = document.createElement('div');
    content.style.cssText = 'height:600px;padding-top:80px';
    const surface = document.createElement('div');
    surface.id = 'nested-material';
    surface.className = 'data-card';
    surface.style.cssText = 'width:120px;height:90px';
    content.append(surface); scroller.append(content);
    document.querySelector('.app-shell')!.append(scroller);
  });
  const surface = page.locator('#nested-material');
  await expect(surface).toHaveClass(/wallpaper-material-own/);
  const origin = () => surface.evaluate(element => {
    const id = getComputedStyle(element).filter.match(/#([^"')]+)/)![1];
    return Number(document.getElementById(id)!.querySelector('feImage[result="colored"]')!.getAttribute('y'));
  });
  const before = await origin();
  await page.locator('#material-scroller').evaluate(element => { element.scrollTop = 60; });
  await expect.poll(origin).toBeCloseTo(before + 60, 1);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
