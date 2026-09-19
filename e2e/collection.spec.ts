import { expect, test, screenshotPath } from "./fixtures";

test("adds a website and keeps it after refresh", async ({ page }) => {
  await expect(page.getByRole("link", { name: "打开 GitHub", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByRole("menuitem", { name: /添加网站/ }).click();
  const dialog = page.getByRole("dialog", { name: "添加网站" });
  await page.getByLabel("网站名称").fill("OpenAI");
  await page.getByLabel("网站地址").fill("openai.com");
  await dialog.getByRole("button", { name: "添加网站", exact: true }).click();

  await expect(page.getByRole("link", { name: "打开 OpenAI" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "打开 OpenAI" })).toBeVisible();
});

test("filters favorites and disables sorting", async ({ page }) => {
  const search = page.getByRole("searchbox", {
    name: "搜索网页或筛选收藏",
  });
  await search.fill("Figma");
  await expect(page.getByRole("link", { name: "打开 Figma" })).toBeVisible();
  await expect(page.getByRole("link", { name: "打开 GitHub" })).toBeHidden();
  await expect(page.getByRole("button", { name: "搜索时无法排序" })).toBeDisabled();
});

test("searches the whole collection from every collection page and restores the group context", async ({ page }, testInfo) => {
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.sites.push({
      ...state.sites[0],
      id: "cross-workspace-repo",
      name: "Acme Secret Repo",
      url: "https://github.com/acme/secret-repo",
      groupId: "github-other",
      globalOrder: state.sites.length,
    });
    state.sites.push({
      ...state.sites[0],
      id: "main-workspace-link",
      name: "Main Workspace Reference",
      url: "https://example.com/main-reference",
      groupId: "other",
      globalOrder: state.sites.length + 1,
    });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  const search = page.getByRole("searchbox", { name: "搜索网页或筛选收藏" });
  await search.fill("main-reference");
  await expect(page.getByRole("link", { name: "打开 Main Workspace Reference" })).toBeVisible();
  await expect(page.getByTestId("site-card-main-workspace-link")).toContainText("收藏主页");
  await expect(page.getByRole("heading", { name: "全库搜索" })).toBeVisible();

  await search.fill("secret-repo");
  await expect(page.getByRole("link", { name: "打开 Acme Secret Repo" })).toBeVisible();
  await expect(page.getByTestId("site-card-cross-workspace-repo")).toContainText("GitHub");
  await expect(page.getByRole("button", { name: "刷新仓库" })).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`global-collection-search-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await search.fill("");
  await page.getByRole("tab", { name: /其他/ }).click();
  await search.fill("main-reference");
  await expect(page.getByRole("link", { name: "打开 Main Workspace Reference" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "全库搜索" })).toBeVisible();

  await search.fill("");
  await expect(page.getByRole("tab", { name: /其他/ })).toHaveAttribute("aria-selected", "true");
});

test("opens a site when any non-action area of its card is clicked", async ({
  page,
  context,
}) => {
  const requestPromise = context.waitForEvent("request", {
    predicate: (request) => request.url().startsWith("https://github.com"),
  });
  const card = page.getByTestId("site-card-github");
  const box = await card.boundingBox();
  if (!box) throw new Error("GitHub card is not visible");

  const popupPromise = context.waitForEvent("page");
  await page.mouse.click(box.x + 18, box.y + 18);
  await popupPromise;
  expect((await requestPromise).url()).toContain("github.com");
});

test("infers a name and adds from a group card", async ({ page }) => {
  await page.getByRole("tab", { name: /影音/ }).click();
  await page.getByRole("button", { name: "在影音分组添加网站" }).click();
  await page.getByLabel("网站地址").fill("douyin.com");
  await expect(page.getByLabel("网站名称")).toHaveValue("抖音");
  await expect(page.getByRole("radio", { name: "影音" })).toBeChecked();

  const dialog = page.getByRole("dialog", { name: "添加网站" });
  await dialog.getByRole("button", { name: "添加网站", exact: true }).click();
  await expect(page.getByRole("link", { name: "打开 抖音" })).toBeVisible();
});

test("drops an external link into an add card as a prefilled draft", async ({
  page,
}) => {
  const addCard = page.getByRole("button", { name: "在搜索分组添加网站" });
  await addCard.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData(
      "text/uri-list",
      "https://www.xiaohongshu.com/explore",
    );
    dataTransfer.setData(
      "text/html",
      '<a href="https://www.xiaohongshu.com/explore">小红书</a>',
    );
    element.dispatchEvent(
      new DragEvent("dragenter", { bubbles: true, dataTransfer }),
    );
    element.dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer }),
    );
  });

  const dialog = page.getByRole("dialog", { name: "添加网站" });
  await expect(dialog.getByLabel("网站地址")).toHaveValue(
    "https://www.xiaohongshu.com/explore",
  );
  await expect(dialog.getByLabel("网站名称")).toHaveValue("小红书");
  await expect(dialog.getByRole("radio", { name: "搜索" })).toBeChecked();
  await expect(page.getByRole("link", { name: "打开 小红书" })).toHaveCount(0);
});

test("opens a favorite in a new tab", async ({ page, context }) => {
  const requestPromise = context.waitForEvent("request", {
    predicate: (request) => request.url().startsWith("https://github.com"),
  });
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("link", { name: "打开 GitHub" }).click();
  await popupPromise;
  expect((await requestPromise).url()).toContain("github.com");
});

test("persists grouped display and combines it with sorting and search", async ({
  page,
}) => {
  const controls = page.locator(".collection-view-controls");

  await controls.locator(".view-control-button").first().click();
  await page.locator(".sort-popover [role='menuitemradio']").nth(1).click();

  const sortedNames = await page
    .locator(".site-grid > .site-card .site-name")
    .allTextContents();
  expect(sortedNames).toEqual(
    [...sortedNames].sort((a, b) => a.localeCompare(b, "zh-CN")),
  );

  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  await expect(page.locator(".grouped-site-section")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "搜索", level: 3 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "开发", level: 3 })).toBeVisible();
  await expect(page.getByRole("button", { name: "在开发分组添加网站" })).toBeVisible();

  const groupedCards = page.locator(".grouped-site-track .site-card");
  await expect(
    groupedCards.first().getByRole("button", {
      name: /拖动 .+ 更换分组/,
    }),
  ).toBeEnabled();
  await expect(groupedCards.first()).toHaveAttribute(
    "data-drag-mode",
    "transfer",
  );

  await page.reload();
  await expect(page.locator(".grouped-site-section")).toHaveCount(6);
  await page.getByRole("searchbox", { name: "搜索网页或筛选收藏" }).fill("GitHub");
  await expect(page.locator(".grouped-site-section")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "全库搜索", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "开发", level: 3 })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "搜索", level: 3 })).toHaveCount(0);
});

test("records link clicks and persists heat sorting", async ({ page }) => {
  const githubLink = page.getByRole("link", { name: "打开 GitHub" });
  await githubLink.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("site-hub:v1") ?? "{}");
        return state.sites?.find((site: { id: string }) => site.id === "github")
          ?.clickCount;
      }),
    )
    .toBe(2);

  await page.getByRole("button", { name: "手动排列" }).click();
  await page.getByRole("menuitemradio", { name: "热量排列" }).click();
  await expect(page.locator(".site-grid > .site-card").first()).toHaveAttribute(
    "data-testid",
    "site-card-github",
  );

  await page.reload();
  await expect(page.getByRole("button", { name: "热量排列" })).toBeVisible();
  await expect(page.locator(".site-grid > .site-card").first()).toHaveAttribute(
    "data-testid",
    "site-card-github",
  );
  await expect(page.getByLabel("访问次数 2")).toBeVisible();
});

test("selects the inclusive site range with the native Shift gesture", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "多选" }).click();
  await page.getByRole("button", { name: "选择 Google" }).click();
  await page
    .getByRole("button", { name: "选择 CodePen" })
    .click({ modifiers: ["Shift"] });

  for (const name of ["Google", "Bing", "GitHub", "Stack Overflow", "CodePen"]) {
    await expect(page.getByRole("button", { name: `取消选择 ${name}` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await expect(page.getByRole("button", { name: "完成 5" })).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`multi-select-shift-range-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("uses two-step site deletion and transparent modal overlays", async ({
  page,
}, testInfo) => {
  const google = page.getByTestId("site-card-google");
  await google.hover();
  await google.getByRole("button", { name: "删除 Google" }).click();
  await expect(google).toBeVisible();
  await google.getByRole("button", { name: "再次点击删除 Google" }).click();
  await expect(google).toHaveCount(0);

  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByRole("menuitem", { name: /添加网站/ }).click();
  const overlay = page.locator(".dialog-overlay");
  await expect(overlay).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(overlay).toHaveCSS("backdrop-filter", "none");
  await page.screenshot({
    path: screenshotPath(`dialog-transparent-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
