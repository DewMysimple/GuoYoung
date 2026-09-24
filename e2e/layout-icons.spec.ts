import { expect, test, screenshotPath } from "./fixtures";

test("keeps grouped selection controls inside the viewport", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  const first = page.locator('[data-group-sort-section-id="search"]');
  await first.getByRole("heading", { name: "搜索", exact: true }).dblclick();
  const selector = first.locator(".group-selection-trigger");
  await expect(selector).toBeVisible();
  const bounds = await selector.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(2);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await selector.click();
  await expect(first).not.toHaveClass(/is-group-selected/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotPath(`group-selector-in-bounds-${testInfo.project.name}.png`), fullPage: true, animations: "disabled" });
});

test("fits topbar actions beside settings at intermediate window sizes", async ({ page }, testInfo) => {
  for (const width of [900, 1000, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "打开设置" }).click();
    await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const header = document.querySelector(".topbar")!.getBoundingClientRect();
      const panel = document.querySelector(".settings-panel")!.getBoundingClientRect();
      return Math.abs(header.right - panel.left);
    })).toBeLessThan(1);
    const geometry = await page.locator(".topbar-inner").evaluate((header) => {
      const buttons = [...header.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.offsetWidth > 0);
      return { right: header.getBoundingClientRect().right, buttons: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x, right: rect.right, height: rect.height };
      }) };
    });
    for (const [index, button] of geometry.buttons.entries()) {
      expect(button.height).toBeLessThanOrEqual(48);
      expect(button.right).toBeLessThanOrEqual(geometry.right);
      if (index) expect(button.x).toBeGreaterThanOrEqual(geometry.buttons[index - 1].right - 1);
    }
    await page.screenshot({ path: screenshotPath(`settings-header-${width}-${testInfo.project.name}.png`), animations: "disabled" });
    await page.getByRole("button", { name: "关闭设置" }).click();
  }
});

test("selects a brand icon for one site and keeps it after refresh", async ({
  page,
}) => {
  await page.getByRole("button", { name: "编辑 哔哩哔哩" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑网站" });
  await dialog.getByRole("radio", { name: "使用品牌图标" }).click();
  await expect(dialog.getByTestId("favicon-selected-brand")).toBeVisible();
  await dialog.getByRole("button", { name: "保存修改" }).click();

  await expect(
    page
      .getByTestId("site-card-bilibili")
      .getByTestId("favicon-selected-brand"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByTestId("site-card-bilibili")
      .getByTestId("favicon-selected-brand"),
  ).toBeVisible();
});

test("keeps the workspace centered when site or group editors lock page scroll", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop layout assertion");
  await page.setViewportSize({ width: 1440, height: 900 });

  const workspace = page.locator("main.page-container");
  const beforeSiteEdit = await workspace.boundingBox();
  if (!beforeSiteEdit) throw new Error("Workspace is not visible");

  await page.getByRole("button", { name: "编辑 Google" }).click();
  await expect(page.getByRole("dialog", { name: "编辑网站" })).toBeVisible();
  const duringSiteEdit = await workspace.boundingBox();
  if (!duringSiteEdit) throw new Error("Workspace disappeared during site edit");
  expect(Math.abs(duringSiteEdit.x - beforeSiteEdit.x)).toBeLessThanOrEqual(1);
  await page
    .getByRole("dialog", { name: "编辑网站" })
    .getByRole("button", { name: "关闭" })
    .click();

  const beforeGroupEdit = await workspace.boundingBox();
  if (!beforeGroupEdit) throw new Error("Workspace is not visible");
  await page.getByRole("button", { name: "管理分组" }).click();
  await expect(page.getByRole("dialog", { name: "管理分组" })).toBeVisible();
  const duringGroupEdit = await workspace.boundingBox();
  if (!duringGroupEdit) throw new Error("Workspace disappeared during group edit");
  expect(Math.abs(duringGroupEdit.x - beforeGroupEdit.x)).toBeLessThanOrEqual(1);
});

test("fills the wider desktop grid while keeping the last row aligned", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop layout assertion");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await expect(
    page.getByRole("button", { name: "Mysimple 首页" }),
  ).toBeVisible();
  const brandBox = await page
    .getByRole("button", { name: "Mysimple 首页" })
    .boundingBox();
  const searchBox = await page.locator(".search-input").boundingBox();
  if (!brandBox || !searchBox) {
    throw new Error("Header layout is not visible");
  }
  expect(brandBox.x).toBeLessThan(40);
  expect(
    Math.abs(searchBox.x + searchBox.width / 2 - 1440 / 2),
  ).toBeLessThan(2);
  const grid = page.locator(".site-grid");
  const gridBox = await grid.boundingBox();
  const cardBoxes = await grid.locator(":scope > *").evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        right: rect.right,
      };
    }),
  );
  if (!gridBox || cardBoxes.length === 0) {
    throw new Error("Responsive grid is not visible");
  }

  const firstRow = cardBoxes.filter(
    (box) => Math.abs(box.y - cardBoxes[0].y) < 2,
  );
  const secondRow = cardBoxes.filter(
    (box) => box.y > cardBoxes[0].y + 2,
  );
  expect(firstRow).toHaveLength(8);
  expect(Math.abs(firstRow.at(-1)!.right - (gridBox.x + gridBox.width))).toBeLessThan(
    2,
  );
  expect(Math.abs(secondRow[0].x - firstRow[0].x)).toBeLessThan(2);
  expect(
    Math.max(...cardBoxes.map((box) => box.width)) -
      Math.min(...cardBoxes.map((box) => box.width)),
  ).toBeLessThan(1);

  await page.setViewportSize({ width: 2000, height: 1000 });
  const mainWidth = await page.locator("main.page-container").evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(mainWidth).toBeGreaterThanOrEqual(1599);
  expect(mainWidth).toBeLessThanOrEqual(1601);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(2000);
});

