// Dense desktop startup and workspace sampling, against a production preview.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const version = JSON.parse(await readFile('public/manifest.json', 'utf8')).version;
const label = process.env.CAPTURE_LABEL ?? 'current';
const output = resolve(process.env.CAPTURE_OUTPUT ?? `artifacts/working/startup-${label}`);
await mkdir(output, { recursive: true });
const extension = process.env.CAPTURE_EXTENSION === '1';
const profile = extension ? await mkdtemp(join(tmpdir(), 'mysimple-dense-startup-')) : undefined;
const options = { headless: true, viewport: { width: 1920, height: 1080 }, colorScheme: 'light',
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : { channel: 'chromium' }),
  args: [`--disable-extensions-except=${resolve('dist-extension')}`, `--load-extension=${resolve('dist-extension')}`] };
const browser = extension ? undefined : await chromium.launch({ channel: 'chrome' });
let context = extension ? await chromium.launchPersistentContext(profile, options)
  : await browser.newContext({ viewport: options.viewport, colorScheme: options.colorScheme });
let page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let base = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4174';
try {
  if (extension) {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    base = `chrome-extension://${new URL(worker.url()).host}/index.html`;
  }
  await page.goto(base);
  await expect(page.locator('.site-card').first()).toBeVisible();
  await page.evaluate(async extension => {
    const state = JSON.parse(extension ? (await chrome.storage.local.get('site-hub:v1'))['site-hub:v1'] : localStorage.getItem('site-hub:v1'));
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fbedf4'; ctx.fillRect(0, 0, 1920, 1080);
    ctx.fillStyle = '#e63b98';
    for (let x = 0; x < 1920; x += 55) { ctx.beginPath(); ctx.arc(x, 570 + Math.sin(x / 145) * 110, 19, 0, Math.PI * 2); ctx.fill(); }
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    await new Promise((resolve, reject) => {
      const r = indexedDB.open('site-hub-assets', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('wallpapers');
      r.onsuccess = () => { const db = r.result; const tx = db.transaction('wallpapers', 'readwrite'); tx.objectStore('wallpapers').put(blob, 'perf-wallpaper'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      r.onerror = () => reject(r.error);
    });
    const template = state.sites[0];
    const groups = state.groups.filter(g => !g.workspace || g.workspace === 'main');
    state.sites = Array.from({ length: 117 }, (_, i) => ({ ...template, id: `perf-${i}`, name: `收藏 ${i + 1}`, url: `https://figma.com/perf/${i}`, groupId: groups[i % groups.length].id, iconSource: 'brand', order: i, globalOrder: i }));
    state.wallpaper = { ...state.wallpaper, source: 'local', localAssetId: 'perf-wallpaper', overlay: 0, glassTransparency: 88, glassBlur: 8, glassRefraction: true };
    if (extension) await chrome.storage.local.set({ 'site-hub:v1': JSON.stringify(state) });
    else localStorage.setItem('site-hub:v1', JSON.stringify(state));
  }, extension);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('site-hub:wallpaper-startup:v1'))).toBe(true);
  if (extension) {
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
  }
  await page.addInitScript(() => {
    window.perfSamples = { frames: [], longTasks: [], maps: [] };
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) { const t = performance.now(); const result = toDataURL.apply(this, args); window.perfSamples.maps.push({ time: t, width: this.width, height: this.height, duration: performance.now() - t }); return result; };
    new PerformanceObserver(list => window.perfSamples.longTasks.push(...list.getEntries().map(e => ({ time: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true });
    window.sampleFrames = duration => new Promise(resolve => {
      const start = performance.now(), frames = [];
      const sample = () => {
        const card = document.querySelector('.site-card'), search = document.querySelector('.search-input'), tab = document.querySelector('.category-tab:not(.active)');
        const style = el => el ? { border: getComputedStyle(el).borderTopColor, color: getComputedStyle(el).color, fill: getComputedStyle(el).backgroundColor, filter: getComputedStyle(el).backdropFilter } : null;
        frames.push({ t: performance.now(), cards: document.querySelectorAll('.site-card').length, card: style(card), search: style(search), tab: style(tab), wide: style(document.querySelector('.github-home-entry')), wideMap: !!document.querySelector('#wallpaper-glass-lens-wide feImage'), preview: !!document.querySelector('#wallpaper-startup'), imageReady: !!document.querySelector('.wallpaper-layer img')?.complete });
        if (performance.now() - start < duration) requestAnimationFrame(sample); else resolve(frames);
      }; requestAnimationFrame(sample);
    });
    window.sampleFrames(1500).then(frames => { window.perfSamples.frames = frames; window.perfDone = true; });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (process.env.CPU_RATE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU_RATE) });
  const filmstrip = [];
  let frameNumber = 0;
  if (process.env.CAPTURE_FILMSTRIP === '1') {
    cdp.on('Page.screencastFrame', frame => {
      if (frameNumber < 24) filmstrip.push(writeFile(`${output}/frame-${String(frameNumber++).padStart(2, '0')}.png`, Buffer.from(frame.data, 'base64')));
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    });
    await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }
  await page.goto(base, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.perfDone);
  const startup = await page.evaluate(() => window.perfSamples);
  const metrics = (await cdp.send('Performance.getMetrics')).metrics;
  await page.screenshot({ path: `${output}/loaded.png` });
  const switches = [];
  for (const name of ['打开 GitHub 收藏', '打开历史记录', '打开 GitHub 收藏', '打开收藏主页']) {
    await page.evaluate(() => { window.switchFrames = window.sampleFrames(700); });
    await page.getByRole('button', { name, exact: true }).click();
    switches.push({ name, frames: await page.evaluate(() => window.switchFrames) });
  }
  const scroll = await page.evaluate(async () => {
    const samples = window.sampleFrames(1200);
    const start = performance.now();
    const move = () => { const elapsed = performance.now() - start; window.scrollTo(0, Math.sin(Math.min(1, elapsed / 1100) * Math.PI) * 650); if (elapsed < 1100) requestAnimationFrame(move); };
    requestAnimationFrame(move);
    return samples;
  });
  const all = await page.evaluate(() => window.perfSamples);
  if (process.env.CAPTURE_FILMSTRIP === '1') await cdp.send('Page.stopScreencast');
  await Promise.all(filmstrip);
  const result = { version, errors, startup, switches, scroll, maps: all.maps, longTasks: all.longTasks, metrics };
  await writeFile(`${output}/metrics.json`, JSON.stringify(result, null, 2));
  if (process.env.CAPTURE_ASSERT !== '0') {
    const visible = startup.frames.filter(frame => frame.card);
    assert.ok(visible.length > 5, 'A dense collection must actually be sampled');
    for (const frame of visible) {
      assert.equal(frame.cards, 117);
      assert.equal(frame.card.border, 'rgba(255, 255, 255, 0.45)', 'No dark outline in any startup frame');
      assert.equal(frame.search.border, 'rgba(255, 255, 255, 0.45)');
      assert.equal(frame.tab.border, 'rgba(255, 255, 255, 0.294)');
      assert.equal(frame.imageReady, true, 'Wallpaper stays decoded through the handoff');
      assert.equal(frame.card.fill, visible.at(-1).card.fill, 'No fill animation from an uninitialized material');
    }
    for (const { frames } of switches) {
      assert.ok(frames.length > 5);
      for (const frame of frames) {
        assert.equal(frame.imageReady, true);
        if (frame.card) assert.equal(frame.card.border, 'rgba(255, 255, 255, 0.45)');
        if (frame.wide) assert.equal(frame.wideMap, true, 'GitHub refraction is ready on entry');
      }
    }
    assert.deepEqual(errors, []);
  }
  const gaps = frames => frames.slice(1).map((f, i) => f.t - frames[i].t);
  console.log(JSON.stringify({ output, errors, firstCard: startup.frames.find(f => f.cards), startupMaxGap: Math.max(...gaps(startup.frames)), switchMaxGaps: switches.map(s => Math.max(...gaps(s.frames))), scrollMaxGap: Math.max(...gaps(scroll)), maps: all.maps, longTasks: all.longTasks }, null, 2));
} finally { await context.close(); await browser?.close(); }
