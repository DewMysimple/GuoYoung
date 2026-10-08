import { expect, test, screenshotPath } from "./fixtures";

for (const theme of ["light", "dark"] as const) for (const wallpaper of [false, true]) {
  test(`manager uses theme controls and contains scrolling (${theme}, wallpaper ${wallpaper})`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "Desktop manager scrolling and material");
    await page.setViewportSize({ width: 1440, height: 900 });
    const wallpaperUrl = "https://manager.example/background.svg";
    await page.route(wallpaperUrl, route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="#69839e"/></svg>' }));
    await page.evaluate(({ theme, wallpaper, wallpaperUrl }) => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      state.appearance.theme = theme;
      state.wallpaper = { ...state.wallpaper, source: wallpaper ? "url" : "none", url: wallpaperUrl };
      state.groups.push(...Array.from({ length: 24 }, (_, i) => ({ ...state.groups[0], id: `extra-${i}`, name: `测试分组 ${i}`, icon: "folder", order: i + 10 })));
      state.sites = Array.from({ length: 12 }, (_, i) => state.sites.map((site: { id: string }) => ({ ...site, id: `${site.id}-${i}` }))).flat();
      localStorage.setItem("site-hub:v1", JSON.stringify(state));
    }, { theme, wallpaper, wallpaperUrl });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.evaluate(() => window.scrollTo(0, 100));
    await page.getByRole("button", { name: "管理分组", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "管理分组" });
    await expect(dialog.locator(":scope > .dialog-footer")).toHaveCSS("border-top-width", "0px");
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBe(100);
    const originalGeometry = await page.locator(".app-shell").boundingBox();
    for (const selector of [".group-manager-list", ".group-manager-editor"]) {
      const scroll = dialog.locator(selector);
      expect(await scroll.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100);
      await scroll.hover();
      await page.mouse.wheel(0, 200);
      await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      for (const bottom of [true, false]) {
        await scroll.evaluate((el, bottom) => { el.scrollTop = bottom ? el.scrollHeight : 0; }, bottom);
        for (let i = 0; i < 3; i++) await page.mouse.wheel(0, bottom ? 600 : -600);
        await page.waitForTimeout(150);
        expect(await page.evaluate(() => window.scrollY)).toBe(before);
      }
      // Native text selection must not relax the modal's scrolling boundary.
      await scroll.evaluate(el => {
        el.scrollTop = el.scrollHeight;
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
      await page.evaluate(() => window.getSelection()?.removeAllRanges());
      await expect(scroll).toHaveCSS("scrollbar-width", "thin");
      await expect(scroll).toHaveCSS("overscroll-behavior-y", "contain");
    }
    // A modal also locks the actual document scroller, including keyboard scrolling.
    await expect(page.locator("html")).toHaveCSS("overflow-y", "hidden");
    await dialog.getByRole("heading", { name: "管理分组" }).focus();
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    expect((await page.locator(".app-shell").boundingBox())?.x).toBe(originalGeometry?.x);
    const remove = dialog.locator(".group-editor-delete");
    if (wallpaper) {
      const fill = await dialog.getByRole("button", { name: "导入资源" }).evaluate(el => getComputedStyle(el).backgroundColor);
      await expect(remove).toHaveCSS("background-color", fill);
    }
    await remove.click();
    await expect(remove).toHaveAttribute("aria-label", "再次点击删除这个分组");
    await expect(remove).toHaveCSS("background-color", "rgb(179, 58, 70)");
    await dialog.getByLabel("分组名称").click();
    await expect(remove).toHaveAttribute("aria-label", "删除这个分组");
    await page.screenshot({ path: screenshotPath(`group-manager-theme-${theme}-${wallpaper}.png`) });
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
    await page.mouse.move(1410, 800);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  });
}

