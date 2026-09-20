import { expect, test, screenshotPath } from "./fixtures";

test("reorders groups from the top tabs and keeps Other fixed last", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop group sorting assertion");
  await page.setViewportSize({ width: 1440, height: 1000 });

  const searchTab = page.locator('[data-group-drop-id="search"]');
  const designTab = page.locator('[data-group-drop-id="design"]');
  const start = await searchTab.boundingBox();
  const target = await designTab.boundingBox();
  if (!start || !target) throw new Error("Group tabs are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 9, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 10,
  });
  await page.mouse.up();

  const groupOrder = () =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return state.groups
        .filter((group: { workspace?: string }) => group.workspace !== "github")
        .slice()
        .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
        .map((group: { id: string }) => group.id);
    });
  await expect.poll(async () => (await groupOrder()).slice(0, 3)).toEqual([
    "develop",
    "design",
    "search",
  ]);
  expect((await groupOrder()).at(-1)).toBe("other");

  await page.reload();
  await expect.poll(async () => (await groupOrder()).slice(0, 3)).toEqual([
    "develop",
    "design",
    "search",
  ]);
});

test("reflows horizontal group tabs at the boundary before drop", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop group preview assertion");
  await page.setViewportSize({ width: 1440, height: 1000 });

  const searchTab = page.locator('[data-group-sort-tab-id="search"]');
  const developTab = page.locator('[data-group-sort-tab-id="develop"]');
  const designTab = page.locator('[data-group-sort-tab-id="design"]');
  const start = await searchTab.boundingBox();
  const boundary = await developTab.boundingBox();
  const developBefore = await developTab.boundingBox();
  const designBefore = await designTab.boundingBox();
  if (!start || !boundary || !developBefore || !designBefore) {
    throw new Error("Group tabs are not visible");
  }

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 9, start.y + start.height / 2);
  await expect(searchTab).toHaveClass(/is-group-sorting/);
  await expect(page.getByTestId("group-sort-horizontal-drag-preview")).toBeVisible();

  await page.mouse.move(boundary.x - 1, boundary.y + boundary.height / 2);
  expect((await developTab.boundingBox())?.x).toBeCloseTo(developBefore.x, 0);
  await page.mouse.move(boundary.x + 1, boundary.y + boundary.height / 2);

  await expect
    .poll(async () => (await developTab.boundingBox())?.x ?? developBefore.x)
    .toBeLessThan(developBefore.x - 4);
  const designDuring = await designTab.boundingBox();
  expect(designDuring?.x).toBeCloseTo(designBefore.x, 0);
  await page.keyboard.press("Escape");
  await expect
    .poll(async () =>
      Math.abs(((await developTab.boundingBox())?.x ?? -1000) - developBefore.x),
    )
    .toBeLessThanOrEqual(2);

  const order = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.groups
      .filter((group: { workspace?: string }) => group.workspace !== "github")
      .slice()
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
      .map((group: { id: string }) => group.id);
  });
  expect(order.slice(0, 3)).toEqual(["search", "develop", "design"]);
});

