// Production-browser acceptance with synthetic fixtures and intercepted external requests.
// Start `npm.cmd run preview -- --host 127.0.0.1 --port 4175` after both builds.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const { version } = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${version}/screenshots`);
await mkdir(output, { recursive: true });
const report = { version, environments: [], captures: [], errors: [] };
const base = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4175";
const key = "site-hub:v1";
const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="26" fill="#4178b8"/><path d="M32 64h64M64 32v64" stroke="white" stroke-width="12"/></svg>';
const navigation = host => `https://${host}/Private/Report?token=FAKE_TOKEN&view=AbC&view=DeF#section-2`;
const fixtureSites = [
  { id: "probe-explicit", name: "高清来源示例", url: navigation("explicit.example"), iconSource: "google" },
  { id: "probe-auto", name: "自动回退示例", url: navigation("auto.example"), iconSource: "auto" },
  { id: "probe-browser", name: "本地页面图标", url: navigation("browser.example"), iconSource: "browser" },
  { id: "probe-custom", name: "自定义图片示例", url: navigation("custom.example"), iconSource: "custom", customIconUrl: "https://images.example/Icons/Custom.svg?signature=FAKE_IMAGE#v2" },
  { id: "probe-offline", name: "离线回退示例", url: navigation("offline.example"), iconSource: "google" },
];
const payload = name => ({ format: "site-hub-group-export", exportVersion: 1,
  group: { name, icon: "folder" }, sites: [{ name: `${name}网站`, url: `https://${name === "首次导入" ? "first" : name === "失败恢复" ? "retry" : "later"}.example/Docs?view=AbC#anchor`, order: 0 }] });

async function stored(page, extension) {
  return page.evaluate(async ({ extension, key }) => JSON.parse(extension
    ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key)), { extension, key });
}
async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflows`);
  await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled", fullPage: true });
  report.captures.push(name);
}
async function chooseImport(page, name) {
  await page.getByLabel("选择要导入的数据文件").setInputFiles({ name: `${name}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload(name))) });
  await page.getByRole("button", { name: "预览并导入", exact: true }).click();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
}
async function installSaveProbe(page, extension) {
  await page.evaluate(({ extension, key }) => {
    const probe = window.__saveProbe = { mode: "pass", calls: [], pending: [] };
    if (extension) {
      const area = chrome.storage.local;
      const original = area.set.bind(area);
      Object.defineProperty(area, "set", { configurable: true, value: async items => {
        if (!(key in items)) return original(items);
        const state = JSON.parse(items[key]);
        probe.calls.push({ groups: state.groups.length, sites: state.sites.length });
        if (probe.mode === "reject") throw new Error("Synthetic storage rejection");
        if (probe.mode === "delay") await new Promise((resolve, reject) => probe.pending.push({ resolve, reject }));
        return original(items);
      } });
    } else {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key) {
          const state = JSON.parse(value);
          probe.calls.push({ groups: state.groups.length, sites: state.sites.length });
          if (probe.mode === "reject") throw new DOMException("Synthetic storage rejection", "QuotaExceededError");
        }
        return original.call(this, name, value);
      };
    }
  }, { extension, key });
}
async function release(page) {
  await page.evaluate(() => {
    window.__saveProbe.mode = "pass";
    window.__saveProbe.pending.splice(0).forEach(pending => pending.resolve());
  });
}

