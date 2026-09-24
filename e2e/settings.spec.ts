import { expect, test, screenshotPath } from "./fixtures";

test("opens and expands the trash shortcut in settings", async ({
  page,
}, testInfo) => {
  await page.screenshot({
    path: screenshotPath(`trash-shortcut-topbar-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole("button", { name: "打开回收站" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog.getByRole("button", { name: "返回收藏主页" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "关闭设置" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /数据/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(dialog.getByText("链接回收站")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "收起" })).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`trash-shortcut-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("resizes the settings sidebar and previews layout changes live", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop resize assertion");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.waitForTimeout(300);

  const panel = page.getByRole("dialog", { name: "设置" });
  const handle = page.getByRole("separator", { name: "调整设置栏宽度" });
  const initialPanel = await panel.boundingBox();
  const handleBox = await handle.boundingBox();
  if (!initialPanel || !handleBox) {
    throw new Error("Resizable settings panel is not visible");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + 160,
  );
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 120, handleBox.y + 160, { steps: 8 });
  await page.mouse.up();

  const resizedPanel = await panel.boundingBox();
  expect(resizedPanel!.width).toBeGreaterThan(initialPanel.width + 100);

  await panel.getByRole("button", { name: "紧凑" }).click();
  await expect
    .poll(() =>
      page
        .locator(".app-shell")
        .evaluate((element) =>
          element.style.getPropertyValue("--card-min-width"),
        ),
    )
    .toBe("140px");
});

test("dismisses clean settings outside and warns before discarding changes", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "The mobile settings panel fills the viewport");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(page.getByRole("button", { name: "关闭设置" })).toBeVisible();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expect(page.getByRole("dialog", { name: "设置" })).toHaveCount(0);
  await page.getByRole("button", { name: "打开设置" }).click();
  const dismissLayer = page.getByTestId("settings-outside-dismiss-layer");
  await expect(dismissLayer).toBeVisible();
  await dismissLayer.click({ position: { x: 180, y: 210 } });
  await expect(page.getByRole("dialog", { name: "设置" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /全部/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: "名称与图标" }).click();
  await page.getByRole("textbox", { name: "品牌名称" }).fill("未保存品牌");
  await dismissLayer.click({ position: { x: 180, y: 210 } });
  const warning = page.getByRole("alertdialog", {
    name: "放弃未保存的设置？",
  });
  await expect(warning).toBeVisible();
  await page.screenshot({
    path: screenshotPath("settings-dirty-dismiss-chromium.png"),
    fullPage: true,
  });
  await warning.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByRole("textbox", { name: "品牌名称" })).toHaveValue(
    "未保存品牌",
  );

  await dismissLayer.click({ position: { x: 180, y: 210 } });
  await page
    .getByRole("alertdialog", { name: "放弃未保存的设置？" })
    .getByRole("button", { name: "放弃更改" })
    .click();
  await expect(page.getByRole("dialog", { name: "设置" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mysimple 首页" })).toBeVisible();
});

test("previews and persists a custom brand without changing the extension name", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop brand editor assertion");
  await page.route("https://example.test/brand.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#7c3aed"/><path d="M18 32h28M32 18v28" stroke="white" stroke-width="6"/></svg>',
    }),
  );

  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置" });
  await panel.getByRole("button", { name: "名称与图标" }).click();
  await panel.getByRole("textbox", { name: "品牌名称" }).fill("Studio North");
  await expect(page).toHaveTitle("Studio North · 网站收藏");
  await expect(page.getByRole("button", { name: "Studio North 首页" })).toBeVisible();

  await panel.getByRole("radio", { name: "网络地址" }).click();
  await panel.getByLabel("网络 Logo 地址").fill("https://example.test/brand.svg");
  await expect(page.locator(".topbar .brand-mark-custom img")).toBeVisible();

  await panel.getByRole("checkbox", { name: "显示 Logo" }).uncheck();
  await panel.getByRole("checkbox", { name: "显示品牌名称" }).uncheck();
  await expect(page.locator(".topbar .brand")).toHaveCount(0);

  await panel.getByRole("checkbox", { name: "显示品牌名称" }).check();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();

  await expect(page).toHaveTitle("Studio North · 网站收藏");
  await expect(page.getByRole("button", { name: "Studio North 首页" })).toBeVisible();
  await expect(page.locator(".topbar .brand-mark")).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("site-hub:v1")!),
  );
  expect(saved.version).toBe(16);
  expect(saved.brand).toMatchObject({
    name: "Studio North",
    showLogo: false,
    showName: true,
    logoSource: "url",
  });
});

