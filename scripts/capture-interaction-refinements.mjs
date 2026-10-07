import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const { version } = JSON.parse(await readFile('public/manifest.json', 'utf8'));
const output = resolve(`artifacts/releases/v${version}/screenshots`);
await mkdir(output, { recursive: true });
const report = { version, captures: [], frames: [], errors: [] };
const background = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g"><stop stop-color="#245b7c"/><stop offset="1" stop-color="#68c1cb"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><path d="M0 720Q700 80 1600 650" fill="none" stroke="#c7e2ce" stroke-width="200"/><circle cx="1100" cy="80" r="260" fill="#e2e8dc"/></svg>';
async function inspect(context, url, extension) {
  const prefix = extension ? 'extension' : 'web';
  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('https://interaction.example/bg.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: background }));
  await page.goto(url);
  await expect(page.getByRole('button', { name: '打开设置' })).toBeVisible();
  const original = await page.evaluate(async extension => JSON.parse(extension ? (await chrome.storage.local.get('site-hub:v1'))['site-hub:v1'] : localStorage.getItem('site-hub:v1')), extension);
  const capture = async name => {
    const file = `${prefix}-interaction-${name}.png`;
    await page.screenshot({ path: join(output, file), animations: 'allow' });
    report.captures.push(file);
  };
  for (const theme of ['light', 'dark']) for (const material of ['plain', 'glass', 'clear']) {
    const state = structuredClone(original);
    state.displayModeByWorkspace.main = 'grouped';
    state.appearance = { ...state.appearance, theme, textColorMode: 'theme', groupNavigationGap: 128 };
    state.wallpaper = { ...state.wallpaper, source: material === 'plain' ? 'none' : 'url', url: 'https://interaction.example/bg.svg', overlay: 0, glassHighlight: 80, glassBlur: material === 'clear' ? 0 : 8, glassSaturation: 100 };
    const source = state.sites.find(site => site.groupId === 'search');
    state.sites = [...Array.from({ length: 13 }, (_, i) => ({ ...source, id: `sample-${i}`, name: `示例网站 ${i + 1}`, url: `https://example.com/${i}`, order: i, globalOrder: i })), ...state.sites.filter(site => site.groupId !== 'search').map((site, i) => ({ ...site, globalOrder: i + 13 }))];
    await page.evaluate(async ({ state, extension }) => {
      if (extension) await chrome.storage.local.set({ 'site-hub:v1': JSON.stringify(state) });
      else localStorage.setItem('site-hub:v1', JSON.stringify(state));
    }, { state, extension });
    await page.reload();
    await expect(page.getByRole('navigation', { name: '分组定位' })).toBeVisible();
    if (material !== 'plain') await expect(page.locator('.app-shell')).toHaveClass(/has-wallpaper/);
    await page.evaluate(() => document.fonts.ready);
    const name = `${theme}-${material}`;
    await capture(`${name}-page`);
    const section = page.locator('[data-group-sort-section-id="search"]');
    const card = section.locator('.site-card').nth(8);
    const add = section.locator('.add-site-card');
    if (material !== 'plain') {
      const rect = await card.boundingBox();
      for (const [label, target] of [['card', card], ['add', add]]) {
        await target.hover();
        for (let frame = 0; frame < 4; frame++) {
          await page.evaluate(() => new Promise(requestAnimationFrame));
          assert.deepEqual(await card.boundingBox(), rect);
          assert.equal(await page.locator('.is-group-drag-over,.is-drop-target,.site-card-drop-placeholder,.is-dragging').count(), 0);
          report.frames.push({ prefix, theme, material, label, frame });
          await capture(`${name}-${label}-frame-${frame}`);
        }
      }
      await page.locator('.view-control-button').filter({ hasText: '排列' }).click();
      await page.getByRole('menuitemradio', { name: '热量排列' }).hover();
      await capture(`${name}-menu`);
      await page.keyboard.press('Escape');
    }
    await section.getByRole('button', { name: '多选 搜索 网站' }).click();
    await section.getByRole('button', { name: '选择 搜索 分组', exact: true }).click();
    await capture(`${name}-group-selected`);
    await section.getByRole('button', { name: '全选 搜索 网站', exact: true }).click();
    await capture(`${name}-links-selected`);
    await section.getByRole('button', { name: '取消 搜索 网站', exact: true }).click();
    await page.getByRole('button', { name: '打开设置' }).click();
    const panel = page.getByRole('dialog', { name: '设置', exact: true });
    await panel.getByRole('tab', { name: '壁纸', exact: true }).click();
    const controls = panel.locator('details').filter({ has: page.locator(':scope > summary', { hasText: '侧栏外观' }) });
    if (await controls.getAttribute('open') === null) await controls.locator(':scope > summary').click();
    await controls.getByRole('button', { name: '独立玻璃底板' }).click();
    await controls.getByRole('slider', { name: '侧栏透明度' }).fill('80');
    await controls.getByRole('slider', { name: '模糊强度' }).fill('10');
    await controls.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await capture(`${name}-sidebar`);
    await controls.getByRole('slider', { name: '侧栏透明度' }).fill('100');
    await controls.getByRole('slider', { name: '模糊强度' }).fill('0');
    await capture(`${name}-sidebar-clear`);
    await panel.getByRole('button', { name: '取消', exact: true }).click();
  }
  await page.close();
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
try { await inspect(await browser.newContext(), process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4192', false); }
finally { await browser.close(); }
const extension = resolve('dist-extension');
const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), 'mysimple-interaction-')), {
  channel: 'chromium', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await inspect(context, `chrome-extension://${new URL(worker.url()).host}/index.html`, true);
} finally { await context.close(); }
assert.deepEqual(report.errors, []);
await writeFile(join(output, 'interaction-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ screenshots: report.captures.length, frames: report.frames.length, errors: report.errors }));
