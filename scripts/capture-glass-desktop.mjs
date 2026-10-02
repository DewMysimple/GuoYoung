// Windows desktop capture: page.screenshot / CDP screencast can hide the
// partial-repaint defect. Do not perform browser readbacks during recording.
// Requires ffmpeg on PATH. Private input files stay outside the repository.
// CAPTURE_STATE=<export.json> CAPTURE_WALLPAPER=<image> [CAPTURE_BASE_URL]
// CAPTURE_EXTENSION=1 uses an isolated unpacked-extension profile.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.platform !== 'win32' || !process.env.CAPTURE_STATE || !process.env.CAPTURE_WALLPAPER) {
  throw new Error('Windows, ffmpeg, CAPTURE_STATE and CAPTURE_WALLPAPER are required.');
}
const { version } = JSON.parse(await readFile('public/manifest.json', 'utf8'));
const native = process.env.CAPTURE_EXTENSION === '1';
const diagnosticArgs = process.env.CAPTURE_SOFTWARE === '1' ? ['--disable-gpu'] : [];
const output = resolve(process.env.CAPTURE_OUTPUT ?? `artifacts/releases/v${version}/recordings/glass-desktop-${native ? 'extension' : 'web'}`);
await mkdir(output, { recursive: true });
const state = JSON.parse(await readFile(process.env.CAPTURE_STATE, 'utf8')).state;
const wallpaper = await readFile(process.env.CAPTURE_WALLPAPER);
const wallpaperURL = 'https://glass-diagnostic.invalid/wallpaper.png';
state.wallpaper = { ...state.wallpaper, source: 'url', url: wallpaperURL };
const extension = resolve('dist-extension');
const options = { headless: false, viewport: { width: 1920, height: 926 }, deviceScaleFactor: 1,
  ignoreDefaultArgs: ['--hide-scrollbars'] };
const browser = native ? null : await chromium.launch({ channel: 'msedge', headless: false, ignoreDefaultArgs: options.ignoreDefaultArgs, args: diagnosticArgs });
const context = native
  ? await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), 'mysimple-glass-')), {
    ...options, channel: 'chromium', args: [...diagnosticArgs, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  }) : await browser.newContext(options);