async function inspect(context, url, extension) {
  const prefix = extension ? "extension" : "web";
  const result = { environment: prefix, import: {}, favicon: {}, externalRequestsIntercepted: 0 };
  report.environments.push(result);
  const requests = [];
  await context.route("**/*", async route => {
    const target = new URL(route.request().url());
    if (target.protocol === "http:" || target.protocol === "https:") {
      if (target.origin === new URL(base).origin) return route.continue();
      requests.push(target.toString());
      result.externalRequestsIntercepted++;
      if (target.hostname === "www.google.com" && target.pathname === "/s2/favicons") {
        const origin = target.searchParams.get("domain_url");
        if (origin && /(?:explicit|auto|browser|custom|offline)\.example/.test(origin)) {
          assert.equal(origin, new URL(origin).origin, "Third-party lookup must receive only the origin");
          assert.equal(target.searchParams.get("sz"), "256");
        }
        if (origin?.includes("offline.example")) return route.abort("internetdisconnected");
        return route.fulfill({ contentType: "image/svg+xml", body: icon });
      }
      if (target.hostname === "images.example") return route.fulfill({ contentType: "image/svg+xml", body: icon });
      return route.abort("failed");
    }
    if (target.pathname === "/_favicon/") {
      requests.push(target.toString());
      if (target.searchParams.get("pageUrl")?.includes("auto.example") || target.searchParams.get("pageUrl")?.includes("offline.example")) return route.abort("failed");
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(`${prefix}: ${error.message}`));
  await page.goto(url);
  result.userAgent = await page.evaluate(() => navigator.userAgent);
  if (extension) result.extensionId = new URL(url).host;
  await expect(page.getByRole("button", { name: "打开数据" })).toBeVisible();
  await expect.poll(async () => (await stored(page, extension))?.groups.length).toBeGreaterThan(0);
  const baseline = await stored(page, extension);
  const seed = structuredClone(baseline);
  const groupId = seed.groups.find(group => group.workspace === "main").id;
  seed.sites = fixtureSites.map((site, order) => ({ ...site, groupId, order, globalOrder: order, clickCount: 0, createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z" }));
  seed.appearance.theme = "light";
  seed.wallpaper.source = "none";
  await page.evaluate(async ({ state, extension, key }) => {
    if (extension) await chrome.storage.local.set({ [key]: JSON.stringify(state) });
    else localStorage.setItem(key, JSON.stringify(state));
  }, { state: seed, extension, key });
  requests.length = 0;
  await page.reload();
  for (const site of fixtureSites) await expect(page.getByRole("link", { name: `打开 ${site.name}`, exact: true })).toHaveAttribute("href", site.url);
  await expect(page.getByTestId("site-card-probe-explicit").locator(".favicon-frame img")).toHaveClass(/is-loaded/);
  await expect(page.getByTestId("site-card-probe-auto").locator(".favicon-frame img")).toHaveAttribute("src", /www\.google\.com\/s2\/favicons/);
  await expect(page.getByTestId("site-card-probe-auto").locator(".favicon-frame img")).toHaveClass(/is-loaded/);
  await expect(page.getByTestId("site-card-probe-custom").locator(".favicon-frame img")).toHaveAttribute("src", fixtureSites[3].customIconUrl);
  const offlineCard = page.getByTestId("site-card-probe-offline");
  await expect.poll(async () => await offlineCard.getByTestId("favicon-fallback").count() > 0
    || await offlineCard.locator(".favicon-frame img.is-loaded").count() > 0).toBe(true);
  if (await offlineCard.locator("img").count()) {
    assert.match(await offlineCard.locator("img").getAttribute("src"), /_favicon\//,
      "An offline resolution can retain a local browser icon but cannot show an aborted remote image");
    result.favicon.offlineFallbackKind = "local-browser";
  } else result.favicon.offlineFallbackKind = "letter";
  for (const host of ["explicit.example", "auto.example"]) assert.ok(requests.some(value => {
    const target = new URL(value);
    return target.hostname === "www.google.com" && target.searchParams.get("domain_url") === `https://${host}`;
  }), `${prefix} must exercise ${host} through the real image request path`);
  result.favicon.explicitAndAutomaticGoogle = true;
  result.favicon.navigationPreserved = true;
  result.favicon.customPreserved = true;
  result.favicon.offlineFallback = true;
  if (extension) {
    const local = page.getByTestId("site-card-probe-browser").locator(".favicon-frame img");
    await expect(local).toHaveAttribute("src", /_favicon\//);
    assert.equal(new URL(await local.getAttribute("src")).searchParams.get("pageUrl"), fixtureSites[2].url);
    result.favicon.localExactPagePreserved = true;
  }
  await screenshot(page, `${prefix}-import-favicon-cards`);
  await page.getByRole("button", { name: "编辑 高清来源示例", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "编辑网站", exact: true });
  await expect(dialog.getByRole("radio", { name: "使用高清图标", exact: true })).toBeVisible();
  const pickerSrc = await dialog.getByRole("radio", { name: "使用高清图标", exact: true }).locator("img").getAttribute("src");
  assert.equal(new URL(pickerSrc).searchParams.get("domain_url"), "https://explicit.example");
  await screenshot(page, `${prefix}-import-favicon-preview`);
  await dialog.getByRole("radio", { name: "使用高清图标", exact: true }).click();
  const previewSrc = await dialog.locator(".site-preview img").getAttribute("src");
  assert.equal(new URL(previewSrc).searchParams.get("domain_url"), "https://explicit.example");
  result.favicon.pickerAndPreview = true;
  await screenshot(page, `${prefix}-import-favicon-picker`);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();

  await installSaveProbe(page, extension);
  await page.getByRole("button", { name: "打开数据" }).click();
  if (extension) await page.evaluate(() => { window.__saveProbe.mode = "delay"; });
  await chooseImport(page, "首次导入");
  if (extension) {
    await expect(page.getByRole("region", { name: "数据页面" })).toContainText("正在保存");
    await expect(page.getByRole("status").filter({ hasText: "已导入" })).toHaveCount(0);
    assert.equal((await stored(page, true)).sites.length, seed.sites.length);
    await expect(page.getByRole("button", { name: "正在保存…", exact: true })).toBeDisabled();
    assert.equal(await page.evaluate(() => window.__saveProbe.calls.length), 1);
    await screenshot(page, `${prefix}-import-saving`);
    await release(page);
    result.import.delayedReceipt = true;
    result.import.noDuplicateSubmission = true;
  }
  await expect(page.getByRole("status").filter({ hasText: "已导入 1 个网站，跳过 0 个链接，新建 1 个分组" })).toBeVisible();
  await expect(page.getByRole("button", { name: /选择 JSON 文件/ })).toBeVisible();
  await screenshot(page, `${prefix}-import-success`);
  await page.reload();
  await expect(page.getByRole("link", { name: "打开 首次导入网站", exact: true })).toBeVisible();
  result.import.successAndReload = true;

  await installSaveProbe(page, extension);
  await page.evaluate(() => { window.__saveProbe.mode = "reject"; });
  const beforeFailure = await stored(page, extension);
  await page.getByRole("button", { name: "打开数据" }).click();
  await chooseImport(page, "失败恢复");
  const data = page.getByRole("region", { name: "数据页面" });
  await expect(data.getByRole("alert")).toContainText(/未.*保存|保存.*失败|尚未.*成功/);
  await expect(data.getByRole("status").filter({ hasText: "已导入" })).toHaveCount(0);
  await expect(data.getByRole("button", { name: /失败恢复\.json/ })).toBeVisible();
  assert.deepEqual(await stored(page, extension), beforeFailure);
  await screenshot(page, `${prefix}-import-failure`);
  await page.evaluate(() => { window.__saveProbe.mode = "pass"; });
  const retry = data.getByRole("button", { name: "重试保存导入结果", exact: true });
  await retry.click();
  await expect(data.getByRole("status").filter({ hasText: "已导入 1 个网站，跳过 0 个链接，新建 1 个分组" })).toBeVisible();
  const recovered = await stored(page, extension);
  assert.equal(recovered.groups.filter(group => group.name === "失败恢复").length, 1);
  assert.equal(recovered.sites.filter(site => site.name === "失败恢复网站").length, 1);
  assert.equal(await page.evaluate(() => window.__saveProbe.calls.length), 2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("link", { name: "打开 失败恢复网站", exact: true })).toBeVisible();
  result.import.failurePreservesContextAndStorage = true;
  result.import.retryWithoutReimportAndReload = true;

  if (extension) {
    await installSaveProbe(page, true);
    await page.evaluate(() => { window.__saveProbe.mode = "delay"; });
    await page.getByRole("button", { name: "打开数据" }).click();
    await chooseImport(page, "后续编辑");
    await expect(page.getByRole("region", { name: "数据页面" })).toContainText("正在保存");
    await page.getByRole("button", { name: "返回收藏", exact: true }).click();
    await page.getByRole("button", { name: "编辑 高清来源示例", exact: true }).click();
    await page.getByLabel("网站名称", { exact: true }).fill("后续名称已保留");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(page.getByRole("link", { name: "打开 后续名称已保留", exact: true })).toBeVisible();
    await release(page);
    await expect.poll(async () => (await stored(page, true)).sites.find(site => site.id === "probe-explicit")?.name).toBe("后续名称已保留");
    await expect(page.getByRole("region", { name: "数据页面" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("link", { name: "打开 后续名称已保留", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "打开 后续编辑网站", exact: true })).toBeVisible();
    result.import.laterEditAndUnmountIsolation = true;
    await screenshot(page, `${prefix}-import-later-edit`);
  }
  result.favicon.requests = requests.filter(value => /(?:explicit|auto|browser|custom|offline)\.example|images\.example/.test(value));
  await page.close();
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
report.webBrowserVersion = browser.version();
try { await inspect(await browser.newContext({ viewport: { width: 1440, height: 1000 } }), base, false); }
finally { await browser.close(); }
const extension = resolve("dist-extension");
const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mysimple-import-favicon-")), {
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : { channel: "chromium" }),
  headless: true, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  report.extensionBrowserVersion = context.browser()?.version();
  await inspect(context, `chrome-extension://${new URL(worker.url()).host}/index.html`, true);
} finally { await context.close(); }
assert.deepEqual(report.errors, []);
await writeFile(join(output, "import-favicon-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ version, screenshots: report.captures.length, environments: report.environments.map(({ environment, import: imports, favicon, externalRequestsIntercepted }) => ({ environment, imports, favicon: { ...favicon, requests: favicon.requests.length }, externalRequestsIntercepted })), errors: report.errors }));