test("creates a group, selects it, and keeps it after refresh", async ({ page }) => {
  await page.getByRole("button", { name: "新建分组" }).click();
  const dialog = page.getByRole("dialog", { name: "新建分组" });
  const overlay = page.locator(".group-dialog-overlay");
  await expect(overlay).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(overlay).toHaveCSS("backdrop-filter", "none");
  const dialogChrome = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflowY: style.overflowY,
      borderRadius: Number.parseFloat(style.borderRadius),
    };
  });
  expect(dialogChrome.overflowY).toBe("hidden");
  expect(dialogChrome.borderRadius).toBeGreaterThan(0);
  await expect(dialog.locator(".new-group-dialog-scroll")).toBeVisible();
  await dialog.getByLabel("分组名称").fill("工作");
  await dialog
    .locator("label.group-icon-choice")
    .filter({ hasText: "工作" })
    .click();
  await dialog.getByRole("button", { name: "创建分组" }).click();

  await expect(page.getByRole("tab", { name: /工作/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.reload();
  await expect(page.getByRole("tab", { name: /工作/ })).toBeVisible();
});

test("opens group management without automatic help and supports every entry", async ({
  page,
}, testInfo) => {
  const manageButton = page.getByRole("button", { name: "管理分组", exact: true });
  await manageButton.click();
  let dialog = page.getByRole("dialog", { name: "管理分组" });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: screenshotPath(`group-manager-initial-focus-${testInfo.project.name}.png`) });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(dialog.getByRole("heading", { name: "管理分组", exact: true })).toBeFocused();
  const help = dialog.getByRole("button", { name: "管理分组说明" });
  await page.keyboard.press("Tab");
  await expect(help).toBeFocused();
  await expect(page.getByRole("tooltip")).toContainText("点击名称编辑");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await help.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await dialog.getByRole("button", { name: "返回收藏主页" }).click();
  await expect(dialog).toHaveCount(0);
  await manageButton.focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("heading", { name: "管理分组", exact: true })).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const designTab = page.locator('[data-group-drop-id="design"]');
  await designTab.scrollIntoViewIfNeeded();
  const tabBox = await designTab.boundingBox();
  if (!tabBox) throw new Error("Design group tab is not visible");

  await designTab.dispatchEvent("pointerdown", {
    button: 0,
    pointerId: 17,
    pointerType: "touch",
    clientX: tabBox.x + tabBox.width / 2,
    clientY: tabBox.y + tabBox.height / 2,
  });
  await page.waitForTimeout(460);
  dialog = page.getByRole("dialog", { name: "管理分组" });
  await expect(dialog.getByLabel("分组名称")).toHaveValue("设计");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "返回收藏主页" })).toBeVisible();
  await expect(page.locator(".group-dialog-overlay")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".group-dialog-overlay")).toHaveCSS(
    "backdrop-filter",
    "none",
  );
  const iconGrid = dialog.locator(".manager-icon-grid");
  await expect(iconGrid.locator("label.group-icon-choice")).toHaveCount(48);
  const iconGridSize = await iconGrid.evaluate((element) => {
    const gridRect = element.getBoundingClientRect();
    const editorRect = element
      .closest(".group-manager-editor")!
      .getBoundingClientRect();
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      gridBottom: gridRect.bottom,
      editorBottom: editorRect.bottom,
    };
  });
  expect(iconGridSize.scrollHeight).toBeLessThanOrEqual(
    iconGridSize.clientHeight + 1,
  );
  expect(iconGridSize.columns).toBe((page.viewportSize()?.width ?? 0) <= 480 ? 4 : 6);
  const editor = dialog.locator(".group-manager-editor");
  if ((page.viewportSize()?.width ?? 0) > 480) {
    await expect
      .poll(() => editor.evaluate((element) => element.scrollHeight > element.clientHeight))
      .toBe(true);
    await editor.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      dialog.locator("label.group-icon-choice").filter({ hasText: "研究" }),
    ).toBeVisible();
  } else {
    expect(iconGridSize.gridBottom).toBeLessThanOrEqual(iconGridSize.editorBottom + 1);
  }
  const deleteBox = await dialog
    .getByRole("button", { name: "删除这个分组" })
    .boundingBox();
  const iconGridBox = await iconGrid.boundingBox();
  if (!deleteBox || !iconGridBox) throw new Error("Group manager controls are not visible");
  expect(deleteBox.y).toBeLessThan(iconGridBox.y);
  await designTab.dispatchEvent("pointermove", {
    button: 0,
    pointerId: 17,
    pointerType: "touch",
    clientX: tabBox.x + tabBox.width / 2 + 9,
    clientY: tabBox.y + tabBox.height / 2,
  });
  await expect(dialog).toBeHidden();
  await designTab.dispatchEvent("pointerup", {
    button: 0,
    pointerId: 17,
    pointerType: "touch",
  });

  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  await page.getByRole("button", { name: "管理 学习 分组" }).click();
  dialog = page.getByRole("dialog", { name: "管理分组" });
  await expect(dialog.getByLabel("分组名称")).toHaveValue("学习");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await dialog.getByRole("button", { name: "返回收藏主页" }).click();
  await expect(page.getByRole("dialog", { name: "管理分组" })).toHaveCount(0);
});

