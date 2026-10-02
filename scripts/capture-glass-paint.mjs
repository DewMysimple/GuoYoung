import { withoutGlassRefraction } from "./read-glass-material.mjs";
// Run after both production builds against vite preview. Synthetic wallpaper and
// 117 links; compare the reported distant strips at three desktop pixel ratios.
import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { version } = JSON.parse(await readFile('public/manifest.json', 'utf8'));
const output = resolve(`artifacts/releases/v${version}/screenshots/glass-paint`);
await mkdir(output, { recursive: true });
const extension = resolve('dist-extension');
const report = [];
const bg = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><pattern id="p" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#194652"/><path d="M0 0H80V40H0Z" fill="#91afbb"/><path d="M0 0L80 80" stroke="#e6e3d7" stroke-width="12"/></pattern></defs><rect width="1920" height="1080" fill="url(#p)"/></svg>';
for (const scale of (process.env.CAPTURE_DPR ? [Number(process.env.CAPTURE_DPR)] : [1, 1.25, 1.5]))
    for (const native of [false, true]) {
        const browser = native ? null : await chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
        const context = native ? await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), 'mysimple-jump-')), { channel: 'chromium', headless: true, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale, ignoreDefaultArgs: ['--hide-scrollbars'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] }) : await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
        try {
            const worker = native ? (context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')) : null;
            const url = native ? `chrome-extension://${new URL(worker.url()).host}/index.html` : (process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4192');
            const page = await context.newPage();
            await page.route('https://jump.example/bg.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: bg }));
            await page.goto(url);
            await expect(page.getByRole('button', { name: '打开设置' })).toBeVisible();
            expect(await page.evaluate(async () => (await (await fetch('manifest.json')).json()).version)).toBe(version);
            const original = await page.evaluate(async (native) => JSON.parse(native ? (await chrome.storage.local.get('site-hub:v1'))['site-hub:v1'] : localStorage.getItem('site-hub:v1')), native);
            for (const blur of [0, 12, 30]) {
                const state = structuredClone(original);
                state.displayModeByWorkspace.main = 'grouped';
                state.sortModeByWorkspace.main = 'heat';
                state.appearance = { ...state.appearance, theme: 'dark', cardWidth: 190, cardHeight: 160, contentWidth: 1760 };
                state.wallpaper = { ...state.wallpaper, source: 'url', url: 'https://jump.example/bg.svg', overlay: 0, glassBlur: blur, glassSaturation: 130, glassRefraction: false };
                const seed = state.sites.find(x => x.groupId === 'search');
                state.sites = Array.from({ length: 117 }, (_, i) => ({ ...seed, id: `sample-${i}`, name: `Sample ${i}`, url: `https://example.com/${i}`, iconSource: 'custom', customIconUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#307abb"/><text x="17" y="46" fill="white" font-size="40">S</text></svg>'), groupId: i < 11 ? 'search' : state.groups[1 + Math.floor((i - 11) / 22)].id, order: i, globalOrder: i, clickCount: 117 - i }));
                await page.evaluate(async ({ state, native }) => { if (native)
                    await chrome.storage.local.set({ 'site-hub:v1': JSON.stringify(state) });
                else
                    localStorage.setItem('site-hub:v1', JSON.stringify(state)); }, { state, native });
                await page.reload();
                await expect(page.locator('.has-wallpaper')).toBeVisible();
                await page.evaluate(() => document.fonts.ready);
                await page.waitForTimeout(500);
                await page.evaluate(() => { window.scrollTo(0, document.querySelector('.collection-toolbar').getBoundingClientRect().top + window.scrollY - 95); });
                await page.mouse.move(5, 850);
                await page.waitForTimeout(500);
                const name = `${native ? 'extension' : 'web'}-dpr${scale}-blur${blur}`;
                const sample = { name, scale, blur, frames: [], errors: [], pixelFailures: [] };
                report.push(sample);
                page.on('pageerror', e => sample.errors.push(e.message));
                const geometry = () => page.locator('.site-card[data-site-dnd-id]').evaluateAll(es => es.map(e => ({ id: e.dataset.siteDndId, rect: e.getBoundingClientRect().toJSON(), transform: getComputedStyle(e).transform, filter: getComputedStyle(e, '::before').backdropFilter })));
                sample.baseGeometry = await geometry();
                sample.scrollY = await page.evaluate(() => scrollY);
                await expect(page.locator('.site-card').first()).toHaveCSS('backdrop-filter', 'none');
                await expect(page.locator('[data-group-sort-section-id="search"] .favicon-frame img.is-loaded')).toHaveCount(11);
                // Loaded images still fade for 160ms. Sample after their transitions,
                // including compositor demotion, so loading isn't counted as a drag repaint.
                await page.locator('[data-group-sort-section-id="search"] .favicon-frame img').evaluateAll(async images => {
                    await Promise.all(images.flatMap(image => image.getAnimations().map(animation => animation.finished.catch(() => {}))));
                });
                await page.waitForTimeout(200);
                const rects = sample.baseGeometry.map(x => x.rect);
                const row = { x: Math.floor(rects[8].x), y: Math.floor(rects[8].y - 5), width: Math.ceil(rects[10].right - rects[8].x), height: 38 };
                const edge = { x: Math.floor(rects[7].x - 5), y: Math.floor(rects[7].y), width: 35, height: Math.ceil(rects[7].height) };
                // Crop in memory after a full viewport capture. Fractional-DPR clip
                // screenshots can rerasterize SVG edges at another pixel phase.
                const baselinePixels = await page.screenshot();
                const comparePixels = async (baseline, current, label, region) => {
                    const difference = await page.evaluate(async ({ before, after, region, scale }) => {
                        async function decode(value) {
                            const image = new Image();
                            image.src = `data:image/png;base64,${value}`;
                            await image.decode();
                            const canvas = document.createElement('canvas');
                            canvas.width = image.width; canvas.height = image.height;
                            const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
                            return ctx.getImageData(Math.floor(region.x * scale), Math.floor(region.y * scale), Math.ceil(region.width * scale), Math.ceil(region.height * scale)).data;
                        }
                        const a = await decode(before), b = await decode(after);
                        if (a.length !== b.length) return { channels: -1, maxDelta: 255, ratio: 1 };
                        let channels = 0, maxDelta = 0;
                        for (let i = 0; i < a.length; i++) {
                            const delta = Math.abs(a[i] - b[i]);
                            if (delta) channels++;
                            maxDelta = Math.max(maxDelta, delta);
                        }
                        return { channels, maxDelta, ratio: channels / a.length };
                    }, { before: baseline.toString('base64'), after: current.toString('base64'), region, scale });
                    if (difference.channels !== 0) {
                        await writeFile(join(output, `${name}-${label}-before.png`), baseline);
                        await writeFile(join(output, `${name}-${label}-after.png`), current);
                    }
                    sample.pixelChecks ??= [];
                    sample.pixelChecks.push({ label, ...difference });
                    if (difference.channels !== 0) sample.pixelFailures.push({ label, ...difference });
                };
                const capture = async (label) => {
                    const path = `${name}-${label}.png`;
                    const framePixels = await page.screenshot({ path: join(output, path) });
                    const current = await geometry();
                    expect(current.map(x => x.rect)).toEqual(sample.baseGeometry.map(x => x.rect));
                    let compared = false;
                    if (label.startsWith('edit') || label.startsWith('menu')) {
                        await comparePixels(baselinePixels, framePixels, `${label}-row`, row);
                        compared = true;
                    }
                    if (label.startsWith('drag')) {
                        await comparePixels(baselinePixels, framePixels, `${label}-edge`, edge);
                        compared = true;
                    }
                    sample.frames.push({ path, label, pixelsCompared: compared, geometryStable: true, scrollY: await page.evaluate(() => scrollY) });
                };
                await capture('base');
                const editor = page.locator('.site-card').nth(6).getByRole('button', { name: /编辑/ });
                const eb = await editor.boundingBox();
                await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
                for (let i = 0; i < 4; i++) {
                    await capture(`edit-${i}`);
                }
                await page.mouse.move(5, 850);
                await page.waitForTimeout(250);
                await capture('reset');
                const button = page.locator('.view-control-button').filter({ hasText: '显示' });
                const bb = await button.boundingBox();
                await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
                for (let i = 0; i < 4; i++)
                    await capture(`menu-${i}`);
                await page.keyboard.press('Escape');
                await page.mouse.move(5, 850);
                await page.waitForTimeout(250);
                const source = page.locator('.site-card').nth(2);
                const r = await source.boundingBox();
                await page.mouse.move(r.x + 65, r.y + 80);
                await page.mouse.down();
                await page.mouse.move(r.x - 70, r.y + 90, { steps: 5 });
                await expect(page.getByTestId('site-card-drag-preview')).toBeVisible();
                await page.waitForTimeout(300);
                await capture('drag-base');
                for (let i = 0; i < 8; i++) {
                    await page.mouse.move(240 + i * 12, r.y + 100 + i % 2 * 5);
                    await capture(`drag-${i}`);
                }
                await page.keyboard.press('Escape');
                await page.mouse.up();
                await page.waitForTimeout(300);
                await capture('end');
                if (scale === 1 && blur === 12) {
                    state.wallpaper.glassRefraction = true;
                    // Low frost preserves the high-contrast rim needed to measure displacement.
                    // The ordinary-glass matrix above still exercises all three blur strengths.
                    state.wallpaper.glassBlur = 2;
                    await page.evaluate(async ({ state, native }) => { if (native)
                        await chrome.storage.local.set({ 'site-hub:v1': JSON.stringify(state) });
                    else
                        localStorage.setItem('site-hub:v1', JSON.stringify(state)); }, { state, native });
                    await page.reload();
                    await expect(page.locator('.glass-refraction')).toBeVisible();
                    await page.evaluate(() => document.fonts.ready);
                    await page.waitForTimeout(500);
                    const opticalCard = page.locator('.site-card').nth(3);
                    sample.opticalCaptures = [`${name}-refraction-on.png`, `${name}-refraction-off.png`];
                    const refracted = await opticalCard.screenshot({ path: join(output, `${name}-refraction-on.png`) });
                    const ordinary = await withoutGlassRefraction(page, () => opticalCard.screenshot({ path: join(output, `${name}-refraction-off.png`) }));
                    sample.optics = await page.evaluate(async ({ on, off }) => {
                        async function read(value) { const image = new Image(); image.src = `data:image/png;base64,${value}`; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height); }
                        const a = await read(on), b = await read(off);
                        let rim = 0, center = 0;
                        for (let y = 0; y < a.height; y++)
                            for (let x = 0; x < a.width; x++) {
                                const i = (y * a.width + x) * 4;
                                if (Math.max(...[0, 1, 2].map(c => Math.abs(a.data[i + c] - b.data[i + c]))) <= 8)
                                    continue;
                                if (Math.min(x, y, a.width - 1 - x, a.height - 1 - y) < 20)
                                    rim++;
                                else
                                    center++;
                            }
                        return { rim, center };
                    }, { on: refracted.toString('base64'), off: ordinary.toString('base64') });
                    expect(sample.optics.rim).toBeGreaterThan(50);
                    expect(sample.optics.center).toBe(0);
                }
                console.log(name, sample.frames.length);
            }
        }
        finally {
            await context.close();
            await browser?.close();
        }
    }
await writeFile(join(output, 'report.json'), JSON.stringify({ version, runs: report }, null, 2));
console.log(JSON.stringify({ scenarios: report.length, screenshots: report.reduce((n, r) => n + r.frames.length + (r.opticalCaptures?.length ?? 0), 0), pixelComparisons: report.reduce((n, r) => n + r.frames.filter(f => f.pixelsCompared).length, 0) }));

expect(report.flatMap(r => r.errors)).toEqual([]);
expect(report.flatMap(r => r.pixelFailures), 'Distant pixel changes (full evidence saved in report.json)').toEqual([]);
