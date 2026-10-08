import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const wallpaperURL = "https://settings-options.example/wallpaper.svg";
const wallpaper = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g"><stop stop-color="#abc8dc"/><stop offset="1" stop-color="#3b5076"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><circle cx="1250" cy="360" r="260" fill="#cba475"/></svg>';

async function seed(page: Page, theme: "light" | "dark", withWallpaper: boolean) {
  await page.route(wallpaperURL, route => route.fulfill({ contentType: "image/svg+xml", body: wallpaper }));
  await page.evaluate(({ theme, withWallpaper, wallpaperURL }) => {
    const key = "site-hub:v1", state = JSON.parse(localStorage.getItem(key)!);
    state.appearance = { ...state.appearance, theme, accentColor: "#3367d6", interfaceScale: 100, fontScale: 100 };
    state.wallpaper = { ...state.wallpaper, source: withWallpaper ? "url" : "none", url: wallpaperURL };
    state.trashRetentionDays = 30;
    localStorage.setItem(key, JSON.stringify(state));
  }, { theme, withWallpaper, wallpaperURL });
  await page.reload();
  await expect(page.getByRole("button", { name: "打开设置", exact: true })).toBeVisible();
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  return page.getByRole("dialog", { name: "设置", exact: true });
}

async function expand(panel: Locator, title: string) {
  const summary = panel.locator("summary").filter({ hasText: new RegExp(`^${title}`) });
  if (!await summary.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await summary.click();
}

async function choose(group: Locator, name: string, role: "button" | "radio" = "button") {
  const option = group.getByRole(role, { name, exact: true });
  await option.click();
  await expect(option).toHaveAttribute(role === "radio" ? "aria-checked" : "aria-pressed", "true");
}

async function auditSwatches(panel: Locator) {
  const geometry = await panel.getByRole("group", { name: "主题色选择", exact: true })
    .locator('.settings-option[data-variant="swatch"]').evaluateAll(buttons => buttons.map(button => {
      const sample = button.querySelector<HTMLElement>(".settings-option-color")!;
      const shell = button.getBoundingClientRect(), color = sample.getBoundingClientRect();
      const css = getComputedStyle(button), sampleCSS = getComputedStyle(sample);
      const length = (property: string) => parseFloat(css.getPropertyValue(property));
      const horizontal = length("padding-left") + length("padding-right") + length("border-left-width") + length("border-right-width");
      const vertical = length("padding-top") + length("padding-bottom") + length("border-top-width") + length("border-bottom-width");
      const shellWidth = parseFloat(css.width) + (css.boxSizing === "border-box" ? 0 : horizontal);
      const shellHeight = parseFloat(css.height) + (css.boxSizing === "border-box" ? 0 : vertical);
      const scaleX = shell.width / shellWidth, scaleY = shell.height / shellHeight;
      const radius = (property: string) => {
        const value = sampleCSS.getPropertyValue(property);
        return value.endsWith("%") ? parseFloat(value) / 100 * color.width : parseFloat(value) * scaleX;
      };
      return { label: button.getAttribute("aria-label"), custom: button.classList.contains("custom-accent-swatch"),
        hasCheck: !button.classList.contains("custom-accent-swatch") && Boolean(button.querySelector("svg")),
        width: color.width, height: color.height, expectedWidth: shell.width - horizontal * scaleX,
        expectedHeight: shell.height - vertical * scaleY,
        offsetX: color.left - shell.left - (length("padding-left") + length("border-left-width")) * scaleX,
        offsetY: color.top - shell.top - (length("padding-top") + length("border-top-width")) * scaleY,
        radii: ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"].map(radius) };
    }));
  const presets = geometry.filter(sample => !sample.custom);
  expect(presets.some(sample => sample.hasCheck), "The swatch audit includes the selected Check overlay").toBe(true);
  expect(presets.some(sample => !sample.hasCheck), "The swatch audit includes unselected samples without Check").toBe(true);
  expect(geometry.filter(sample => sample.width < 12 || sample.height < 12 || Math.abs(sample.width - sample.height) > .5
    || Math.abs(sample.width - sample.expectedWidth) > .5 || Math.abs(sample.height - sample.expectedHeight) > .5
    || Math.abs(sample.offsetX) > .5 || Math.abs(sample.offsetY) > .5
    || sample.radii.some(radius => radius < sample.width / 2 - .5)), "Every internal color sample is a full circular swatch inside the padded shell").toEqual([]);
}

/** Audit actual painted colors, including color-mix()/color(srgb ...) serialization. */
async function auditOptions(scope: Locator) {
  const styles = await scope.locator(".settings-option, .settings-option-input").evaluateAll(elements => {
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d")!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    return elements.filter(element => element.getClientRects().length).map(element => {
      const css = getComputedStyle(element);
      const selected = element.getAttribute("aria-pressed") === "true" || element.getAttribute("aria-checked") === "true"
        || element.getAttribute("aria-selected") === "true" || element.classList.contains("is-selected")
        || (element instanceof HTMLInputElement && element.checked);
      return { label: element.getAttribute("aria-label") ?? element.textContent?.trim(), selected,
        disabled: element instanceof HTMLButtonElement || element instanceof HTMLInputElement ? element.disabled : false,
        background: css.backgroundColor, rgba: rgba(css.backgroundColor),
        borders: [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth],
        borderAlpha: rgba(css.borderTopColor)[3] };
    });
  });
  expect(styles.length, "The current settings section contains shared options").toBeGreaterThan(0);
  expect(styles.filter(style => style.borders.some(width => parseFloat(width) < 1) || style.borderAlpha === 0), "Every option owns a visible outer border").toEqual([]);
  const selected = styles.filter(style => style.selected);
  expect(selected.length, "The current section contains selected controls").toBeGreaterThan(0);
  expect(selected.filter(({ rgba: [red, green, blue, alpha] }) => alpha <= 0 || alpha >= 255 || blue <= red || blue <= green), "Selected options share a translucent blue surface").toEqual([]);
  expect(new Set(selected.map(style => style.background)).size, "Tabs, choices and checkboxes share one selected material").toBe(1);
  const hovered = scope.locator('.settings-option:is([aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], .is-selected):not(:disabled)').last();
  const baseline = await hovered.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor }));
  await hovered.hover();
  expect(await hovered.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor })), "Hover preserves the shared selected material").toEqual(baseline);
  return styles;
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop settings options acceptance");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const theme of ["light", "dark"] as const) for (const withWallpaper of [false, true]) {
  test(`shares framed blue selected options across every settings section: ${theme}, wallpaper ${withWallpaper}`, async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, theme, withWallpaper);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
    const panel = await openSettings(page);
    await panel.getByRole("tab", { name: "外观", exact: true }).click();
    await choose(panel.getByRole("group", { name: "常用界面缩放", exact: true }), "界面缩放 100%");
    await choose(panel.getByRole("group", { name: "主题模式", exact: true }), theme === "light" ? "深色" : "浅色");
    await choose(panel.getByRole("group", { name: "主题模式", exact: true }), theme === "light" ? "浅色" : "深色");
    await choose(panel.getByRole("group", { name: "布局预设", exact: true }), "紧凑");
    for (const [label, option] of [["页面宽度模式", "铺满窗口"], ["卡片形状", "正方形"], ["卡片排列", "指定每行数量"]]) {
      await choose(panel.getByRole("group", { name: label, exact: true }), option);
    }
    await panel.getByRole("button", { name: "使用颜色 #3367d6", exact: true }).click();
    await auditSwatches(panel);
    await panel.getByRole("button", { name: "名称与图标", exact: true }).click();
    const sources = panel.getByRole("radiogroup", { name: "Logo 来源", exact: true });
    await choose(sources, "网络地址", "radio");
    await sources.getByRole("radio", { name: "网络地址", exact: true }).press("Home");
    await expect(sources.getByRole("radio", { name: "默认方格", exact: true })).toBeFocused();
    await expect(sources.getByRole("radio", { name: "默认方格", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(sources.getByRole("radio", { name: "网络地址", exact: true })).toBeFocused();
    await expect(sources.getByRole("radio", { name: "网络地址", exact: true })).toHaveAttribute("aria-checked", "true");
    await choose(panel.getByRole("group", { name: "Logo 外形", exact: true }), "圆形");
    await auditOptions(panel);

    await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
    await choose(panel.getByRole("group", { name: "字体选择", exact: true }), "系统字体");
    await expand(panel, "文字颜色");
    await choose(panel.getByRole("group", { name: "文字配色预设", exact: true }), "墨色文字");
    await panel.getByRole("checkbox", { name: "主题关联字体颜色", exact: true }).check();
    await expand(panel, "文字增强");
    await choose(panel.getByRole("group", { name: "文字效果", exact: true }), "柔光");
    await panel.getByRole("checkbox", { name: "允许选择展示文字", exact: true }).check();
    await auditOptions(panel);

    await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
    await expand(panel, "外观预设");
    await panel.locator('.glass-preset[data-preset="soft"]').click();
    await panel.getByRole("checkbox", { name: "预设同时应用顶栏和侧栏", exact: true }).check();
    await expand(panel, "基础设置");
    if (withWallpaper) await choose(panel.getByRole("group", { name: "填充方式", exact: true }), "完整显示");
    else await expect(panel.getByRole("button", { name: "完整显示", exact: true })).toBeDisabled();
    for (const title of ["顶栏", "侧栏"]) {
      await expand(panel, `${title}外观`);
      await choose(panel.getByRole("group", { name: `${title}样式`, exact: true }), "独立玻璃底板");
    }
    const wallpaperStyles = await auditOptions(panel);
    if (!withWallpaper) expect(wallpaperStyles.filter(style => style.selected && style.disabled), "Selected disabled wallpaper choices retain their shared surface").not.toHaveLength(0);

    await panel.getByRole("tab", { name: "数据", exact: true }).click();
    await panel.getByRole("button", { name: "查看", exact: true }).click();
    await panel.getByRole("button", { name: "回收站自动清理期限", exact: true }).click();
    await auditOptions(panel);
    await page.keyboard.press("Escape");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "取消", exact: true }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!))).toEqual(saved);
  });
}

