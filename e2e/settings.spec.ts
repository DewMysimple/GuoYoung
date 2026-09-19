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
  await expect(page.getByRole("button", { name: "返回收藏主页" })).toBeVisible();
  await page.getByRole("button", { name: "返回收藏主页" }).click();
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
  expect(saved.version).toBe(15);
  expect(saved.brand).toMatchObject({
    name: "Studio North",
    showLogo: false,
    showName: true,
    logoSource: "url",
  });
});

test("applies advanced controls live while narrow screens keep safe geometry", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置" });
  await panel.getByRole("button", { name: /高级微调/ }).click();
  await panel.getByRole("tab", { name: "品牌" }).click();
  await panel.getByRole("slider", { name: "Logo 字号" }).fill("150");
  await panel.getByRole("slider", { name: "品牌 Logo 框尺寸" }).fill("62");
  await panel.getByRole("tab", { name: "卡片" }).click();
  await panel.getByRole("slider", { name: "网站图标框尺寸" }).fill("60");

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