test("cancels a group drag when the browser window loses focus", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop group drag assertion");
  const searchTab = page.locator('[data-group-sort-tab-id="search"]');
  const start = await searchTab.boundingBox();
  if (!start) throw new Error("Group tab is not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 9, start.y + start.height / 2);
  await expect(page.getByTestId("group-sort-horizontal-drag-preview")).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`group-drag-focus-loss-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByTestId("group-sort-horizontal-drag-preview")).toBeHidden();
  await expect(searchTab).not.toHaveClass(/is-group-sorting/);
  await page.mouse.up();
});

test("previews and commits group sorting with the keyboard", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop keyboard sorting assertion");
  const searchTab = page.locator('[data-group-sort-tab-id="search"]');
  await searchTab.focus();
  await page.keyboard.press("Space");
  await expect(searchTab).toHaveClass(/is-group-sorting/);
  await expect(page.getByTestId("group-sort-horizontal-drag-preview")).toBeVisible();
  // KeyboardSensor installs its keydown listener in a deferred task, and
  // sortable coordinates need the following layout measurement. A class
  // change alone does not mean the next keyboard event can be handled yet.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("将搜索移动到设计之前", { exact: true })).toBeAttached();
  await page.keyboard.press("Space");

  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return state.groups
        .filter((group: { workspace?: string }) => group.workspace !== "github")
        .slice()
        .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
        .slice(0, 3)
        .map((group: { id: string }) => group.id);
    }),
  ).toEqual(["develop", "search", "design"]);
});

test("updates live group reflow while the tab bar auto-scrolls", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop edge auto-scroll assertion");
  await page.setViewportSize({ width: 900, height: 900 });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("site-hub:v1")))
    .not.toBeNull();
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    const ordinary = state.groups.filter(
      (group: { isProtected: boolean; workspace?: string }) =>
        group.workspace !== "github" && !group.isProtected,
    );
    const githubGroups = state.groups.filter(
      (group: { workspace?: string }) => group.workspace === "github",
    );
    const other = state.groups.find(
      (group: { id: string }) => group.id === "other",
    );
    const now = new Date().toISOString();
    const extras = Array.from({ length: 12 }, (_, index) => ({
      id: `sort-edge-${index}`,
      name: `排序边缘 ${index + 1}`,
      icon: "folder",
      isProtected: false,
      workspace: "main",
      order: ordinary.length + index,
      createdAt: now,
      updatedAt: now,
    }));
    state.groups = [
      ...ordinary,
      ...extras,
      { ...other, order: ordinary.length + extras.length },
      ...githubGroups,
    ];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const tabs = page.locator(".category-tabs");
  const searchTab = page.locator('[data-group-sort-tab-id="search"]');
  const start = await searchTab.boundingBox();
  const tabsBox = await tabs.boundingBox();
  if (!start || !tabsBox) throw new Error("Scrollable group tabs are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 9, start.y + start.height / 2);
  await page.mouse.move(
    tabsBox.x + tabsBox.width - 4,
    tabsBox.y + tabsBox.height / 2,
    { steps: 16 },
  );
  await expect.poll(() => tabs.evaluate((element) => element.scrollLeft)).toBeGreaterThan(120);
  await expect(page.getByTestId("group-sort-horizontal-drag-preview")).toBeVisible();
  await page.mouse.up();

  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return state.groups
        .filter((group: { workspace?: string }) => group.workspace !== "github")
        .slice()
        .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
        .findIndex((group: { id: string }) => group.id === "search");
    }),
  ).toBeGreaterThan(0);
});

test("reorders group rows and inserts a new group between rows", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop grouped sorting assertion");
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const designHeader = page.locator('.grouped-site-header-main[data-group-sort-handle="true"]', {
    hasText: "设计",
  });
  const searchHeader = page.locator('.grouped-site-header-main[data-group-sort-handle="true"]', {
    hasText: "搜索",
  });
  const start = await designHeader.boundingBox();
  const target = await searchHeader.boundingBox();
  if (!start || !target) throw new Error("Grouped row headers are not visible");

  await page.mouse.move(start.x + 90, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 90, start.y + start.height / 2 - 9);
  await page.mouse.move(target.x + 90, target.y + target.height / 2, {
    steps: 12,
  });
  await page.mouse.up();

  const orderedGroupIds = () =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return state.groups
        .filter((group: { workspace?: string }) => group.workspace !== "github")
        .slice()
        .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
        .map((group: { id: string }) => group.id);
    });
  await expect.poll(async () => (await orderedGroupIds()).slice(0, 3)).toEqual([
    "design",
    "search",
    "develop",
  ]);

  await page.waitForTimeout(180);
  await expect(page.getByText("在此添加分组")).toHaveCount(0);
  const searchAdd = page.getByRole("button", {
    name: "在 搜索 附近添加分组",
  });
  await expect(searchAdd).toHaveCSS("opacity", "0");
  await searchHeader.hover();
  await expect(searchAdd).toHaveCSS("opacity", "1");
  await searchAdd.click();
  await page.getByRole("menuitem", { name: "在“搜索”前添加" }).click();
  const dialog = page.getByRole("dialog", { name: "新建分组" });
  await expect(dialog).toContainText("创建在“搜索”之前");
  await dialog.getByLabel("分组名称").fill("中间分组");
  await dialog.getByRole("button", { name: "创建分组" }).click();
  await expect(page.getByRole("tab", { name: /全部/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "中间分组", level: 3 })).toBeVisible();
  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return state.groups
        .filter((group: { workspace?: string }) => group.workspace !== "github")
        .slice()
        .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
        .slice(0, 3)
        .map((group: { name: string }) => group.name);
    }),
  ).toEqual(["设计", "中间分组", "搜索"]);
});

test("keeps group Add discoverable on touch and limits Other to before", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "chromium") {
    await page.setViewportSize({ width: 1752, height: 1080 });
  }
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const searchAdd = page.getByRole("button", {
    name: "在 搜索 附近添加分组",
  });
  await expect(searchAdd).toHaveText("");
  const searchSection = page.locator('[data-group-sort-section-id="search"]');
  const searchIcon = searchSection.locator(".grouped-site-icon");
  const [sectionBox, addBox, iconBox] = await Promise.all([
    searchSection.boundingBox(),
    searchAdd.boundingBox(),
    searchIcon.boundingBox(),
  ]);
  expect(sectionBox).not.toBeNull();
  expect(addBox).not.toBeNull();
  expect(iconBox).not.toBeNull();
  expect(addBox!.x).toBeGreaterThan(iconBox!.x + iconBox!.width);
  expect(addBox!.x + addBox!.width).toBeLessThan(sectionBox!.x + sectionBox!.width);
  expect(Math.abs(addBox!.y + addBox!.height / 2 - iconBox!.y - iconBox!.height / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(iconBox!.x - sectionBox!.x)).toBeLessThanOrEqual(1);
  if (testInfo.project.name === "mobile") {
    await expect(searchAdd).toHaveCSS("opacity", "1");
  } else {
    await expect(searchAdd).toHaveCSS("opacity", "0");
    await page.mouse.move(sectionBox!.x + sectionBox!.width / 2, addBox!.y + addBox!.height / 2);
    await expect(searchAdd).toHaveCSS("opacity", "0");
    await page.mouse.move(
      addBox!.x + addBox!.width / 2,
      addBox!.y + addBox!.height / 2,
      { steps: 1 },
    );
    await expect(searchAdd).toHaveCSS("opacity", "1");
  }
  await expect(searchAdd).toHaveCSS("border-radius", "8px");
  await expect(searchAdd).toHaveCSS("box-shadow", "none");
  await searchAdd.click();
  await expect(
    page.getByRole("menuitem", { name: "在“搜索”前添加" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "在“搜索”后添加" }),
  ).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`group-add-menu-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.keyboard.press("Escape");

  const otherAdd = page.getByRole("button", {
    name: "在 其他 附近添加分组",
  });
  if (testInfo.project.name !== "mobile") {
    await page.locator('[data-group-sort-section-id="other"] .grouped-site-header-main').hover();
  }
  await otherAdd.click();
  await expect(
    page.getByRole("menuitem", { name: "在“其他”前添加" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "在“其他”后添加" }),
  ).toHaveCount(0);
});