let recorder;
let guard;
try {
  const worker = native ? (context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')) : null;
  const url = native ? `chrome-extension://${new URL(worker.url()).host}/index.html`
    : process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4173';
  const page = await context.newPage();
  await page.route(wallpaperURL, route => route.fulfill({ contentType: 'image/png', body: wallpaper }));
  await page.goto(url);
  await expect(page.getByRole('button', { name: '打开设置' })).toBeVisible();
  await page.evaluate(async ({ state, native }) => {
    if (native) await chrome.storage.local.set({ 'site-hub:v1': JSON.stringify(state) });
    else localStorage.setItem('site-hub:v1', JSON.stringify(state));
  }, { state, native });
  await page.reload();
  await expect(page.locator('.has-wallpaper')).toBeVisible();
  if (process.env.CAPTURE_CSS_FILE) {
    await page.addStyleTag({ content: await readFile(process.env.CAPTURE_CSS_FILE, 'utf8') });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.wallpaper-layer img').evaluate(image => image.decode());
  await page.waitForTimeout(3500);
  if (process.env.CAPTURE_SCROLL_Y) {
    await page.evaluate(y => window.scrollTo(0, y), Number(process.env.CAPTURE_SCROLL_Y));
    await page.waitForTimeout(500);
  }
  const session = await context.newCDPSession(page);
  const { windowId } = await session.send('Browser.getWindowForTarget');
  await session.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, windowState: 'normal' } });
  await page.evaluate(() => { document.title = 'Mysimple glass desktop diagnostic'; });
  await page.bringToFront();
  await page.mouse.move(10, 850);
  await page.waitForTimeout(500);
  const rects = selector => page.locator(selector).evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
  const cards = (await rects('.site-card[data-site-dnd-id]')).filter(rect => rect.y >= 0 && rect.bottom <= 926);
  const nav = await rects('.group-section-nav li button');
  if (cards.length < 8 || !nav.length) throw new Error('The fixture needs grouped desktop cards and navigation.');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.screenshot({ path: join(output, 'before.png') });
  // The viewport origin in the desktop recording can be aligned with before.png.
  const windowGeometry = await page.evaluate(() => ({ screenX, screenY, innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio }));
  const events = [];
  let log = '';
  let foregroundLost = false;
  guard = spawn('python', ['scripts/guard-glass-desktop.py', join(output, 'guard-window.json')], { windowsHide: true });
  let guardError = '';
  guard.stderr.on('data', data => { guardError += data; });
  guard.on('exit', () => { foregroundLost = true; });
  await new Promise((resolve, reject) => {
    guard.once('error', reject);
    guard.stdout.once('data', data => data.toString().trim() === 'ready' ? resolve() : reject(new Error('Unexpected foreground guard response')));
    guard.once('exit', () => reject(new Error(guardError || 'Foreground guard stopped')));
  });
  // Some Chromium builds expose a render-widget HWND at the window origin,
  // excluding the toolbar offset. Calibrate native input against DOM events.
  await page.evaluate(() => {
    window.__glassCalibration = null;
    document.addEventListener('pointermove', event => {
      window.__glassCalibration = { x: event.clientX, y: event.clientY };
    }, { once: true });
  });
  guard.stdin.write(JSON.stringify({ x: 400, y: 700 }) + '\n');
  await expect.poll(() => page.evaluate(() => window.__glassCalibration)).not.toBeNull();
  const actual = await page.evaluate(() => window.__glassCalibration);
  const pointerCalibration = { x: 400 - actual.x, y: 700 - actual.y };
  const movePointer = (x, y) => guard.stdin.write(JSON.stringify({ x: x + pointerCalibration.x, y: y + pointerCalibration.y }) + '\n');
  await page.evaluate(() => {
    window.__glassCalibration = null;
    document.addEventListener('pointermove', event => {
      window.__glassCalibration = { x: event.clientX, y: event.clientY };
    }, { once: true });
  });
  movePointer(500, 700);
  await expect.poll(() => page.evaluate(() => window.__glassCalibration)).toEqual({ x: 500, y: 700 });
  movePointer(10, 850);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__glassPointerEvents = [];
    document.addEventListener('pointermove', event => window.__glassPointerEvents.push({
      time: Date.now(), x: event.clientX, y: event.clientY,
    }));
  });
  await page.screenshot({ path: join(output, 'before.png') });
  const captureInput = process.env.CAPTURE_DDA === '1'
    ? ['-use_wallclock_as_timestamps', '1', '-f', 'lavfi', '-i', 'ddagrab=framerate=60:draw_mouse=0:video_size=1920x1006,hwdownload,format=bgra']
    : ['-f', 'gdigrab', '-framerate', '60', '-draw_mouse', '0', '-offset_x', '0', '-offset_y', '0', '-video_size', '1920x1006', '-i', 'desktop'];
  const recordingStarted = Date.now();
  recorder = spawn('ffmpeg', ['-y', ...captureInput,
    '-c:v', 'ffv1', join(output, 'desktop.mkv')], { windowsHide: true });
  const finished = new Promise((resolve, reject) => {
    recorder.once('error', reject);
    recorder.once('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
  // Attach a handler immediately, while pointer traversal runs.
  finished.catch(() => {});
  recorder.stderr.on('data', data => { log += data; });
  await page.waitForTimeout(1200);
  for (let i = 0; i < 180; i++) {
    if (foregroundLost) throw new Error(guardError || 'Recording invalid: the diagnostic window lost foreground');
    const rect = i % 3 === 0 ? nav[i % nav.length] : cards[i % 4];
    const x = rect.x + rect.width * .65, y = rect.y + rect.height * .55;
    events.push({ time: Date.now(), x, y });
    movePointer(x, y);
    await page.waitForTimeout(i < 60 ? 20 : i < 120 ? 50 : 100);
  }
  movePointer(10, 850);
  await page.waitForTimeout(600);
  recorder.stdin.write('q');
  await finished;
  recorder = null;
  if (foregroundLost) throw new Error(guardError || 'Recording invalid: the diagnostic window lost foreground');
  await writeFile(join(output, 'ffmpeg.log'), log);
  await writeFile(join(output, 'report.json'), JSON.stringify({ version, native,
    browserVersion: context.browser()?.version(), software: diagnosticArgs.length > 0,
    captureBackend: process.env.CAPTURE_DDA === '1' ? 'ddagrab' : 'gdigrab', recordingStarted,
    windowGeometry, pointerCalibration, cards, events,
    observedPointerEvents: await page.evaluate(() => window.__glassPointerEvents), errors }, null, 2));
  await page.screenshot({ path: join(output, 'after.png') });
  if (errors.length) throw new Error(`${errors.length} page errors; see report.json`);
  console.log(`Desktop recording saved to ${output}`);
} finally {
  guard?.kill();
  if (recorder) recorder.kill();
  await context.close();
  await browser?.close();
}