test("cancels a group manager drag when the browser window loses focus", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop group manager drag assertion");
  await page.getByRole("button", { name: "管理分组" }).click();
  const dialog = page.getByRole("dialog", { name: "管理分组" });
  const handle = dialog.getByRole("button", { name: "拖动 搜索" });
  const item = handle.locator("..");
  await expect(handle).toBeVisible();
  const transition = await item.evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(transition).not.toContain("transform");

  const box = await handle.boundingBox();
  if (!box) throw new Error("Group drag handle is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 16, {
    steps: 4,
  });
  await expect(item).toHaveClass(/is-dragging/);
  await expect(item).toHaveCSS("opacity", "0");
  await expect(page.locator(".group-list-item-drag-preview")).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(dialog.locator(".group-list-item.is-dragging")).toHaveCount(0);
  await page.mouse.up();
});

test("keeps the group manager drag handle safe from native touch scrolling", async ({
  page,
}) => {
  await page.getByRole("button", { name: "管理分组" }).click();
  const dialog = page.getByRole("dialog", { name: "管理分组" });
  const handle = dialog.getByRole("button", { name: "拖动 搜索" });

  await expect(handle).toHaveCSS("touch-action", "none");
  await expect(handle).toHaveCSS("user-select", "none");
});

test("keeps the manager overlay above dialog clipping and ignores the editor as a drop target", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop group manager drag assertion");
  await page.setViewportSize({ width: 1177, height: 960 });
  await page.getByRole("button", { name: "管理分组" }).click();
  const dialog = page.getByRole("dialog", { name: "管理分组" });
  const list = dialog.locator(".group-manager-list");
  const editor = dialog.locator(".group-manager-editor");
  const handle = dialog.getByRole("button", { name: "拖动 搜索" });
  const dialogBox = await dialog.boundingBox();
  const editorBox = await editor.boundingBox();
  const handleBox = await handle.boundingBox();
  if (!dialogBox || !editorBox || !handleBox) {
    throw new Error("Group manager geometry is unavailable");
  }
  const beforeOrder = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.groups
      .slice()
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
      .map((group: { id: string }) => group.id);
  });

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    editorBox.x + editorBox.width * 0.72,
    editorBox.y + editorBox.height / 2,
    { steps: 14 },
  );

  const preview = page.locator(".group-list-item-drag-preview");
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((element) => Boolean(element.closest('[role="dialog"]'))))
    .toBe(false);
  await page.mouse.move(
    dialogBox.x + dialogBox.width + 60,
    editorBox.y + editorBox.height / 2,
    { steps: 6 },
  );
  const previewBox = await preview.boundingBox();
  if (!previewBox) throw new Error("Group drag preview is not measurable");
  expect(previewBox.x + previewBox.width).toBeGreaterThan(
    dialogBox.x + dialogBox.width,
  );
  await page.screenshot({
    path: screenshotPath(`group-manager-editor-corridor-v1.1.51-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
        return state.groups
          .slice()
          .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
          .map((group: { id: string }) => group.id);
      }),
    )
    .toEqual(beforeOrder);
  await expect(list.locator(".group-list-item.is-dragging")).toHaveCount(0);
});

test("does not reorder when a touch drag enters the stacked manager editor", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile group manager drag assertion");
  await page.getByRole("button", { name: "管理分组" }).click();
  const dialog = page.getByRole("dialog", { name: "管理分组" });
  const scroll = dialog.locator(".group-dialog-scroll");
  const editor = dialog.locator(".group-manager-editor");
  const handle = dialog.getByRole("button", { name: "拖动 搜索" });
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Group drag handle is not visible");
  const beforeOrder = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.groups
      .slice()
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
      .map((group: { id: string }) => group.id);
  });

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const editorBox = await editor.boundingBox();
  if (!editorBox) throw new Error("Stacked manager editor is not measurable");
  await page.mouse.move(
    editorBox.x + editorBox.width / 2,
    editorBox.y + editorBox.height / 2,
    { steps: 14 },
  );
  await expect(page.locator(".group-list-item-drag-preview")).toBeVisible();
  await page.mouse.up();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
        return state.groups
          .slice()
          .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
          .map((group: { id: string }) => group.id);
      }),
    )
    .toEqual(beforeOrder);
});

test("keeps the manager list top boundary droppable outside the dialog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop group manager drag assertion");
  await page.setViewportSize({ width: 1177, height: 960 });
  await page.getByRole("button", { name: "管理分组" }).click();
  const dialog = page.getByRole("dialog", { name: "管理分组" });
  const list = dialog.locator(".group-manager-list");
  const handle = dialog.getByRole("button", { name: "拖动 影音" });
  const listBox = await list.boundingBox();
  const handleBox = await handle.boundingBox();
  if (!listBox || !handleBox) throw new Error("Group manager geometry is unavailable");

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y - 24,
    { steps: 8 },
  );
  await expect(page.locator(".group-list-item-drag-preview")).toBeVisible();

  // The pointer is deliberately above the list (the real failing path).
  // The first group must still be the live collision target.
  await page.mouse.move(listBox.x - 20, 40, { steps: 12 });
  await page.mouse.up();
  await expect(dialog.locator(".group-list-copy strong").first()).toHaveText("影音");
});

test("responds at the manager list top edge before leaving the dialog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop group manager drag assertion");
  await page.setViewportSize({ width: 1177, height: 960 });
  await page.getByRole("button", { name: "管理分组" }).click();
  const dialog = page.getByRole("dialog", { name: "管理分组" });
  const list = dialog.locator(".group-manager-list");
  const handle = dialog.getByRole("button", { name: "拖动 影音" });
  const listBox = await list.boundingBox();
  const handleBox = await handle.boundingBox();
  if (!listBox || !handleBox) throw new Error("Group manager geometry is unavailable");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 24, { steps: 8 });
  // The pointer is still inside the dialog, just inside the list's top
  // boundary. It should already resolve to the first sortable group.
  await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + 8, { steps: 12 });
  await page.screenshot({
    path: screenshotPath(`group-manager-top-edge-v1.1.49-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.mouse.up();
  await expect(dialog.locator(".group-list-copy strong").first()).toHaveText("影音");
});

test("imports a group resource package into the selected manager group", async ({
  page,
}) => {
  await page.getByRole("button", { name: "管理分组" }).click();
  const dialog = page.getByRole("dialog", { name: "管理分组" });
  await dialog.getByRole("button", { name: "导入资源" }).click();
  const payload = {
    format: "site-hub-group-export",
    exportVersion: 1,
    exportedAt: "2026-08-24T00:00:00.000Z",
    group: { name: "共享设计", icon: "pen-nib" },
    sites: [
      {
        name: "Shared Example",
        url: "https://shared-example.com",
        iconSource: "auto",
        order: 0,
      },
    ],
  };
  await page
    .locator('input[aria-label="选择要导入的数据文件"]')
    .setInputFiles({
      name: "shared-design.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(payload)),
    });
  await page.getByRole("button", { name: "预览并导入" }).click();
  const confirm = page.getByRole("alertdialog", { name: "导入分组资源？" });
  await expect(confirm).toContainText("新增 1 个");
  await confirm.getByRole("button", { name: "确认导入" }).click();
  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return state.sites.some(
        (site: { name: string; groupId: string }) =>
          site.name === "Shared Example" && site.groupId === "search",
      );
    }),
  ).toBe(true);
  await expect(page.getByRole("region", { name: "数据页面" })).toBeVisible();
});

test("deletes a group directly after two clicks and keeps its links in trash", async ({
  page,
}, testInfo) => {
  const learningTab = page.getByRole("tab", { name: /学习/ });
  await learningTab.click();
  await page.getByRole("button", { name: "管理分组" }).click();
  let manager = page.getByRole("dialog", { name: "管理分组" });
  await manager.getByRole("button", { name: /学习 2 个网站/ }).click();
  await manager.getByRole("button", { name: "删除这个分组" }).click();
  await expect(manager.getByRole("button", { name: "再次点击删除这个分组" })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.screenshot({
    path: screenshotPath(`group-delete-double-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await manager.getByRole("button", { name: "再次点击删除这个分组" }).click();
  await expect(manager).toBeHidden();

  await expect(page.getByRole("tab", { name: /全部/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("site-card-wikipedia")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("tab", { name: /学习/ })).toHaveCount(0);
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("tab", { name: "数据" }).click();
  await page.locator(".trash-settings-card").getByRole("button", { name: "查看" }).click();
  await expect(page.getByText("维基百科")).toBeVisible();
  await expect(page.locator(".trash-item").filter({ hasText: "学习" }).first()).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`trash-settings-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