test("ignores Space and Enter on grouped section headers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop keyboard regression assertion");
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  const headerMain = page.locator(
    '[data-group-sort-section-id="design"] .grouped-site-header-main',
  );
  await expect(headerMain).toHaveCSS("user-select", "none");
  await expect(headerMain).toHaveCSS("cursor", "grab");
  await page.screenshot({
    path: screenshotPath(`grouped-header-no-text-selection-${testInfo.project.name}.png`),
    fullPage: true,
  });
  const header = page.locator(
    '[data-group-sort-section-id="design"] .grouped-site-header',
  );
  await header.click({ position: { x: 70, y: 15 } });
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("group-sort-vertical-drag-preview")).toHaveCount(0);
  await expect(page.locator(".grouped-site-section.is-group-sorting")).toHaveCount(0);
  await expect(header).not.toHaveAttribute("tabindex", /.+/);
});

test("reflows vertical group sections at the boundary before drop", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop group preview assertion");
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const developSection = page.locator('[data-group-sort-section-id="develop"]');
  const designSection = page.locator('[data-group-sort-section-id="design"]');
  const designHeader = designSection.locator(
    '.grouped-site-header-main[data-group-sort-handle="true"]',
  );
  const previous = await developSection.boundingBox();
  const designBefore = await designSection.boundingBox();
  const source = await designHeader.boundingBox();
  const developBefore = await developSection.boundingBox();
  if (!previous || !designBefore || !source || !developBefore) {
    throw new Error("Grouped sections are not visible");
  }

  await page.mouse.move(source.x + 90, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 90, source.y + source.height / 2 - 9);
  await expect(designSection).toHaveClass(/is-group-sorting/);
  await expect(designSection.locator(".grouped-site-header")).toHaveCSS(
    "opacity",
    "0.68",
  );
  await expect(designSection).toHaveCSS("border-radius", "5px");
  await expect(designSection).toHaveCSS("outline-offset", "8px");
  await expect(page.getByTestId("group-sort-vertical-drag-preview")).toBeVisible();

  await page.mouse.move(source.x + 90, previous.y + previous.height + 1);
  expect((await developSection.boundingBox())?.y).toBeCloseTo(developBefore.y, 0);
  await page.mouse.move(source.x + 90, previous.y + previous.height - 1);

  await expect
    .poll(async () => (await developSection.boundingBox())?.y ?? developBefore.y)
    .toBeGreaterThan(developBefore.y + 4);
  await expect
    .poll(async () => (await designSection.boundingBox())?.y ?? designBefore.y)
    .toBeLessThan(designBefore.y - 4);
  await page.mouse.move(source.x + 90, source.y + source.height / 2);
  await expect
    .poll(async () => Math.round((await developSection.boundingBox())?.y ?? -1))
    .toBe(Math.round(developBefore.y));
  await page.keyboard.press("Escape");
});

