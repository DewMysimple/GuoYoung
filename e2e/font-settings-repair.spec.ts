import { resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test as base, screenshotPath } from "./fixtures";

const test = base.extend({
  context: async ({ context }, use) => {
    // Install before the shared page fixture navigates, so initial favicon
    // requests cannot race the deterministic candidates used by the text audit.
    await context.route(/^https?:\/\//, route => route.request().resourceType() === "image"
      ? route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#3367d6"/><path d="M18 16h10v13h18v10H28v13H18z" fill="#fff"/></svg>' })
      : route.fallback());
    await use(context);
  },
});

interface TextStyle { key: string; text: string; family: string; size: number }

// Check rendered text and editable values, including code and body portals.
// The six font samples deliberately demonstrate their own families.
async function textStyles(scope: Locator): Promise<TextStyle[]> {
  return scope.evaluate(root => [root, ...root.querySelectorAll("*")].flatMap(element => {
    if (element.closest(".typography-font-sample, .visually-hidden, script, style")) return [];
    const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent).join("").trim();
    const editable = element.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select');
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    if ((!text && !editable) || !box.width || !box.height || style.display === "none" || style.visibility !== "visible") return [];
    const path: string[] = [];
    for (let current: Element | null = element; current && current !== root; current = current.parentElement) {
      const siblings = [...current.parentElement!.children].filter(sibling => sibling.tagName === current!.tagName);
      path.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`);
    }
    return [{ key: path.join(" > "), text: text.slice(0, 60), family: style.fontFamily, size: parseFloat(style.fontSize) }];
  }));
}

async function openFonts(page: Page) {
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "字体调节" }).click();
  return panel;
}

async function expand(panel: Locator, title: string) {
  const summary = panel.locator("summary").filter({ hasText: title });
  if (!await summary.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await summary.click();
}

async function collapseFontSections(panel: Locator) {
  for (const title of ["效果微调", "文字增强", "文字颜色", "分区字号"]) {
    const summary = panel.locator("summary").filter({ hasText: title });
    if (await summary.count() && await summary.isVisible() && await summary.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await summary.click();
  }
}

function styleAudit(page: Page) {
  const baselines = new Map<string, TextStyle[]>();
  return async (name: string, scope: Locator, scale: number) => {
    const expectedFamily = await page.locator("html").evaluate(element => getComputedStyle(element).fontFamily);
    const styles = await textStyles(scope);
    expect(styles.length, `${name} contains rendered text`).toBeGreaterThan(0);
    expect(styles.filter(item => item.family !== expectedFamily), `${name}: every text family`).toEqual([]);
    if (scale === 100) baselines.set(name, styles);
    else {
      const baseline = baselines.get(name)!;
      expect(styles.map(item => item.key), `${name}: same text controls at ${scale}%`).toEqual(baseline.map(item => item.key));
      const mismatches = styles.flatMap((item, index) => Math.abs(item.size - baseline[index].size * scale / 100) > 0.025
        ? [{ text: item.text, actual: item.size, expected: baseline[index].size * scale / 100 }] : []);
      expect(mismatches, `${name}: every text size scales once at ${scale}%`).toEqual([]);
    }
  };
}

test("applies font families and 100→130→70 overall size to page text, settings, menus and body portals", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop typography acceptance");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(() => Object.defineProperty(window, "chrome", { configurable: true, value: {
    runtime: { id: "font-history-test" },
    permissions: { contains: async () => true, request: async () => true },
    history: { search: async () => [{ id: "font-history", title: "Font History", url: "https://example.com/font-history", lastVisitTime: Date.now(), visitCount: 3 }] },
  } }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    Object.assign(state.appearance, { theme: "light", fontScale: 100, cardFontScale: 120, groupFontScale: 115, brandFontScale: 150 });
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();

  const panel = await openFonts(page);
  for (const [label, family] of [["默认字体", "Manrope Variable"], ["系统字体", "system-ui"], ["宋体 / 衬线", "SimSun"], ["霞鹜文楷", "LXGW WenKai"], ["等宽字体", "Consolas"]]) {
    await panel.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator("html")).toHaveCSS("font-family", new RegExp(family));
    const expected = await page.locator("html").evaluate(element => getComputedStyle(element).fontFamily);
    expect((await textStyles(page.locator("body"))).filter(item => item.family !== expected), `${label} covers all displayed text except samples`).toEqual([]);
  }
  await panel.getByRole("button", { name: "宋体 / 衬线", exact: true }).click();
  await panel.getByRole("button", { name: "保存设置" }).click();

  const audit = styleAudit(page);
  let iconSizes: { width: number; height: number }[] | undefined;
  for (const scale of [100, 130, 70]) {
    await openFonts(page);
    await collapseFontSections(panel);
    await panel.getByRole("slider", { name: "整体字号", exact: true }).fill(String(scale));
    await expect(page.locator("html")).toHaveCSS("font-size", `${16 * scale / 100}px`);
    await audit("settings-fonts", panel, scale);
    await expand(panel, "文字颜色");
    await panel.getByRole("button", { name: "自定义主要文字颜色" }).click();
    const picker = panel.getByRole("dialog", { name: "选择自定义颜色" });
    await expect(picker).toBeVisible();
    await audit("settings-picker", picker, scale);
    await panel.getByRole("button", { name: "自定义主要文字颜色" }).click();
    await panel.getByRole("button", { name: "文字增强说明", exact: true }).click();
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeVisible();
    expect(await tip.evaluate(element => element.parentElement === document.body)).toBe(true);
    await audit("portal-help", tip, scale);
    await page.keyboard.press("Escape");
    for (const tab of ["外观", "壁纸", "数据"]) {
      await panel.getByRole("tab", { name: tab, exact: true }).click();
      await audit(`settings-${tab}`, panel, scale);
    }
    await panel.getByRole("button", { name: "保存设置" }).click();
    await audit("collection", page.locator(".app-shell"), scale);
    for (const [selector, base] of [[".brand-name", 18 * 1.5], [".site-name", 14 * 1.2], [".grouped-site-header-main h3", 17 * 1.15]] as const) {
      const size = await page.locator(selector).first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      expect(size, `${selector}: local multiplier and overall size each apply once`).toBeCloseTo(base * scale / 100, 2);
    }
    const sizes = await page.locator(".app-shell svg").evaluateAll(icons => icons.map(icon => {
      const box = icon.getBoundingClientRect(); return { width: box.width, height: box.height };
    }));
    if (iconSizes) expect(sizes, "Text scale keeps SVG dimensions").toEqual(iconSizes);
    else iconSizes = sizes;

    await page.getByRole("button", { name: "手动排列", exact: true }).click();
    await audit("sort-menu", page.getByRole("menu", { name: "排列方式" }), scale);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "管理分组", exact: true }).click();
    const manager = page.getByRole("dialog", { name: "管理分组", exact: true });
    await audit("portal-manager", manager, scale);
    await manager.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "编辑 Google", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "编辑网站", exact: true });
    await expect(editor.locator(".icon-source-probe")).toHaveCount(0);
    await expect(editor.getByRole("radio", { name: "使用高清图标", exact: true })).toBeVisible();
    await expect(editor.getByRole("radio", { name: "使用镜像图标", exact: true })).toBeVisible();
    await expect(editor.locator(".favicon-frame img:not(.is-loaded)")).toHaveCount(0);
    await audit("portal-editor", editor, scale);
    await editor.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "打开历史记录" }).click();
    await expect(page.locator(".history-site-card")).toHaveCount(1);
    await audit("history", page.locator(".browser-history"), scale);
    await page.getByRole("button", { name: "历史记录时间范围", exact: true }).click();
    await audit("history-menu", page.getByRole("listbox", { name: "历史记录时间范围选项" }), scale);
    await page.keyboard.press("Escape");
    await page.locator(".history-site-card .history-site-open").click();
    await expect(page.locator(".history-site-detail")).toBeVisible();
    await audit("history-detail", page.locator(".history-site-detail"), scale);
    await page.getByRole("button", { name: "打开数据" }).click();
    await audit("data", page.getByRole("region", { name: "数据页面" }), scale);
    await page.getByRole("button", { name: "打开收藏主页" }).click();
    await page.screenshot({ path: screenshotPath(`font-scale-${scale}-desktop.png`), animations: "disabled" });
  }
});

test("loads a chosen local font after save/reload and shares its family and overall size with both popup tabs", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop popup typography acceptance");
  const panel = await openFonts(page);
  await panel.getByRole("button", { name: "本地字体", exact: true }).click();
  await panel.getByLabel("字体文件", { exact: true }).setInputFiles(resolve("public/fonts/LXGWWenKai-Regular.woff2"));
  await expect(panel.getByText("当前字体：LXGWWenKai-Regular", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  const family = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    localStorage.setItem("popup-font-collection", JSON.stringify(state));
    return `Mysimple_Local_${state.appearance.customFontAssetId}`;
  });
  await expect.poll(() => page.evaluate(family => [...document.fonts].some(face => face.family.replaceAll('"', "") === family && face.status === "loaded"), family)).toBe(true);
  await page.addInitScript(() => Object.defineProperty(window, "chrome", { configurable: true, value: {
    runtime: { id: "popup-font-test", getURL: (path: string) => `chrome-extension://popup-font-test${path}` },
    storage: { local: {
      get: async (key: string) => ({ [key]: localStorage.getItem("popup-font-collection") }),
      set: async (values: Record<string, string>) => localStorage.setItem("popup-font-collection", values["site-hub:v1"]),
    } },
    tabs: { query: async () => [{ id: 1, title: "字体覆盖示例", url: "https://font-popup.example/" }] },
    bookmarks: { getTree: async () => [{ id: "root", title: "", children: [{ id: "bar", title: "收藏夹栏", children: [
      { id: "reference", title: "参考资料", children: [{ id: "example", title: "示例文档", url: "https://example.org/docs" }] },
    ] }] }], remove: async () => {}, removeTree: async () => {} },
  } }));
  await page.setViewportSize({ width: 440, height: 600 });
  const audit = styleAudit(page);
  let svgSize: string | undefined;
  for (const scale of [100, 130, 70]) {
    await page.evaluate(scale => {
      const state = JSON.parse(localStorage.getItem("popup-font-collection")!);
      state.appearance.fontScale = scale;
      localStorage.setItem("popup-font-collection", JSON.stringify(state));
    }, scale);
    await page.goto("/popup.html");
    await expect(page.getByRole("textbox", { name: "网站名称" })).toHaveValue("字体覆盖示例");
    await expect(page.locator("html")).toHaveCSS("font-family", new RegExp(family));
    await expect(page.locator("html")).toHaveCSS("font-size", `${16 * scale / 100}px`);
    await expect.poll(() => page.evaluate(family => [...document.fonts].some(face => face.family.replaceAll('"', "") === family && face.status === "loaded"), family)).toBe(true);
    await expect(page.locator(".popup-shell .favicon-frame img:not(.is-loaded)")).toHaveCount(0);
    await audit("popup-quick", page.locator(".popup-shell"), scale);
    const size = await page.locator(".popup-tabs svg").first().evaluate(element => `${getComputedStyle(element).width}/${getComputedStyle(element).height}`);
    if (svgSize) expect(size).toBe(svgSize); else svgSize = size;
    await page.getByRole("button", { name: "浏览器书签", exact: true }).click();
    await expect(page.getByRole("button", { name: "打开书签文件夹 收藏夹栏" })).toBeVisible();
    await audit("popup-bookmarks", page.locator(".popup-shell"), scale);
    await page.locator(".bookmark-destination .select-menu-trigger").click();
    await audit("popup-menu", page.locator(".bookmark-destination .select-menu-popover"), scale);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "打开书签文件夹 收藏夹栏" }).click();
    await page.getByRole("button", { name: "打开书签文件夹 参考资料" }).click();
    await expect(page.locator(".popup-shell .favicon-frame img:not(.is-loaded)")).toHaveCount(0);
    await audit("popup-site", page.locator(".popup-shell"), scale);
    await page.screenshot({ path: screenshotPath(`font-popup-local-${scale}.png`), animations: "disabled" });
  }
});