test("preserves legacy custom geometry while narrow screens keep safe sizes", async ({
  page,
}, testInfo) => {
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("site-hub:v1")!);
    Object.assign(saved.appearance, { brandFontScale: 150, brandLogoSize: 62, siteIconSize: 60 });
    localStorage.setItem("site-hub:v1", JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置" });
  await expect(panel.getByText("保留自定义字号")).toBeVisible();
  await expect(panel.getByRole("slider")).toHaveCount(0);

  const shellValues = await page.locator(".app-shell").evaluate((element) => ({
    logoFont: element.style.getPropertyValue("--brand-font-scale"),
    logoSize: element.style.getPropertyValue("--brand-logo-size"),
    siteIconSize: element.style.getPropertyValue("--site-icon-size"),
  }));
  expect(shellValues).toEqual({
    logoFont: "1.5",
    logoSize: "62px",
    siteIconSize: "60px",
  });

  if (testInfo.project.name === "mobile") {
    await expect
      .poll(() =>
        page
          .locator(".topbar .brand-mark")
          .evaluate((element) => getComputedStyle(element).width),
      )
      .toBe("34px");
    await expect
      .poll(() =>
        page
          .locator(".site-card .favicon-large")
          .first()
          .evaluate((element) => getComputedStyle(element).width),
      )
      .toBe("38px");
  } else {
    await expect
      .poll(() =>
        page
          .locator(".topbar .brand-mark")
          .evaluate((element) => getComputedStyle(element).width),
      )
      .toBe("62px");
    await expect
      .poll(() =>
        page
          .locator(".site-card .favicon-large")
          .first()
          .evaluate((element) => getComputedStyle(element).width),
      )
      .toBe("60px");
  }
  await panel.getByRole("button", { name: "使用颜色 #00897b" }).click();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  expect(saved.appearance).toMatchObject({ brandFontScale: 150, brandLogoSize: 62, siteIconSize: 60, accentColor: "#00897b" });
});

test("drags and zooms wallpaper with live preview before saving", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop wallpaper canvas");
  await page.route("https://example.test/wallpaper.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#315ca8"/><circle cx="1200" cy="300" r="220" fill="#ffd38b"/></svg>',
    }),
  );
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.wallpaper = {
      source: "url",
      url: "https://example.test/wallpaper.svg",
      fit: "cover",
      positionX: 50,
      positionY: 50,
      zoom: 100,
      blur: 0,
      overlay: 22,
      topbarBlurEnabled: true,
      topbarBlur: 16,
      topbarOpacity: 68,
    };
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  await page.getByRole("button", { name: "打开设置" }).click();
  await page.locator(".settings-tabs [role='tab']").nth(1).click();
  await page.locator(".wallpaper-position-actions button").first().click();

  const canvas = page.locator(".wallpaper-edit-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("settings-outside-dismiss-layer")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Wallpaper edit canvas is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 120,
    box.y + box.height / 2 - 80,
    { steps: 8 },
  );
  await page.mouse.up();
  await canvas.hover();
  await page.mouse.wheel(0, -300);

  await expect
    .poll(() =>
      page
        .locator(".app-shell")
        .evaluate((element) =>
          element.style.getPropertyValue("--wallpaper-position-x"),
        ),
    )
    .not.toBe("50%");
  await expect
    .poll(() =>
      page
        .locator(".app-shell")
        .evaluate((element) =>
          element.style.getPropertyValue("--wallpaper-zoom"),
        ),
    )
    .not.toBe("1");

  await page.locator(".wallpaper-edit-hud button").last().click();
  await page.locator(".settings-footer .primary-button").click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("site-hub:v1")!),
  );
  expect(saved.wallpaper.positionX).not.toBe(50);
  expect(saved.wallpaper.positionY).not.toBe(50);
  expect(saved.wallpaper.zoom).toBeGreaterThan(100);
});