test("fills the grouped drag source inside its dashed outline", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop group surface screenshot");
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const designSection = page.locator('[data-group-sort-section-id="design"]');
  const designHeader = designSection.locator(
    '.grouped-site-header-main[data-group-sort-handle="true"]',
  );
  const source = await designHeader.boundingBox();
  if (!source) throw new Error("Grouped section is not visible");

  await page.mouse.move(source.x + 90, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 90, source.y + source.height / 2 - 9);
  await expect(designSection).toHaveClass(/is-group-sorting/);
  await expect(designSection).toHaveCSS("border-radius", "5px");
  await expect(designSection).toHaveCSS("outline-offset", "8px");
  await expect(designSection).toHaveCSS("background-color", /rgb/);
  await page.screenshot({
    path: screenshotPath(`group-drag-section-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
});

test("moves non-contiguous selected groups as one ordered block", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop group batch drag assertion");
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const searchSection = page.locator('[data-group-sort-section-id="search"]');
  const designSection = page.locator('[data-group-sort-section-id="design"]');
  const mediaSection = page.locator('[data-group-sort-section-id="media"]');
  await searchSection.getByRole("button", { name: "多选 搜索 网站" }).click();
  await searchSection.getByRole("heading", { level: 3, name: "搜索" }).click();
  await designSection.getByRole("heading", { level: 3, name: "设计" }).click();
  await expect(
    searchSection.locator(".grouped-site-header-main"),
  ).toHaveClass(/is-sortable/);
  await expect(
    searchSection.getByRole("button", { name: "全选 搜索 网站" }),
  ).toHaveText("全选");

  const source = await searchSection.locator(".grouped-site-header-main").boundingBox();
  const target = await mediaSection.locator(".grouped-site-header-main").boundingBox();
  if (!source || !target) throw new Error("Selected group drag targets are not visible");
  await page.mouse.move(source.x + 48, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 48, source.y + source.height / 2 + 9);
  await expect(page.getByTestId("group-sort-vertical-drag-preview")).toContainText(
    "2 个分组",
  );
  await page.mouse.move(target.x + 48, target.y + target.height / 2, { steps: 16 });
  await page.mouse.up();

  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return state.groups
        .filter((group: { workspace?: string }) => group.workspace !== "github")
        .slice()
        .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
        .map((group: { id: string }) => group.id);
    }),
  ).toEqual(["develop", "media", "search", "design", "learn", "other"]);
  await expect(page.getByRole("button", { name: "多选 搜索 网站" })).toBeVisible();
});

test("keeps selected groups when a drag is released outside the sorting corridor", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop mouse sorting corridor assertion");
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  const search = page.locator('[data-group-sort-section-id="search"]');
  const design = page.locator('[data-group-sort-section-id="design"]');
  await search.getByRole("heading", { level: 3, name: "搜索" }).dblclick();
  await design.getByRole("heading", { level: 3, name: "设计" }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).groups);
  const handle = search.locator(".grouped-site-header-main");
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  if (!source) throw new Error("Selected group header is not visible");
  await page.mouse.move(source.x + 48, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 48, source.y + source.height / 2 + 9);
  const preview = page.getByTestId("group-sort-vertical-drag-preview");
  await expect(preview).toContainText("2 个分组");
  await page.mouse.move(5, source.y + source.height / 2, { steps: 10 });
  await page.screenshot({ path: screenshotPath("group-selection-no-target-during.png") });
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(search).not.toHaveClass(/is-group-sorting/);
  await expect(search).toHaveClass(/is-group-selected/);
  await expect(design).toHaveClass(/is-group-selected/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).groups)).toEqual(before);
  await page.screenshot({ path: screenshotPath("group-selection-no-target-after.png") });
  await page.keyboard.press("Escape");
  await expect(page.locator(".is-group-selected")).toHaveCount(0);
});

test("selects one group's sites and switches directly between site and group modes", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const searchSection = page.locator('[data-group-sort-section-id="search"]');
  const designSection = page.locator('[data-group-sort-section-id="design"]');
  await searchSection.getByRole("button", { name: "多选 搜索 网站" }).click();
  await expect(
    searchSection.getByRole("button", { name: "全选 搜索 网站" }),
  ).toHaveText("全选");
  await page.screenshot({
    path: screenshotPath(`selection-mode-sites-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await expect(page.getByRole("button", { name: "选择 Google" })).toBeVisible();
  await expect(page.locator(".group-selection-trigger")).toHaveCount(6);
  await expect(searchSection.getByRole("button", { name: "管理 搜索 分组" })).toBeDisabled();
  await expect(
    searchSection.getByTestId("site-card-google").getByRole("button", { name: "编辑 Google" }),
  ).toBeDisabled();
  await expect(
    searchSection.getByTestId("site-card-google").getByRole("button", { name: "删除 Google" }),
  ).toBeDisabled();
  await searchSection.getByRole("button", { name: "全选 搜索 网站" }).click();
  await expect(
    searchSection.getByRole("button", { name: "取消全选 搜索 网站" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "取消选择 Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "取消选择 Bing" })).toBeVisible();

  await searchSection.getByRole("button", { name: "取消全选 搜索 网站" }).click();
  await expect(searchSection.getByRole("button", { name: "全选 搜索 网站" })).toBeVisible();
  await page.getByTestId("site-card-google").click();
  await expect(page.getByRole("button", { name: "取消选择 Google" })).toBeVisible();

  await searchSection.getByRole("heading", { level: 3, name: "搜索" }).click();
  await expect(page.locator(".site-selection-toggle")).toHaveCount(0);
  await expect(searchSection).toHaveClass(/is-group-selected/);
  await expect
    .poll(() =>
      searchSection.evaluate((section) => {
        const header = section.querySelector<HTMLElement>(
          ".grouped-site-header-main",
        );
        const style = getComputedStyle(section);
        const headerStyle = header ? getComputedStyle(header) : null;
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          headerOutlineStyle: headerStyle?.outlineStyle ?? "missing",
        };
      }),
    )
    .toEqual({
      outlineStyle: "dashed",
      outlineWidth: "2px",
      headerOutlineStyle: "none",
    });
  await expect
    .poll(() =>
      searchSection.evaluate((section) => getComputedStyle(section).backgroundColor),
    )
    .not.toBe("rgba(0, 0, 0, 0)");
  await expect(searchSection).toHaveCSS("border-radius", "5px");
  await expect(searchSection).toHaveCSS("outline-offset", "8px");
  await expect
    .poll(() => searchSection.evaluate((section) => getComputedStyle(section).boxShadow))
    .not.toContain("inset");
  await expect(
    searchSection.getByRole("button", { name: "取消选择 搜索 分组" }),
  ).toBeVisible();
  await expect(
    designSection.getByRole("button", { name: "选择 设计 分组" }),
  ).toBeVisible();
  await expect(
    searchSection.getByRole("button", { name: "全选 搜索 网站" }),
  ).toHaveText("全选");
  await expect(searchSection.getByRole("button", { name: "管理 搜索 分组" })).toBeDisabled();
  await expect(
    searchSection.getByTestId("site-card-google").getByRole("button", { name: "编辑 Google" }),
  ).toBeDisabled();
  await expect(
    searchSection.getByTestId("site-card-google").getByRole("button", { name: "删除 Google" }),
  ).toBeDisabled();
  await expect(
    searchSection.getByTestId("site-card-google").locator(".site-card-full-link"),
  ).toHaveAttribute("aria-label", "选择 Google");
  await expect(
    searchSection.getByTestId("site-card-google").locator(".site-card-full-link"),
  ).not.toHaveAttribute("aria-disabled");
  await page.screenshot({
    path: screenshotPath(`selection-mode-groups-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.getByTestId("site-card-google").click();
  await expect(searchSection).not.toHaveClass(/is-group-selected/);
  await expect(
    page.getByRole("button", { name: "取消选择 Google" }),
  ).toBeVisible();

  await designSection.getByRole("heading", { level: 3, name: "设计" }).click();
  await expect(designSection).toHaveClass(/is-group-selected/);
  await expect(page.locator(".site-selection-toggle")).toHaveCount(0);
  await designSection.getByRole("button", { name: "全选 设计 网站" }).click();
  await expect(designSection).not.toHaveClass(/is-group-selected/);
  await expect(
    designSection.getByRole("button", { name: "取消全选 设计 网站" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "取消选择 Figma" })).toBeVisible();
  await page.locator("main.page-container").click({ position: { x: 5, y: 5 } });
  await expect(designSection).not.toHaveClass(/is-group-selected/);
  await expect(page.getByRole("button", { name: "多选 搜索 网站" })).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`selection-mode-switch-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("double-clicking a grouped title enters group multi-select", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const searchSection = page.locator('[data-group-sort-section-id="search"]');
  await searchSection.getByRole("heading", { level: 3, name: "搜索" }).dblclick();

  await expect(searchSection).toHaveClass(/is-group-selected/);
  await expect(
    searchSection.getByRole("button", { name: "取消选择 搜索 分组" }),
  ).toBeVisible();
  await expect(
    searchSection.getByRole("button", { name: "全选 搜索 网站" }),
  ).toHaveText("全选");
  await page.screenshot({
    path: screenshotPath(`selection-double-click-groups-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