test("offers only theme, none and glow effects and explains the theme default in its help portal", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop font effects acceptance");
  const panel = await openFonts(page);
  await expand(panel, "文字增强");
  const effects = panel.getByRole("group", { name: "文字效果", exact: true });
  await expect(effects.getByRole("button")).toHaveText(["跟随主题", "无效果", "柔光"]);
  await expect(panel.getByRole("button", { name: /^(阴影|描边)$/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "文字增强说明", exact: true }).click();
  const help = page.getByRole("tooltip");
  await expect(help).toContainText("无壁纸时不额外增强");
  await expect(help).toContainText("随浅深主题切换的轻微阴影");
  await page.keyboard.press("Escape");
  await effects.getByRole("button", { name: "跟随主题", exact: true }).click();
  await expect(page.locator(".collection-heading h2")).toHaveCSS("text-shadow", "none");
  await effects.getByRole("button", { name: "柔光", exact: true }).click();
  await expect(page.locator(".site-name").first()).not.toHaveCSS("text-shadow", "none");
  await effects.getByRole("button", { name: "无效果", exact: true }).click();
  await expect(page.locator(".site-name").first()).toHaveCSS("text-shadow", "none");
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.route("https://font-effects.example/wallpaper.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#41849c"/></svg>' }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://font-effects.example/wallpaper.svg" };
    Object.assign(state.appearance, { textEffect: "auto", theme: "light" });
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  const heading = page.locator(".collection-heading h2");
  await expect(heading).not.toHaveCSS("text-shadow", "none");
  const lightShadow = await heading.evaluate(element => getComputedStyle(element).textShadow);
  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("button", { name: "深色", exact: true }).click();
  await expect(heading).not.toHaveCSS("text-shadow", lightShadow);
  await panel.getByRole("button", { name: "保存设置" }).click();
});
