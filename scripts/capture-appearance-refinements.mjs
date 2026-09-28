// Production acceptance. The local inventory lists the largest image in each
// wallpaper folder: [{ path, width, height, pixels, bytes }]. Images stay local.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const inventory = JSON.parse(await readFile(process.argv[2] ?? "artifacts/working/wallpaper-inventory.json", "utf8"));
const selected = [inventory[0], ...["Snowy Plains", "GreenForest 4K", "WLOP - Nap", "Meteors at Dawn"].map(name => inventory.find(row => row.path.includes(name)))];
assert(selected.every(Boolean), "Provide the full wallpaper inventory");
const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const captures = [], errors = [], materials = [];
const presets = ["液态清透", "水晶棱镜", "柔光薄雾", "细腻磨砂", "轻透无影", "经典玻璃", "雪景柔纱", "夜色凝光", "繁景静读"];
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: overflow`);
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true, animations: "disabled" });
  captures.push(name);
}
async function inspect(context, url, extension, prefix) {
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://api.github.com/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(
    route.request().url().includes("/repos") ? Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `demo-${index}`, full_name: `visual-check/demo-${index}`, html_url: `https://github.com/visual-check/demo-${index}`, private: false, fork: false, archived: false }))
      : { login: "visual-check", type: "User", name: "示例作者" }) }));
  for (let index = 0; index < selected.length; index++) {
    const source = selected[index];
    await page.route(`https://wallpaper-check.example/${index}`, route => route.fulfill({
      contentType: source.path.endsWith(".png") ? "image/png" : "image/jpeg", path: source.path,
      headers: { "Access-Control-Allow-Origin": "*" },
    }));
  }
  await page.goto(url);
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  async function seed(index, theme) {
    await page.evaluate(async ({ index, theme, extension }) => {
      const key = "site-hub:v1";
      const raw = extension ? (await chrome.storage.local.get(key))[key] : localStorage.getItem(key);
      const state = JSON.parse(raw);
      state.appearance.theme = theme;
      state.wallpaper = { ...state.wallpaper, source: "url", url: `https://wallpaper-check.example/${index}`, overlay: 0, blur: 0,
        topbarStyle: "clear", topbarReadability: "clear", glassTransparency: 78, glassControlTransparency: 82, glassPanelTransparency: 60,
        glassPopoverTransparency: 55, glassShadow: 35, glassBlur: 12, glassSaturation: 130, glassHighlight: 45, glassRefraction: false, glassRefractionStrength: 24 };
      if (extension) await chrome.storage.local.set({ [key]: JSON.stringify(state) });
      else localStorage.setItem(key, JSON.stringify(state));
    }, { index, theme, extension });
    await page.reload();
    await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
    await expect(page.locator(".wallpaper-layer img")).toHaveAttribute("src", `https://wallpaper-check.example/${index}`);
    await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
    await page.waitForFunction(() => !document.documentElement.classList.contains("wallpaper-boot-pending"));
  }
  for (let index = 0; index < selected.length; index++) {
    for (const theme of ["light", "dark"]) {
      await seed(index, theme);
      const geometry = await page.locator(".topbar").boundingBox();
      assert(geometry.x < 1, "Topbar must reach the left edge");
      const actual = await page.evaluate(() => {
        const topbar = document.querySelector(".topbar");
        const brand = document.querySelector(".brand");
        return { text: getComputedStyle(brand).color, theme: getComputedStyle(document.documentElement).getPropertyValue("--theme-text").trim(), layer: getComputedStyle(topbar, "::after").backgroundImage };
      });
      assert.match(actual.layer, /linear-gradient/);
      materials.push({ prefix, index, theme, ...actual });
      await capture(page, `${prefix}-wallpaper-${index}-${theme}`);
    }
  }
  // All nine actual presets over bright, dark and detailed originals.
  if (!extension) for (const index of [1, 2, 3]) {
    await seed(index, "light");
    for (let preset = 0; preset < presets.length; preset++) {
      await page.getByRole("button", { name: "打开设置" }).click();
      await page.getByRole("tab", { name: "壁纸", exact: true }).click();
      const disclosure = page.locator("details").filter({ has: page.locator("summary > span", { hasText: /^玻璃外观$/ }) });
      if (!(await disclosure.getAttribute("open")) && (await disclosure.getAttribute("open")) !== "") await disclosure.locator(":scope > summary").click();
      await page.getByRole("button", { name: new RegExp(presets[preset]) }).click();
      if (preset === 8) await capture(page, `${prefix}-presets-${index}`);
      await page.getByRole("button", { name: "保存设置" }).click();
      await capture(page, `${prefix}-preset-${index}-${preset}`);
    }
  }
  async function inspectField(dialog, label, name) {
    const field = dialog.getByRole("textbox", { name: label, exact: true });
    await field.focus();
    const style = await field.evaluate(input => {
      const shell = input.closest(".input-shell");
      const label = input.closest("label");
      return { input: getComputedStyle(input).backgroundColor, outline: label ? getComputedStyle(label).outlineStyle : "none", shell: shell ? getComputedStyle(shell).backgroundColor : null };
    });
    assert.equal(style.outline, "none");
    if (style.shell) { assert.match(style.input, /(?:rgba\(0, 0, 0, 0\)|\/ 0\))/); assert.match(style.shell, /(?:rgba|\/ 0\.)/); }
    materials.push({ name, ...style });
    await capture(page, name);
  }
  for (const theme of ["light", "dark"]) {
    await seed(2, theme);
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await page.getByRole("menuitem", { name: "添加网站" }).click();
    let dialog = page.getByRole("dialog", { name: "添加网站" });
    await inspectField(dialog, "网站地址", `${prefix}-site-dialog-${theme}`);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "新建分组", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "新建分组" });
    await inspectField(dialog, "分组名称", `${prefix}-group-dialog-${theme}`);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "打开 GitHub 收藏", exact: true }).click();
    await page.getByRole("button", { name: "导入 GitHub 作者仓库" }).click();
    dialog = page.getByRole("dialog", { name: "导入作者仓库" });
    await inspectField(dialog, "作者或组织主页", `${prefix}-github-dialog-${theme}`);
    await dialog.getByRole("textbox", { name: "作者或组织主页" }).fill("https://github.com/visual-check");
    await dialog.getByRole("button", { name: "读取仓库" }).click();
    await expect(dialog.locator(".github-import-list")).toBeVisible();
    await expect(dialog.locator(".github-import-list")).toHaveCSS("background-color", /\/ 0\.09\)/);
    await capture(page, `${prefix}-github-preview-${theme}`);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "打开设置" }).click();
    await page.getByRole("tab", { name: "外观", exact: true }).click();
    await page.getByRole("button", { name: "名称与图标" }).click();
    dialog = page.getByRole("dialog", { name: "设置", exact: true });
    await inspectField(dialog, "品牌名称", `${prefix}-brand-${theme}`);
    await page.getByLabel("选择 Logo 图片").setInputFiles(selected[3].path);
    const editor = page.getByRole("dialog", { name: "调整 Logo 图片" });
    await editor.getByRole("button", { name: "圆形", exact: true }).click();
    await editor.getByRole("checkbox", { name: /裁切选定区域/ }).check();
    await editor.getByRole("slider", { name: "裁切缩放" }).fill("170");
    await expect(editor.getByRole("button", { name: "压缩并应用" })).toBeEnabled();
    await capture(page, `${prefix}-logo-editor-${theme}`);
    await editor.getByRole("button", { name: "压缩并应用" }).click();
    await page.getByRole("button", { name: "保存设置" }).click();
    await page.reload();
    await expect(page.locator(".topbar .brand-mark-custom")).toHaveAttribute("data-shape", "circle");
    await capture(page, `${prefix}-logo-applied-${theme}`);
  }
  await page.close();
}
const browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
try { await inspect(await browser.newContext({ viewport: { width: 1440, height: 1000 } }), process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:4175", false, "web"); }
finally { await browser.close(); }
const extension = resolve("dist-extension");
const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mysimple-appearance-")), {
  channel: "chromium", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try { const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await inspect(context, `chrome-extension://${new URL(worker.url()).host}/index.html`, true, "extension");
} finally { await context.close(); }
assert.deepEqual(errors, []);
await writeFile(join(output, "appearance-report.json"), JSON.stringify({ selected, captures, materials, errors }, null, 2));
console.log(JSON.stringify({ screenshots: captures.length, errors }));
