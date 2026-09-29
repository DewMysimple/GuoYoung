import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const { version } = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${version}/screenshots`);
await mkdir(output, { recursive: true });
const errors = [], captures = [], measurements = [];
const wallpaper = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="#c3e2e6"/><stop offset=".5" stop-color="#247d9e"/><stop offset="1" stop-color="#152847"/></linearGradient></defs><path fill="url(#a)" d="M0 0h1920v1080H0z"/><g fill="none" stroke="#e8f4f2" stroke-opacity=".4" stroke-width="3"><path d="M0 380Q400 0 1000 450T1920 300M0 500Q600 180 1000 500T1920 650M0 900Q650 250 1300 800T1920 600"/></g></svg>';

async function inspect(context, url, extension, prefix) {
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://nav-wallpaper.example/background.svg", route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  const seed = async (theme, wallpaperEnabled, count = 10, fontScale = 100) => {
    await page.evaluate(async ({ extension, theme, wallpaperEnabled, count, fontScale }) => {
      const key = "site-hub:v1";
      const state = JSON.parse(extension ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key));
      const stamp = "2026-01-01T00:00:00.000Z";
      const names = ["网站审美", "UI 动效库", "设计灵感与交互参考资料收藏", "专业工具", "影音", "AI", "搜索", "阅读收藏", "效率办公", "素材资源"];
      const icons = ["star", "database", "palette", "lightning", "play", "robot", "magnifying-glass", "book-open", "briefcase", "folder"];
      state.groups = state.groups.filter(group => group.workspace === "github" || group.isProtected);
      state.groups.find(group => group.id === "other").order = count;
      state.sites = [];
      for (let i = 0; i < count; i++) {
        state.groups.push({ id: `nav-${i}`, name: names[i % names.length] + (i >= 10 ? ` ${i + 1}` : ""),
          icon: icons[i % icons.length], workspace: "main", isProtected: false, order: i, createdAt: stamp, updatedAt: stamp });
        for (let j = 0; j < (i === count - 1 ? 0 : 12); j++) state.sites.push({
          id: `site-${i}-${j}`, name: `${names[i % names.length]} · 示例 ${j + 1}`, url: `https://example.com/${i}/${j}`,
          groupId: `nav-${i}`, iconSource: "custom", customIconUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="#397a9b"/><path fill="white" d="m16 32 16-16 16 16-16 16z"/></svg>')}`,
          order: j, globalOrder: i * 12 + j, clickCount: j, createdAt: stamp, updatedAt: stamp,
        });
      }
      state.displayModeByWorkspace.main = "grouped";
      state.appearance = { ...state.appearance, theme, fontScale };
      state.wallpaper = { ...state.wallpaper, source: wallpaperEnabled ? "url" : "none", url: "https://nav-wallpaper.example/background.svg", overlay: 0 };
      if (extension) await chrome.storage.local.set({ [key]: JSON.stringify(state) });
      else localStorage.setItem(key, JSON.stringify(state));
    }, { extension, theme, wallpaperEnabled, count, fontScale });
    await page.reload();
    await expect(page.getByRole("navigation", { name: "分组定位" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (wallpaperEnabled) await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
    // Reload may restore the preceding case's scroll position.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.locator('.group-section-nav [aria-current="location"]')).toHaveText("网站审美");
  };
  async function capture(name) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(100);
    const metrics = await page.evaluate(() => {
      const nav = document.querySelector(".group-section-nav").getBoundingClientRect();
      const main = document.querySelector(".grouped-site-sections").getBoundingClientRect();
      const panel = getComputedStyle(document.querySelector(".group-section-nav-panel"));
      return { gap: main.left - nav.right, x: nav.x, bottom: nav.bottom, height: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth, filter: panel.backdropFilter,
        active: document.querySelector('.group-section-nav [aria-current="location"]')?.textContent };
    });
    assert(metrics.gap >= 12, `${name}: navigation covers content ${JSON.stringify(metrics)}`);
    assert(metrics.x >= 0 && metrics.bottom <= metrics.height, `${name}: viewport bounds`);
    assert.equal(metrics.overflow, false, `${name}: horizontal overflow`);
    measurements.push({ name, ...metrics });
    await page.screenshot({ path: join(output, `${prefix}-${name}.png`), animations: "disabled" });
    captures.push(`${prefix}-${name}`);
  }
  for (const theme of ["light", "dark"]) {
    for (const withWallpaper of [false, true]) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await seed(theme, withWallpaper);
      await capture(`${theme}-${withWallpaper ? "wallpaper" : "plain"}-top`);
      await page.getByRole("button", { name: "定位到 专业工具", exact: true }).click();
      await expect(page.locator('.group-section-nav [aria-current="location"]')).toHaveText("专业工具");
      await expect.poll(() => page.locator('[data-group-sort-section-id="nav-3"]').evaluate(node => Math.abs(node.getBoundingClientRect().top - 88))).toBeLessThan(2);
      await capture(`${theme}-${withWallpaper ? "wallpaper" : "plain"}-middle`);
    }
  }
  for (const width of [900, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await seed("light", true, 24, 130);
    await page.getByRole("button", { name: "定位到 素材资源 20", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('.group-section-nav [aria-current="location"]')).toHaveText("素材资源 20");
    await expect.poll(() => page.locator('[data-group-sort-section-id="nav-19"]').evaluate(node =>
      Math.abs(node.getBoundingClientRect().top - document.querySelector(".topbar").getBoundingClientRect().bottom - 24)
    )).toBeLessThan(2);
    await capture(`many-${width}`);
    await page.getByRole("button", { name: "打开设置" }).click();
    await expect(page.getByRole("button", { name: "关闭设置" })).toBeVisible();
    await page.waitForTimeout(300);
    await capture(`settings-${width}`);
    await page.getByRole("button", { name: "关闭设置" }).click();
  }
  await page.close();
}
const browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
try { await inspect(await browser.newContext(), process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4188", false, "web-nav"); }
finally { await browser.close(); }
// Optional development preview; delivery runs always include the real extension.
if (!process.argv.includes("--web-only")) {
  const extension = resolve("dist-extension");
  const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mysimple-nav-")), {
    channel: "chromium", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await inspect(context, `chrome-extension://${new URL(worker.url()).host}/index.html`, true, "extension-nav");
  } finally { await context.close(); }
}
assert.deepEqual(errors, []);
await writeFile(join(output, "group-navigation-report.json"), JSON.stringify({ captures, measurements, errors }, null, 2));
console.log(JSON.stringify({ screenshots: captures.length, errors }));