test("simplifies appearance choices and preserves preview, save, reload and reset boundaries", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  const presets = panel.getByRole("group", { name: "布局预设" });
  const reading = panel.getByRole("group", { name: "文字大小" });
  await expect(panel.getByRole("slider")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "名称与图标" })).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: screenshotPath(`appearance-overview-${testInfo.project.name}.png`), animations: "disabled" });

  await reading.getByRole("button", { name: "较大" }).click();
  await presets.getByRole("button", { name: "紧凑" }).click();
  await expect(reading.getByRole("button", { name: "较大" })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "使用颜色 #00897b" }).click();
  await panel.getByRole("button", { name: /布局微调/ }).focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("slider")).toHaveCount(5);
  await panel.getByRole("slider", { name: "卡片宽度" }).fill("210");
  await panel.getByRole("slider", { name: "卡片间距" }).fill("20");
  await expect(panel.getByText("已自定义", { exact: true })).toBeVisible();
  await expect(presets.locator('[aria-pressed="true"]')).toHaveCount(0);
  const beforeSave = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).appearance);
  expect(beforeSave).toMatchObject({ cardWidth: 160, gap: 12, fontScale: 100, accentColor: "#3367d6" });
  await page.screenshot({ path: screenshotPath(`appearance-details-${testInfo.project.name}.png`), animations: "disabled" });
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  expect(saved.appearance).toMatchObject({ cardWidth: 210, gap: 20, fontScale: 110, accentColor: "#00897b", layoutPreset: "custom" });

  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(panel.getByRole("slider")).toHaveCount(0);
  await panel.getByRole("button", { name: "名称与图标" }).click();
  await panel.getByRole("textbox", { name: "品牌名称" }).fill("我的书签");
  await panel.getByRole("button", { name: "恢复默认外观" }).click();
  await expect(panel.getByRole("textbox", { name: "品牌名称" })).toHaveValue("我的书签");
  await expect(presets.getByRole("button", { name: "标准" })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "取消" }).click();
  await expect(page).toHaveTitle("Mysimple · 网站收藏");
  const afterCancel = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  expect(afterCancel.appearance).toEqual(saved.appearance);
  expect(afterCancel.sites).toEqual(saved.sites);
});

test("keeps the color picker and brand errors usable inside the appearance drawer", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("button", { name: "自定义强调色" }).click();
  const picker = page.getByRole("dialog", { name: "选择自定义颜色" });
  await picker.scrollIntoViewIfNeeded();
  const panelBox = (await panel.boundingBox())!;
  const pickerBox = (await picker.boundingBox())!;
  const footerBox = (await panel.locator(".settings-footer").boundingBox())!;
  expect(pickerBox.x).toBeGreaterThanOrEqual(panelBox.x);
  expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
  expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(footerBox.y);
  await picker.getByRole("textbox", { name: "十六进制颜色" }).fill("b45309");
  await picker.getByRole("textbox", { name: "十六进制颜色" }).press("Enter");
  await page.screenshot({ path: screenshotPath(`appearance-color-${testInfo.project.name}.png`), animations: "disabled" });
  await panel.getByRole("button", { name: "自定义强调色" }).click();
  await panel.getByRole("button", { name: "名称与图标" }).click();
  await panel.getByRole("textbox", { name: "品牌名称" }).fill(" ");
  await panel.getByRole("button", { name: "名称与图标" }).click();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await expect(panel.getByRole("alert")).toHaveText("请输入品牌名称");
  await expect(panel.getByRole("textbox", { name: "品牌名称" })).toBeVisible();
  await panel.getByRole("button", { name: "恢复默认品牌" }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await panel.locator('.brand-settings-fields input[type="file"]').setInputFiles({
    name: "personal-logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="24" fill="#b45309"/><path d="M32 64h64M64 32v64" stroke="white" stroke-width="12"/></svg>'),
  });
  await expect(panel.getByRole("radio", { name: "本地图片", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(panel.locator(".brand-settings-summary img")).toBeVisible();
  await page.screenshot({ path: screenshotPath(`appearance-brand-${testInfo.project.name}.png`), animations: "disabled" });
  await panel.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  expect(saved.appearance.accentColor).toBe("#b45309");
  expect(saved.brand.name).toBe("Mysimple");
  expect(saved.brand.logoSource).toBe("local");
  expect(saved.brand.logoDataUrl).toMatch(/^data:image\//);
});
