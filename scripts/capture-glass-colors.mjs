import { describeGlassMaterial } from "./read-glass-material.mjs";
// Current preset checks. Frame intervals are local observations, not an FPS SLA.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium, expect } from "@playwright/test";

const version = JSON.parse(await readFile("public/manifest.json", "utf8")).version;
const output = resolve(`artifacts/releases/v${version}/screenshots`);
await mkdir(output, { recursive: true });
const inventory = JSON.parse(await readFile("artifacts/working/wallpaper-inventory.json", "utf8"));
const wallpaper = inventory[0];
const report = { version, browser: "", scene: { screenshotViewport: { width: 1440, height: 1000 }, benchmarkViewport: { width: 2560, height: 1440 }, cards: 117, wallpaper: { width: wallpaper.width, height: wallpaper.height } }, frames: [], colors: [], captures: [], errors: [] };
const presets = [
  "液态清透", "水晶棱镜", "柔光薄雾", "轻透无影",
];
const visualOnly = process.argv.includes("--visual-only");
async function run(context, url, extension) {
  const prefix = extension ? "extension" : "web";
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  await page.route("https://glass-check.example/wallpaper", route => route.fulfill({ path: wallpaper.path, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" } }));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  const read = () => page.evaluate(async extension => JSON.parse(extension ? (await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"] : localStorage.getItem("site-hub:v1")), extension);
  async function seed(state) {
    await page.evaluate(async ({ state, extension }) => {
      if (extension) await chrome.storage.local.set({ "site-hub:v1": JSON.stringify(state) });
      else localStorage.setItem("site-hub:v1", JSON.stringify(state));
    }, { state, extension });
    await page.reload();
    await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
    await page.waitForFunction(() => !document.documentElement.classList.contains("wallpaper-boot-pending"));
    await page.evaluate(() => document.fonts.ready);
  }
  async function capture(name) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Horizontal overflow");
    await page.screenshot({ path: join(output, `${prefix}-${name}.png`), animations: "disabled" });
    report.captures.push(`${prefix}-${name}`);
  }
  const state = await read();
  const first = state.sites[0];
  state.sites = Array.from({ length: 117 }, (_, index) => ({ ...first, id: `visual-${index}`, name: `收藏示例 ${index + 1}`, url: `https://sample.example/${index}`, order: index, globalOrder: index, clickCount: index, iconSource: "custom", customIconUrl: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#408ace"/></svg>') }));
  state.appearance = { ...state.appearance, theme: "dark", cardWidth: 160, cardHeight: 132, textColorMode: "theme", textColorHierarchy: "unified", iconColorMode: "text" };
  state.wallpaper = { ...state.wallpaper, source: "url", url: "https://glass-check.example/wallpaper", blur: 0, overlay: 0 };
  await seed(state);
  for (const name of presets) {
    await page.getByRole("button", { name: "打开设置" }).click();
    await page.getByRole("tab", { name: "壁纸", exact: true }).click();
    const disclosure = page.locator("details").filter({ has: page.locator("summary > span", { hasText: /^玻璃外观$/ }) });
    if (await disclosure.getAttribute("open") === null) await disclosure.locator(":scope > summary").click();
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    if (name === "水晶棱镜") {
      const boxes = await page.locator(".glass-preset").evaluateAll(elements => elements.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })));
      assert.equal(new Set(boxes.map(box => box.x)).size, 3);
      assert.equal(new Set(boxes.map(box => box.y)).size, 3);
      await page.locator(".glass-preset-grid").scrollIntoViewIfNeeded();
      await capture("presets-3x3");
    }
    await page.getByRole("button", { name: "保存设置" }).click();
    const current = await read();
    if (!visualOnly) await page.setViewportSize({ width: 2560, height: 1440 });
    await seed(current);
    await expect(page.locator(".site-card")).toHaveCount(117);
    const filter = await describeGlassMaterial(page.locator(".site-card").first());
    if (name === "水晶棱镜") assert.equal(filter, "none");
    for (let repeat = 0; repeat < (visualOnly ? 0 : 2); repeat++) {
      const intervals = await page.evaluate(() => new Promise(resolve => {
        const times = []; let started = 0, previous = 0;
        const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
        const frame = time => {
          if (!started) started = time;
          if (previous) times.push(time - previous);
          previous = time;
          const elapsed = time - started;
          window.scrollTo(0, max * (1 - Math.cos(elapsed / 2600 * Math.PI * 2)) / 2);
          if (elapsed < 2600) requestAnimationFrame(frame);
          else { window.scrollTo(0, 0); resolve(times); }
        };
        requestAnimationFrame(frame);
      }));
      const sorted = [...intervals].sort((a, b) => a - b);
      report.frames.push({ prefix, name, repeat, filter, count: intervals.length, averageMs: intervals.reduce((a, b) => a + b, 0) / intervals.length, p95Ms: sorted[Math.floor(sorted.length * .95)], over25ms: intervals.filter(ms => ms > 25).length });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await capture(`material-${presets.indexOf(name)}`);
    await seed(current);
  }
  for (const theme of ["light", "dark"]) {
    const sample = await read(); sample.appearance.theme = theme;
    await seed(sample);
    const expected = theme === "light" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)";
    for (const selector of [".site-name", ".site-domain", ".category-tab.active", ".topbar-history-button.active"]) {
      await expect(page.locator(selector).first()).toHaveCSS("color", expected);
      report.colors.push({ prefix, theme, selector, expected });
    }
    await capture(`page-${theme}`);
    await page.getByRole("button", { name: "打开设置" }).click();
    await page.getByRole("tab", { name: "字体调节" }).click();
    await page.locator("summary").filter({ hasText: "文字颜色" }).click();
    await capture(`colors-${theme}`);
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "管理分组", exact: true }).click();
    await capture(`manager-${theme}`);
    await page.getByRole("button", { name: "取消", exact: true }).click();
    if (extension) {
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 440, height: 600 });
      await popup.goto(new URL("popup.html", url).href);
      await expect(popup.locator(".popup-tabs button.active")).toHaveCSS("color", expected);
      await popup.screenshot({ path: join(output, `popup-colors-${theme}.png`) });
      report.captures.push(`popup-colors-${theme}`);
      await popup.close();
    }
  }
  const custom = await read();
  Object.assign(custom.appearance, { theme: "dark", textColorMode: "custom", textColor: "#bef8ed", textColorHierarchy: "unified", iconColorMode: "custom", iconColor: "#fcab12" });
  await seed(custom);
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("tab", { name: "字体调节" }).click();
  await page.locator("summary").filter({ hasText: "文字颜色" }).click();
  await page.getByRole("checkbox", { name: "图标跟随文字" }).scrollIntoViewIfNeeded();
  await expect(page.locator(".settings-tabs .active")).toHaveCSS("color", "rgb(190, 248, 237)");
  await expect(page.locator(".topbar-history-button.active svg")).toHaveCSS("color", "rgb(252, 171, 18)");
  await capture("colors-custom");
  if (extension) {
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 440, height: 600 });
    await popup.goto(new URL("popup.html", url).href);
    await expect(popup.locator(".popup-tabs button.active")).toHaveCSS("color", "rgb(190, 248, 237)");
    await expect(popup.locator(".popup-tabs button.active svg")).toHaveCSS("color", "rgb(252, 171, 18)");
    await popup.screenshot({ path: join(output, "popup-colors-custom.png") });
    report.captures.push("popup-colors-custom");
    await popup.close();
  }
  await page.close();
}
const browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
report.browser = browser.version();
try { await run(await browser.newContext({ viewport: { width: 1440, height: 1000 } }), process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4175", false); }
finally { await browser.close(); }
const extension = resolve("dist-extension");
const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mysimple-colors-")), {
  channel: "chromium", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await run(context, `chrome-extension://${new URL(worker.url()).host}/index.html`, true);
} finally { await context.close(); }
assert.deepEqual(report.errors, []);
await writeFile(join(output, "glass-colors-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ screenshots: report.captures.length, samples: report.frames.length, errors: report.errors }));