test("keeps option previews transactional through cancellation, save and refresh", async ({ page }) => {
  await seed(page, "light", false);
  const baseline = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  const panel = await openSettings(page);
  const appearanceTab = panel.getByRole("tab", { name: "外观", exact: true });
  await appearanceTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(panel.getByRole("tab", { name: "字体调节", exact: true })).toBeFocused();
  await expect(panel.getByRole("tab", { name: "字体调节", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(panel.getByRole("tab", { name: "数据", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(appearanceTab).toBeFocused();
  await expect(appearanceTab).toHaveAttribute("aria-selected", "true");
  await choose(panel.getByRole("group", { name: "卡片形状", exact: true }), "正方形");
  await panel.getByRole("checkbox", { name: "设置面板推开页面", exact: true }).check();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!))).toEqual(baseline);
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await openSettings(page);
  await expect(panel.getByRole("button", { name: "自由比例", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("checkbox", { name: "设置面板推开页面", exact: true })).not.toBeChecked();
  await choose(panel.getByRole("group", { name: "卡片形状", exact: true }), "正方形");
  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  await choose(panel.getByRole("group", { name: "字体选择", exact: true }), "系统字体");
  await panel.getByRole("checkbox", { name: "允许选择展示文字", exact: true }).check();
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  expect(saved.appearance).toMatchObject({ cardShape: "square", fontFamily: "system", allowTextSelection: true });
  expect(saved.sites).toEqual(baseline.sites);
  expect(saved.groups).toEqual(baseline.groups);
  await openSettings(page);
  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  await expect(panel.getByRole("button", { name: "系统字体", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("checkbox", { name: "允许选择展示文字", exact: true })).toBeChecked();
});

test("uses framed menu options with native keyboard selection and keeps dangerous arming separate", async ({ page }) => {
  await seed(page, "dark", false);
  await page.evaluate(() => {
    const key = "site-hub:v1", state = JSON.parse(localStorage.getItem(key)!);
    const site = state.sites.find((item: { id: string }) => item.id === "github");
    state.deletedSites = [{ site: { ...site, id: "options-trash", name: "设置选项回收站测试" },
      originalGroupId: site.groupId, originalGroupName: "其他", deletedAt: new Date().toISOString() }];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("button", { name: "打开回收站", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  const trigger = panel.getByRole("button", { name: "回收站自动清理期限", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const list = panel.getByRole("listbox", { name: "回收站自动清理期限", exact: true });
  await expect(list.getByRole("option", { name: "30 天后", exact: true })).toBeFocused();
  await auditOptions(panel);
  await page.keyboard.press("End");
  await expect(list.getByRole("option", { name: "永不自动清理", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).trashRetentionDays)).toBeNull();
  await trigger.press("ArrowUp");
  await expect(list.getByRole("option", { name: "永不自动清理", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(list.getByRole("option", { name: "7 天后", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).trashRetentionDays)).toBeNull();
  const danger = panel.getByRole("button", { name: "永久删除 设置选项回收站测试", exact: true });
  await danger.click();
  const armed = panel.getByRole("button", { name: "再次点击永久删除 设置选项回收站测试", exact: true });
  await expect(armed).toHaveClass(/is-delete-armed/);
  await expect(armed).not.toHaveClass(/settings-option/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).deletedSites)).toHaveLength(1);
});

test("uses shared options and checkbox inside the body-mounted Logo editor", async ({ page }) => {
  await seed(page, "light", true);
  const panel = await openSettings(page);
  await panel.getByRole("tab", { name: "外观", exact: true }).click();
  await panel.getByRole("button", { name: "名称与图标", exact: true }).click();
  await panel.getByLabel("选择 Logo 图片", { exact: true }).setInputFiles({ name: "options-logo.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#3367d6"/><circle cx="80" cy="50" r="30" fill="#ffe2a7"/></svg>') });
  const editor = page.getByRole("dialog", { name: "调整 Logo 图片", exact: true });
  await expect(editor).toBeVisible();
  expect(await editor.evaluate(element => !element.closest(".settings-panel"))).toBe(true);
  await choose(editor.getByRole("group", { name: "Logo 图片外形", exact: true }), "圆形");
  const crop = editor.getByRole("checkbox", { name: "裁切选定区域", exact: true });
  await crop.check();
  const immediateSelection = await crop.evaluate(element => {
    const input = element as HTMLInputElement, css = getComputedStyle(input);
    const selected = input.closest(".logo-image-editor")!.querySelector('.settings-option[aria-pressed="true"]')!;
    return { checked: input.checked, matchesChecked: input.matches(":checked"), background: css.backgroundColor,
      selectedBackground: getComputedStyle(selected).backgroundColor,
      transitionProperty: css.transitionProperty, activeAnimations: input.getAnimations().length,
      buttonTransitionProperty: getComputedStyle(selected).transitionProperty, buttonAnimations: selected.getAnimations().length };
  });
  expect(immediateSelection.checked).toBe(true);
  expect(immediateSelection.matchesChecked).toBe(true);
  expect(immediateSelection.background, "Selection paints immediately, including with reduced motion").toBe(immediateSelection.selectedBackground);
  expect(immediateSelection.transitionProperty).toBe("none");
  expect(immediateSelection.activeAnimations, "Reduced-motion duration cannot introduce an all-property checkbox transition").toBe(0);
  expect(immediateSelection.buttonTransitionProperty).toBe("none");
  expect(immediateSelection.buttonAnimations).toBe(0);
  await auditOptions(editor);
  await crop.focus();
  await page.keyboard.press("Space");
  await expect(crop).not.toBeChecked();
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(panel).toBeVisible();
});