test("keeps the new-group button visible when the group tabs overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop toolbar assertion");
  await page.setViewportSize({ width: 1100, height: 900 });
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
    const protectedOther = state.groups.find(
      (group: { id: string }) => group.id === "other",
    );
    const now = new Date().toISOString();
    const extras = Array.from({ length: 12 }, (_, index) => ({
      id: `overflow-${index}`,
      name: `分组 ${index + 1}`,
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
      { ...protectedOther, order: ordinary.length + extras.length },
      ...githubGroups,
    ];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const tabs = page.locator(".category-tabs");
  const addGroup = page.getByRole("button", { name: "新建分组" });
  await expect(addGroup).toBeVisible();
  expect(
    await tabs.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await expect(tabs.locator(".add-group-tab")).toHaveCount(0);

  const initialX = (await addGroup.boundingBox())!.x;
  await tabs.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect
    .poll(async () => (await addGroup.boundingBox())?.x ?? -1)
    .toBeCloseTo(initialX, 0);
});

test("falls back to official brand icons when native favicons fail", async ({ page }) => {
  await page.route("**/favicon.ico", (route) => route.abort());
  await page.route("https://icons.duckduckgo.com/**", (route) => route.abort());
  await page.route("https://www.google.com/s2/favicons**", (route) => route.abort());
  await page.reload();
  await expect(page.getByTestId("favicon-brand-fallback").first()).toBeVisible();
});

test("keeps the resolved favicon source across group switches without a letter overlay", async ({
  page,
}) => {
  await page.route("https://github.com/favicon.ico", (route) => route.abort());
  await page.route(
    "https://www.google.com/s2/favicons**",
    (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        headers: { "cache-control": "public, max-age=3600" },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><circle cx="64" cy="64" r="52" fill="#181717"/></svg>',
      }),
  );
  await page.reload();

  const githubCard = page.getByTestId("site-card-github");
  await expect(githubCard.locator("img")).toHaveAttribute(
    "src",
    /google\.com\/s2\/favicons/,
  );
  await expect(githubCard.locator("img")).toHaveClass(/is-loaded/);
  await expect(githubCard.locator(".favicon-letter")).toHaveCount(0);

  await page.getByRole("tab", { name: /设计/ }).click();
  await expect(githubCard).toHaveCount(0);
  await page.getByRole("tab", { name: /开发/ }).click();

  const restoredCard = page.getByTestId("site-card-github");
  await expect(restoredCard.locator("img")).toHaveAttribute(
    "src",
    /google\.com\/s2\/favicons/,
  );
  await expect(restoredCard.locator(".favicon-letter")).toHaveCount(0);
});

test("positions the multi-select check at the card bottom right", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "多选" }).click();
  const toggle = page.getByRole("button", { name: "选择 Google" });
  await toggle.click();
  const card = page.getByTestId("site-card-google");
  const cardBox = await card.boundingBox();
  const toggleBox = await toggle.boundingBox();
  if (!cardBox || !toggleBox) throw new Error("Selection geometry is not visible");
  expect(toggleBox.x + toggleBox.width / 2).toBeGreaterThan(
    cardBox.x + cardBox.width / 2,
  );
  expect(toggleBox.y + toggleBox.height / 2).toBeGreaterThan(
    cardBox.y + cardBox.height / 2,
  );
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: screenshotPath(`multi-select-bottom-right-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("wraps grouped cards without creating horizontal page overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop wrapping assertion");
  await page.setViewportSize({ width: 900, height: 900 });
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    const targetGroup = state.groups.find(
      (group: { isProtected: boolean }) => !group.isProtected,
    );
    const template = state.sites.find(
      (site: { groupId: string }) => site.groupId === targetGroup.id,
    );
    const now = new Date().toISOString();
    const clones = Array.from({ length: 10 }, (_, index) => ({
      ...template,
      id: `wrap-test-${index}`,
      name: `Wrap test ${index + 1}`,
      url: `https://wrap-test-${index}.example`,
      order: index + 10,
      globalOrder: state.sites.length + index,
      createdAt: now,
      updatedAt: now,
    }));
    state.sites.push(...clones);
    state.displayMode = "grouped";
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const track = page.locator(".grouped-site-track").first();
  const rows = await track.locator(":scope > *").evaluateAll((items) =>
    Array.from(
      new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))),
    ),
  );
  expect(rows.length).toBeGreaterThan(1);
  expect(
    await track.evaluate((element) => element.scrollWidth),
  ).toBeLessThanOrEqual(await track.evaluate((element) => element.clientWidth));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(900);
});
