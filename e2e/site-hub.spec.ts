import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const manifest = JSON.parse(
  readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"),
);
const screenshotDirectory = join(
  "artifacts",
  "releases",
  `v${manifest.version}`,
  "screenshots",
);

mkdirSync(screenshotDirectory, { recursive: true });

function screenshotPath(name: string) {
  return join(screenshotDirectory, name);
}

test.beforeEach(async ({ page, context }) => {
  await context.route(/^https:\/\/github\.com(?:\/.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>GitHub test target</title>",
    });
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

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

test("opens the browser history entry and explains the web-only limitation", async ({
  page,
}) => {
  const brand = page.getByRole("link", { name: "Mysimple 首页" });
  const homeButton = page.getByRole("button", { name: "打开收藏主页" });
  const githubButton = page.getByRole("button", { name: "打开 GitHub 收藏" });
  const historyButton = page.getByRole("button", { name: "打开历史记录" });
  await expect(historyButton).toBeVisible();
  const brandBox = await brand.boundingBox();
  const homeBox = await homeButton.boundingBox();
  const githubBox = await githubButton.boundingBox();
  const historyBox = await historyButton.boundingBox();
  if (!brandBox || !homeBox || !githubBox || !historyBox) {
    throw new Error("Topbar navigation is not visible");
  }
  expect(historyBox.x).toBeGreaterThan(brandBox.x + brandBox.width - 1);
  expect(homeBox.x).toBeGreaterThan(brandBox.x + brandBox.width - 1);
  expect(githubBox.x).toBeGreaterThan(homeBox.x + homeBox.width - 1);
  expect(historyBox.x).toBeGreaterThan(githubBox.x + githubBox.width - 1);

  await historyButton.click();
  await expect(
    page.getByRole("heading", { name: "历史记录仅在扩展版可用" }),
  ).toBeVisible();
  await homeButton.click();
  await expect(page.getByRole("heading", { name: "全部网站" })).toBeVisible();
});

test("opens the independent GitHub workspace and can undo its first migration", async ({
  page,
}, testInfo) => {
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    const source = state.sites.find((site: { id: string }) => site.id === "codepen");
    state.sites.push({
      ...source,
      id: "github-test-repo",
      name: "GitHub Test Repo",
      url: "https://github.com/openai/openai",
      groupId: "develop",
      order: 3,
      globalOrder: state.sites.length,
    });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  const githubButton = page.getByRole("button", { name: "打开 GitHub 收藏" });
  await githubButton.click();
  await expect(page.getByRole("heading", { name: "全部 GitHub" })).toBeVisible();
  await expect(page.getByRole("link", { name: "打开 GitHub", exact: true })).toBeVisible();
  await expect(page.getByText("GitHub 收藏已整理")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "打开 GitHub Test Repo" })).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`github-workspace-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.getByRole("button", { name: "管理 GitHub 官方主页" }).click();
  await page.getByRole("menuitem", { name: /撤销上次整理（1 项）/ }).click();
  await expect(page.getByRole("link", { name: "打开 GitHub Test Repo" })).toHaveCount(0);

  await page.getByRole("button", { name: "打开收藏主页" }).click();
  await expect(page.getByRole("heading", { name: "全部网站" })).toBeVisible();
  await expect(page.getByRole("link", { name: "打开 GitHub", exact: true })).toBeVisible();
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
  await expect(page.getByRole("link", { name: "打开 GitHub", exact: true })).toHaveCount(1);
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

test("previews and imports a GitHub author's repositories while skipping duplicates", async ({
  page,
}, testInfo) => {
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.sites.push({
      ...state.sites[0],
      id: "existing-acme-repo",
      name: "已有仓库",
      url: "https://github.com/acme/existing",
      groupId: "github-other",
      globalOrder: state.sites.length,
    });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.route("https://api.github.com/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/users/acme")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ login: "acme", type: "Organization", name: "Acme" }),
      });
      return;
    }
    if (url.includes("/orgs/acme/repos")) {
      const duplicateRows = Array.from({ length: 24 }, (_, index) => ({
        id: 100 + index,
        name: `existing-${index}`,
        full_name: "acme/existing",
        html_url: "https://github.com/acme/existing",
        private: false,
        fork: false,
        archived: false,
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            name: "existing",
            full_name: "acme/existing",
            html_url: "https://github.com/acme/existing",
            private: false,
            fork: false,
            archived: false,
          },
          {
            id: 2,
            name: "new-repo",
            full_name: "acme/new-repo",
            html_url: "https://github.com/acme/new-repo",
            private: false,
            fork: true,
            archived: true,
          },
          ...duplicateRows,
        ]),
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  await page.getByRole("button", { name: "导入 GitHub 作者仓库" }).click();
  const dialog = page.getByRole("dialog", { name: "导入作者仓库" });
  await dialog.getByLabel("作者或组织主页").fill("https://github.com/acme");
  await dialog.getByRole("button", { name: "读取仓库" }).click();
  await expect(dialog.getByText("acme/new-repo")).toBeVisible();
  await expect(dialog.getByText(/^已收藏 \d+$/)).toBeVisible();
  const dialogChrome = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflowY: style.overflowY,
      borderRadius: Number.parseFloat(style.borderRadius),
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  });
  expect(dialogChrome.overflowY).toBe("hidden");
  expect(dialogChrome.borderRadius).toBeGreaterThan(0);
  expect(dialogChrome.scrollHeight).toBeLessThanOrEqual(dialogChrome.clientHeight + 1);
  const listChrome = await dialog.locator(".github-import-list").evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(listChrome.scrollHeight).toBeGreaterThan(listChrome.clientHeight);
  await page.screenshot({
    path: screenshotPath(`github-repository-import-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await dialog.getByRole("button", { name: "确认添加 1 项" }).click();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return {
      added: state.sites.some((site: { url: string }) => site.url === "https://github.com/acme/new-repo"),
      group: state.groups.find((group: { name: string }) => group.name === "acme")?.githubImportSource?.login,
    };
  })).toEqual({ added: true, group: "acme" });
  await expect(page.getByRole("heading", { name: "acme" })).toBeVisible();
});

test("loads and deletes browser history through the extension adapter", async ({
  page,
  context,
}, testInfo) => {
  await page.addInitScript(() => {
    let entries = [
      {
        id: "history-github",
        title: "GitHub",
        url: "https://github.com/openai",
        lastVisitTime: Date.now(),
        visitCount: 3,
      },
      {
        id: "history-example",
        title: "Example",
        url: "https://example.com",
        lastVisitTime: Date.now() - 60_000,
        visitCount: 1,
      },
    ];
    const visitedListeners = new Set<(item: unknown) => void>();
    const removedListeners = new Set<() => void>();
    const messageListeners = new Set<(message: unknown) => void>();
    const notifyRemoved = () => {
      removedListeners.forEach((listener) => listener());
      messageListeners.forEach((listener) => listener("browser-history-invalidated"));
    };
    const history = {
      search: async ({ text }: { text: string }) =>
        entries.filter((entry) =>
          `${entry.title} ${entry.url}`.toLowerCase().includes(text.toLowerCase()),
        ),
      deleteUrl: async ({ url }: { url: string }) => {
        entries = entries.filter((entry) => entry.url !== url);
        notifyRemoved();
      },
      deleteRange: async () => {
        entries = [];
        notifyRemoved();
      },
      deleteAll: async () => {
        entries = [];
        notifyRemoved();
      },
      onVisited: {
        addListener: (listener: (item: unknown) => void) => visitedListeners.add(listener),
        removeListener: (listener: (item: unknown) => void) => visitedListeners.delete(listener),
      },
      onVisitRemoved: {
        addListener: (listener: () => void) => removedListeners.add(listener),
        removeListener: (listener: () => void) => removedListeners.delete(listener),
      },
    };
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "e2e-history-extension",
        onMessage: {
          addListener: (listener: (message: unknown) => void) => messageListeners.add(listener),
          removeListener: (listener: (message: unknown) => void) => messageListeners.delete(listener),
        },
        sendMessage: async () => undefined,
      },
      permissions: {
        contains: async () => true,
        request: async () => true,
      },
      history,
    };
  });
  await page.reload();
  const homeSearchBox = await page.locator(".workspace-intro .search-input").boundingBox();
  if (!homeSearchBox) throw new Error("Favorite search box is not visible");
  await page.getByRole("button", { name: "打开历史记录" }).click();
  await expect(page.getByRole("heading", { name: "历史记录" })).toBeVisible();
  const historySearchBox = await page
    .locator(".history-workspace-intro .search-input")
    .boundingBox();
  if (!historySearchBox) throw new Error("History search box is not visible");
  expect(historySearchBox.x).toBeCloseTo(homeSearchBox.x, 0);
  expect(historySearchBox.width).toBeCloseTo(homeSearchBox.width, 0);
  const githubCard = page.locator(".history-site-card").filter({ hasText: "GitHub" });
  const exampleCard = page.locator(".history-site-card").filter({ hasText: "Example" });
  await expect(githubCard).toBeVisible();
  await expect(exampleCard).toBeVisible();
  await expect(page.locator(".history-site-card-summary").first()).toHaveCSS(
    "padding-left",
    "0px",
  );
  await expect(page.locator(".history-day")).toHaveCount(0);
  await expect(page.locator(".history-url-card")).toHaveCount(0);
  await expect(page.locator(".history-selection-toggle")).toHaveCount(0);
  await expect(page.locator(".history-site-chevron")).toHaveCount(0);
  await expect(page.getByText("清空全部历史", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await page.screenshot({
    path: screenshotPath(`browser-history-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.getByRole("button", { name: "多选" }).click();
  const historySelectionToggle = githubCard.getByRole("button", {
    name: "选择 GitHub 的全部历史记录",
  });
  await expect(historySelectionToggle).toBeVisible();
  const cardBox = await githubCard.boundingBox();
  const toggleBox = await historySelectionToggle.boundingBox();
  if (!cardBox || !toggleBox) throw new Error("History selection geometry is not visible");
  expect(toggleBox.x + toggleBox.width / 2).toBeGreaterThan(
    cardBox.x + cardBox.width / 2,
  );
  expect(toggleBox.y + toggleBox.height / 2).toBeGreaterThan(
    cardBox.y + cardBox.height / 2,
  );
  await page.screenshot({
    path: screenshotPath(`browser-history-selection-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole("button", { name: "选择", exact: true }).click();

  const popupPromise = context.waitForEvent("page");
  await githubCard.getByRole("button", { name: "查看 GitHub 历史记录" }).click();
  await expect(page.getByTestId("history-site-detail-github.com")).toBeVisible();
  await expect(page.locator(".history-url-card")).toHaveCount(1);
  await page.screenshot({
    path: screenshotPath(`browser-history-detail-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole("link", { name: "打开历史记录 GitHub" }).click();
  const popup = await popupPromise;
  expect(popup.url()).toBe("https://github.com/openai");
  await popup.close();

  await page.getByRole("button", { name: "删除历史记录 GitHub" }).click();
  await expect(githubCard).toHaveCount(0);
  await expect(exampleCard).toBeVisible();
});

test("loads browser history through callback-style Edge APIs", async ({ page }) => {
  await page.addInitScript(() => {
    let granted = false;
    const entries = [
      {
        id: "edge-callback-history",
        title: "Edge Callback Example",
        url: "https://edge-callback.example",
        lastVisitTime: Date.now(),
        visitCount: 2,
      },
    ];
    const history = {
      search: (
        _query: unknown,
        callback?: (items: typeof entries) => void,
      ) => {
        queueMicrotask(() => callback?.(entries));
      },
      deleteUrl: (_details: unknown, callback?: () => void) => {
        queueMicrotask(() => callback?.());
      },
      deleteRange: (_range: unknown, callback?: () => void) => {
        queueMicrotask(() => callback?.());
      },
      deleteAll: (callback?: () => void) => {
        queueMicrotask(() => callback?.());
      },
    };
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: { id: "edge-callback-extension" },
      permissions: {
        contains: (
          _details: unknown,
          callback?: (value: boolean) => void,
        ) => queueMicrotask(() => callback?.(granted)),
        request: (
          _details: unknown,
          callback?: (value: boolean) => void,
        ) => {
          granted = true;
          queueMicrotask(() => callback?.(true));
        },
      },
      history,
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "打开历史记录" }).click();
  await page.getByRole("button", { name: /Edge/ }).click();
  await expect(page.getByText("Edge Callback Example", { exact: true })).toBeVisible();
  await expect(page.locator(".history-url-card").getByText("访问 2 次", { exact: true })).toBeVisible();
});

test("drags beyond 50px without waiting and keeps the order after refresh", async ({
  page,
}) => {
  const googleCard = page.getByTestId("site-card-google");
  const bingCard = page.getByTestId("site-card-bing");
  const start = await googleCard.boundingBox();
  const target = await bingCard.boundingBox();
  if (!start || !target) throw new Error("Drag targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height * 0.65);
  await page.mouse.down();
  await expect(googleCard).toHaveClass(/is-drag-pending/);
  await page.mouse.move(
    start.x + start.width / 2 + 51,
    start.y + start.height * 0.65,
  );
  const dragPreview = page.getByTestId("site-card-drag-preview");
  await expect(dragPreview).toBeVisible();
  await page.mouse.move(
    target.x + target.width * 0.75,
    target.y + target.height / 2,
    { steps: 12 },
  );
  const previewBox = await dragPreview.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(Math.abs(previewBox!.width - start.width)).toBeLessThan(2);
  await expect
    .poll(async () => (await bingCard.boundingBox())?.x ?? target.x)
    .toBeLessThan(target.x - 30);
  await page.mouse.up();

  const visibleIds = () =>
    page.locator(".site-grid > .site-card").evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-testid")),
    );
  await expect
    .poll(async () => (await visibleIds())[0])
    .toBe("site-card-bing");

  const reorderedIds = await visibleIds();
  expect(reorderedIds[0]).not.toBe("site-card-google");
  await page.reload();
  expect(await visibleIds()).toEqual(reorderedIds);
});

test("cancels a site drag when the browser window loses focus", async ({
  page,
}, testInfo) => {
  const googleCard = page.getByTestId("site-card-google");
  const start = await googleCard.boundingBox();
  if (!start) throw new Error("Drag source is not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 51, start.y + start.height / 2);
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`site-drag-focus-loss-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByTestId("site-card-drag-preview")).toBeHidden();
  await expect(page.locator(".site-card.is-dragging")).toHaveCount(0);
  await page.mouse.up();
});

test("uses card overlap and moves the target frame before drop", async ({
  page,
}) => {
  const googleCard = page.getByTestId("site-card-google");
  const bingCard = page.getByTestId("site-card-bing");
  const start = await googleCard.boundingBox();
  const target = await bingCard.boundingBox();
  if (!start || !target) throw new Error("Drag targets are not visible");

  const grabX = start.x + 8;
  const grabY = start.y + start.height / 2;
  const partialTravel = Math.max(55, (target.x - start.x) * 0.65);
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 51, grabY);
  await page.mouse.move(grabX + partialTravel, grabY);

  await expect(bingCard).toHaveClass(/is-drop-target/);
  await expect(bingCard).toHaveCSS("border-style", "dashed");
  await expect
    .poll(async () => (await googleCard.boundingBox())?.x ?? start.x)
    .toBeGreaterThan(target.x - 3);
  const targetFrame = await googleCard.boundingBox();
  expect(targetFrame).not.toBeNull();
  expect(Math.abs(targetFrame!.x - target.x)).toBeLessThan(3);

  await page.mouse.up();
  await expect
    .poll(async () =>
      page.locator(".site-grid > .site-card").first().getAttribute("data-testid"),
    )
    .toBe("site-card-bing");
});

test("keeps unrelated cards neutral during a transfer drag", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop transfer hover assertion");

  await page.getByRole("button", { name: "手动排列" }).click();
  await page.getByRole("menuitemradio", { name: "名称 A–Z" }).click();

  const googleCard = page.getByTestId("site-card-google");
  const bingCard = page.getByTestId("site-card-bing");
  const start = await googleCard.boundingBox();
  const target = await bingCard.boundingBox();
  if (!start || !target) throw new Error("Transfer targets are not visible");
  const neutralBorder = await bingCard.evaluate(
    (element) => getComputedStyle(element).borderColor,
  );

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 51, start.y + start.height / 2);
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);

  await expect(bingCard).not.toHaveClass(/is-drop-target/);
  await expect
    .poll(() => bingCard.evaluate((element) => getComputedStyle(element).borderColor))
    .toBe(neutralBorder);
  await page.mouse.up();
});

test("keeps the original order when the live target frame returns to source", async ({
  page,
}) => {
  const googleCard = page.getByTestId("site-card-google");
  const bingCard = page.getByTestId("site-card-bing");
  const start = await googleCard.boundingBox();
  const target = await bingCard.boundingBox();
  if (!start || !target) throw new Error("Drag targets are not visible");

  const visibleIds = () =>
    page.locator(".site-grid > .site-card").evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-testid")),
    );
  const before = await visibleIds();

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 51, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 10,
  });
  await expect(bingCard).toHaveClass(/is-drop-target/);

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2, {
    steps: 10,
  });
  await expect(bingCard).not.toHaveClass(/is-drop-target/);
  await page.mouse.up();

  await expect.poll(visibleIds).toEqual(before);
  await page.reload();
  await expect.poll(visibleIds).toEqual(before);
});

test("a click with 49px pointer movement still opens the site", async ({
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
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.58);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 49,
    box.y + box.height * 0.58,
  );
  await page.mouse.up();
  await popupPromise;
  expect((await requestPromise).url()).toContain("github.com");
});

test("moving card C to card A does not open the dragged site", async ({
  page,
  context,
}) => {
  const card = page.getByTestId("site-card-github");
  const target = page.getByTestId("site-card-google");
  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) throw new Error("Drag cards are not visible");

  const initialPageCount = context.pages().length;
  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(250);

  expect(context.pages()).toHaveLength(initialPageCount);
  await expect
    .poll(async () =>
      page.locator(".site-grid > .site-card").first().getAttribute("data-testid"),
    )
    .toBe("site-card-github");
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
  await expect(page.getByRole("link", { name: "Mysimple 首页" })).toBeVisible();
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
  await expect(page.getByRole("link", { name: "Studio North 首页" })).toBeVisible();

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
  await expect(page.getByRole("link", { name: "Studio North 首页" })).toBeVisible();
  await expect(page.locator(".topbar .brand-mark")).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("site-hub:v1")!),
  );
  expect(saved.version).toBe(13);
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

test("opens the exact group manager from long press and grouped heading", async ({
  page,
}) => {
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
  let dialog = page.getByRole("dialog", { name: "管理分组" });
  await expect(dialog.getByLabel("分组名称")).toHaveValue("设计");
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
    .locator('input[aria-label="选择要导入的分组资源包"]')
    .setInputFiles({
      name: "shared-design.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(payload)),
    });
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
  await expect(dialog).toBeVisible();
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
    page.getByRole("link", { name: "Mysimple 首页" }),
  ).toBeVisible();
  const brandBox = await page
    .getByRole("link", { name: "Mysimple 首页" })
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

test("opens a favorite in a new tab", async ({ page, context }) => {
  const requestPromise = context.waitForEvent("request", {
    predicate: (request) => request.url().startsWith("https://github.com"),
  });
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("link", { name: "打开 GitHub" }).click();
  await popupPromise;
  expect((await requestPromise).url()).toContain("github.com");
});

test("opens the GitHub home entry from its card surface", async ({ page, context }) => {
  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  const entry = page.locator(".github-home-entry");
  await expect(entry).toBeVisible();
  const box = await entry.boundingBox();
  if (!box) throw new Error("GitHub home entry is not visible");

  const requestPromise = context.waitForEvent("request", {
    predicate: (request) => request.url().startsWith("https://github.com"),
  });
  const popupPromise = context.waitForEvent("page");
  await page.mouse.click(box.x + box.width * 0.38, box.y + box.height * 0.5);
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
  await page.getByRole("button", { name: "手动排列" }).click();
  await page.getByRole("menuitemradio", { name: "热量排列" }).click();
  await expect(page.locator(".site-grid > .site-card").first()).toHaveAttribute(
    "data-testid",
    "site-card-github",
  );
});

test("moves a non-manually sorted card across grouped rows and keeps All grouped", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop grouped transfer assertion");
  await page.setViewportSize({ width: 1280, height: 1000 });

  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "名称 A–Z" }).click();
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const google = page.getByTestId("site-card-google");
  const github = page.getByTestId("site-card-github");
  const developTrack = page.locator('[data-group-zone-id="develop"]');
  const start = await google.boundingBox();
  const target = await github.boundingBox();
  if (!start || !target) throw new Error("Transfer targets are not visible");

  await expect(google).toHaveAttribute("data-drag-mode", "transfer");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 14,
  });

  let targetNudge = 0;
  await expect
    .poll(async () => {
      const offset = targetNudge++ % 2 === 0 ? -2 : 2;
      await page.mouse.move(
        target.x + target.width / 2 + offset,
        target.y + target.height / 2,
      );
      await page.waitForTimeout(32);
      return developTrack.evaluate((element) =>
        element.classList.contains("is-group-drag-over"),
      );
    })
    .toBe(true);
  await expect(github).not.toHaveClass(/is-drop-target/);
  expect(await github.evaluate((element) => element.style.transform)).toBe("");

  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "google").groupId;
  })).toBe("develop");
  await expect(page.getByRole("tab", { name: /全部/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: /开发/ })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await expect(page.locator(".grouped-site-section")).toHaveCount(6);
  await expect(
    developTrack.getByTestId("site-card-google"),
  ).toBeVisible();

  const sortedNames = await developTrack.locator(".site-card .site-name").allTextContents();
  expect(sortedNames).toEqual(
    [...sortedNames].sort((a, b) => a.localeCompare(b, "zh-CN", { sensitivity: "base" })),
  );
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    const developSites = state.sites.filter(
      (site: { groupId: string }) => site.groupId === "develop",
    );
    const google = developSites.find((site: { id: string }) => site.id === "google");
    return google.order === Math.max(...developSites.map((site: { order: number }) => site.order));
  })).toBe(true);

  await page.reload();
  await expect(page.locator('[data-group-zone-id="develop"]').getByTestId("site-card-google")).toBeVisible();
});

test("treats a same-group drop as a no-op outside manual sorting", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop same-group transfer assertion");

  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "最早添加" }).click();
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const google = page.getByTestId("site-card-google");
  const bing = page.getByTestId("site-card-bing");
  const start = await google.boundingBox();
  const target = await bing.boundingBox();
  if (!start || !target) throw new Error("Same-group targets are not visible");
  const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 10,
  });
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await expect(page.locator('[data-group-zone-id="search"]')).not.toHaveClass(
    /is-group-drag-over/,
  );
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
});

test("moves a non-manually sorted card to a group tab and opens the target group", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop tab transfer assertion");

  const learningTab = page.getByRole("tab", { name: /学习/ });
  const mediaTab = page.getByRole("tab", { name: /影音/ });
  await learningTab.click();
  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "名称 Z–A" }).click();

  const wikipedia = page.getByTestId("site-card-wikipedia");
  const start = await wikipedia.boundingBox();
  const target = await mediaTab.boundingBox();
  if (!start || !target) throw new Error("Tab transfer targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 14,
  });

  await expect(mediaTab).toHaveClass(/is-drag-over/);
  await page.waitForTimeout(520);
  await expect(learningTab).toHaveAttribute("aria-selected", "false");
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("site-card-youtube")).toBeVisible();
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "wikipedia").groupId;
  })).toBe("media");
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await expect(learningTab).toHaveAttribute("aria-selected", "false");
  await expect(wikipedia).toBeVisible();
});

test("lets a non-manual tab transfer return to its origin before release", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop reversible tab transfer assertion");

  const developTab = page.locator('[data-group-drop-id="develop"]');
  const designTab = page.locator('[data-group-drop-id="design"]');
  await developTab.click();
  await page.locator(".view-control-button").first().click();
  await page.locator('.sort-popover [role="menuitemradio"]').nth(1).click();

  const github = page.getByTestId("site-card-github");
  const start = await github.boundingBox();
  const designTarget = await designTab.boundingBox();
  const developTarget = await developTab.boundingBox();
  if (!start || !designTarget || !developTarget) {
    throw new Error("Reversible tab transfer targets are not visible");
  }

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(
    designTarget.x + designTarget.width / 2,
    designTarget.y + designTarget.height / 2,
    { steps: 14 },
  );
  await page.waitForTimeout(520);
  await expect(designTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("site-card-figma")).toBeVisible();
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();

  await page.mouse.move(
    developTarget.x + developTarget.width * 0.2,
    developTarget.y + developTarget.height / 2,
    { steps: 14 },
  );
  await expect(developTab).toHaveClass(/is-drag-over/);
  await page.waitForTimeout(520);
  await expect(developTab).toHaveAttribute("aria-selected", "true");
  await expect(designTab).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("site-card-stackoverflow")).toBeVisible();
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "github").groupId;
  })).toBe("develop");
  await expect(developTab).toHaveAttribute("aria-selected", "true");
  await expect(github).toBeVisible();
});

test("moves a non-manually sorted card to a group tab with touch input", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile touch transfer assertion");

  const learningTab = page.getByRole("tab", { name: /学习/ });
  const mediaTab = page.getByRole("tab", { name: /影音/ });
  await learningTab.click();
  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "最近添加" }).click();
  await mediaTab.scrollIntoViewIfNeeded();

  const wikipedia = page.getByTestId("site-card-wikipedia");
  const start = await wikipedia.boundingBox();
  const target = await mediaTab.boundingBox();
  if (!start || !target) throw new Error("Touch transfer targets are not visible");

  const client = await page.context().newCDPSession(page);
  const startPoint = {
    x: Math.round(start.x + start.width / 2),
    y: Math.round(start.y + start.height / 2),
  };
  const activationPoint = { x: startPoint.x + 52, y: startPoint.y };
  const targetPoint = {
    x: Math.round(target.x + target.width / 2),
    y: Math.round(target.y + target.height / 2),
  };
  const touchPoint = (point: { x: number; y: number }) => ({
    ...point,
    radiusX: 2,
    radiusY: 2,
    force: 1,
  });

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint(startPoint)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touchPoint(activationPoint)],
  });
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  for (let step = 1; step <= 12; step += 1) {
    const progress = step / 12;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        touchPoint({
          x: Math.round(activationPoint.x + (targetPoint.x - activationPoint.x) * progress),
          y: Math.round(activationPoint.y + (targetPoint.y - activationPoint.y) * progress),
        }),
      ],
    });
    await page.waitForTimeout(16);
  }

  await expect(mediaTab).toHaveClass(/is-drag-over/);
  await page.waitForTimeout(520);
  await expect(learningTab).toHaveAttribute("aria-selected", "false");
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("site-card-youtube")).toBeVisible();
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "wikipedia").groupId;
  })).toBe("media");
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await expect(learningTab).toHaveAttribute("aria-selected", "false");
  await expect(wikipedia).toBeVisible();
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
  expect(addBox!.x + addBox!.width).toBeLessThanOrEqual(sectionBox!.x);
  expect(Math.abs(iconBox!.x - sectionBox!.x)).toBeLessThanOrEqual(1);
  if (testInfo.project.name === "mobile") {
    await expect(searchAdd).toHaveCSS("opacity", "1");
  } else {
    await expect(searchAdd).toHaveCSS("opacity", "0");
    await page.mouse.move(sectionBox!.x + 240, addBox!.y + addBox!.height / 2);
    await expect(searchAdd).toHaveCSS("opacity", "0");
    await page.mouse.move(
      addBox!.x + addBox!.width / 2,
      addBox!.y + addBox!.height / 2,
      { steps: 1 },
    );
    await expect(searchAdd).toHaveCSS("opacity", "1");
  }
  await expect(searchAdd).toHaveCSS("border-radius", "999px");
  await expect(searchAdd).not.toHaveCSS("box-shadow", "none");
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
    searchSection.getByRole("button", { name: "切换到链接多选 搜索 网站" }),
  ).toHaveText("切换");

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

test("enters grouped selection from the clicked element and switches only from the header control", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const searchSection = page.locator('[data-group-sort-section-id="search"]');
  const designSection = page.locator('[data-group-sort-section-id="design"]');
  await searchSection.getByRole("button", { name: "多选 搜索 网站" }).click();
  await expect(
    searchSection.getByRole("button", { name: "选择 搜索 网站" }),
  ).toHaveClass(/pending/);
  await page.screenshot({
    path: screenshotPath(`selection-mode-pending-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await expect(page.locator(".site-selection-toggle")).toHaveCount(0);
  await expect(page.locator(".grouped-site-select-group")).toHaveCount(0);
  await expect(page.locator(".group-selection-trigger")).toHaveCount(6);
  await expect(searchSection.getByRole("button", { name: "管理 搜索 分组" })).toBeDisabled();
  await expect(
    searchSection.getByTestId("site-card-google").getByRole("button", { name: "编辑 Google" }),
  ).toBeDisabled();
  await expect(
    searchSection.getByTestId("site-card-google").getByRole("button", { name: "删除 Google" }),
  ).toBeDisabled();
  const searchTab = page.locator('[data-group-drop-id="search"]');
  const searchTabBox = await searchTab.boundingBox();
  if (!searchTabBox) throw new Error("Search group tab is not visible");
  await searchTab.dispatchEvent("pointerdown", {
    button: 0,
    pointerId: 23,
    pointerType: "touch",
    clientX: searchTabBox.x + searchTabBox.width / 2,
    clientY: searchTabBox.y + searchTabBox.height / 2,
  });
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog", { name: "管理分组" })).toBeHidden();
  await searchTab.dispatchEvent("pointerup", {
    button: 0,
    pointerId: 23,
    pointerType: "touch",
  });
  await searchSection.getByRole("button", { name: "多选 搜索 网站" }).click();

  await searchSection.getByRole("heading", { level: 3, name: "搜索" }).click();
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
    searchSection.getByRole("button", { name: "切换到链接多选 搜索 网站" }),
  ).toHaveText("切换");
  await expect(searchSection.getByRole("button", { name: "管理 搜索 分组" })).toBeDisabled();
  await expect(
    searchSection.getByTestId("site-card-google").getByRole("button", { name: "编辑 Google" }),
  ).toBeDisabled();
  await expect(
    searchSection.getByTestId("site-card-google").getByRole("button", { name: "删除 Google" }),
  ).toBeDisabled();
  await expect(
    searchSection.getByTestId("site-card-google").locator(".site-card-full-link"),
  ).toHaveAttribute("aria-disabled", "true");
  await page.screenshot({
    path: screenshotPath(`selection-mode-groups-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await searchSection.getByRole("heading", { level: 3, name: "搜索" }).click();
  await expect(searchSection).not.toHaveClass(/is-group-selected/);
  await expect(
    searchSection.getByRole("button", { name: "选择 搜索 分组" }),
  ).toBeVisible();
  await expect(
    searchSection.getByRole("button", { name: "选择 搜索 网站" }),
  ).toHaveClass(/pending/);

  await searchSection.getByRole("button", { name: "选择 搜索 网站" }).click();
  await expect(page.locator(".site-selection-toggle")).toHaveCount(0);
  await expect(searchSection.getByRole("button", { name: "多选 搜索 网站" })).toHaveText("多选");
  await searchSection.getByRole("button", { name: "多选 搜索 网站" }).click();
  await page.getByTestId("site-card-google").click();
  await expect(page.getByTestId("site-card-google").locator(".site-selection-toggle")).toBeVisible();
  await expect(searchSection).not.toHaveClass(/is-group-selected/);
  await expect(
    page.getByTestId("site-card-google").getByRole("button", { name: "编辑 Google" }),
  ).toBeDisabled();
  await expect(
    page.getByTestId("site-card-google").getByRole("button", { name: "删除 Google" }),
  ).toBeDisabled();
  await page.getByTestId("site-card-google").click();
  await expect(
    page.getByTestId("site-card-google").locator(".site-selection-toggle"),
  ).toHaveCount(0);
  await expect(
    searchSection.getByRole("button", { name: "选择 搜索 网站" }),
  ).toHaveText("选择");
  await page.getByTestId("site-card-google").click();
  await expect(
    page.getByTestId("site-card-google").locator(".site-selection-toggle"),
  ).toBeVisible();
  await expect(
    searchSection.locator(".grouped-site-header-main"),
  ).toHaveClass(/is-selection-locked/);
  await expect(searchSection.getByRole("button", { name: "管理 搜索 分组" })).toBeDisabled();
  await expect(page.locator(".group-selection-trigger")).toHaveCount(6);
  await expect(
    searchSection.getByRole("button", { name: "搜索 分组选择在链接多选时不可用" }),
  ).toBeDisabled();
  await page.screenshot({
    path: screenshotPath(`selection-mode-sites-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await searchSection
    .getByRole("button", { name: "切换到分组多选 搜索 网站" })
    .click();
  await expect(page.locator(".site-selection-toggle")).toHaveCount(0);
  await searchSection.getByRole("button", { name: "选择 搜索 网站" }).click();
  await expect(searchSection.getByRole("button", { name: "多选 搜索 网站" })).toHaveText("多选");
  await searchSection.getByRole("button", { name: "多选 搜索 网站" }).click();

  await designSection.getByRole("heading", { level: 3, name: "设计" }).click();
  await expect(designSection).toHaveClass(/is-group-selected/);
  await page.locator("main.page-container").click({ position: { x: 5, y: 5 } });
  await expect(designSection).not.toHaveClass(/is-group-selected/);
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
    searchSection.getByRole("button", { name: "切换到链接多选 搜索 网站" }),
  ).toHaveText("切换");
  await page.screenshot({
    path: screenshotPath(`selection-double-click-groups-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("moves selected sites together from grouped All without leaving All", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop batch drag assertion");
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  await page
    .locator('[data-group-sort-section-id="search"]')
    .getByRole("button", { name: "多选 搜索 网站" })
    .click();
  await page.getByRole("link", { name: "打开 Google" }).click();
  await page.getByTestId("site-card-github").click();

  const google = page.getByTestId("site-card-google");
  const designTrack = page.locator('[data-group-zone-id="design"]');
  const start = await google.boundingBox();
  const target = await designTrack.boundingBox();
  if (!start || !target) throw new Error("Batch drag targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await expect(page.getByTestId("site-card-drag-preview")).toHaveAttribute(
    "data-batch-count",
    "2",
  );
  await page.mouse.move(target.x + target.width / 2, target.y + 40, { steps: 16 });
  await page.mouse.up();

  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return ["google", "github"].map(
        (id) => state.sites.find((site: { id: string }) => site.id === id).groupId,
      );
    }),
  ).toEqual(["design", "design"]);
  await expect(page.getByRole("tab", { name: /全部/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page
      .locator('[data-group-sort-section-id="search"]')
      .getByRole("button", { name: "选择 搜索 网站" }),
  ).toBeVisible();
  await page.waitForTimeout(220);
  await page.screenshot({
    path: screenshotPath("group-order-multiselect.png"),
    fullPage: true,
  });
});

test("moves selected sites from a specifically focused non-manual group", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop focused batch drag assertion");
  const developTab = page.locator('[data-group-drop-id="develop"]');
  const mediaTab = page.locator('[data-group-drop-id="media"]');
  await developTab.click();
  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "名称 Z–A" }).click();
  await page.getByRole("button", { name: "多选" }).click();
  await page.getByRole("button", { name: "选择 GitHub" }).click();
  await page.getByRole("button", { name: "选择 CodePen" }).click();

  const github = page.getByTestId("site-card-github");
  const start = await github.boundingBox();
  const target = await mediaTab.boundingBox();
  if (!start || !target) throw new Error("Focused batch drag targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 14,
  });
  await expect(page.getByTestId("site-card-drag-preview")).toHaveAttribute(
    "data-batch-count",
    "2",
  );
  await page.waitForTimeout(520);
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await page.mouse.up();

  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return ["github", "codepen"].map(
        (id) => state.sites.find((site: { id: string }) => site.id === id).groupId,
      );
    }),
  ).toEqual(["media", "media"]);
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "多选" })).toBeVisible();
});

test("auto-scrolls overflowing group tabs during a site transfer", async ({
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
      id: `edge-${index}`,
      name: `边缘分组 ${index + 1}`,
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
  await page.locator('[data-group-drop-id="search"]').click();
  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "名称 A–Z" }).click();

  const tabs = page.locator(".category-tabs");
  const google = page.getByTestId("site-card-google");
  const start = await google.boundingBox();
  const tabsBox = await tabs.boundingBox();
  if (!start || !tabsBox) throw new Error("Auto-scroll drag targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(tabsBox.x + tabsBox.width - 4, tabsBox.y + tabsBox.height / 2, {
    steps: 16,
  });
  await expect.poll(() => tabs.evaluate((element) => element.scrollLeft)).toBeGreaterThan(120);
  await expect
    .poll(() =>
      page.locator('.category-tab.is-drag-over[data-group-drop-id^="edge-"]').getAttribute(
        "data-group-drop-id",
      ),
    )
    .toBeTruthy();
  await page.waitForTimeout(520);
  const targetGroupId = await page
    .locator('.category-tab.is-drag-over[data-group-drop-id]')
    .getAttribute("data-group-drop-id");
  await page.mouse.up();

  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return state.sites.find((site: { id: string }) => site.id === "google").groupId;
    }),
  ).toBe(targetGroupId);
  await expect(page.locator(`[data-group-drop-id="${targetGroupId}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
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

test("reorders card C to card A inside one group without opening it", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop grouped drag assertion");
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.displayMode = "grouped";
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const cardC = page.getByTestId("site-card-codepen");
  const cardA = page.getByTestId("site-card-github");
  const start = await cardC.boundingBox();
  const target = await cardA.boundingBox();
  if (!start || !target) throw new Error("Grouped drag cards are not visible");

  const initialPageCount = context.pages().length;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 12,
  });
  await expect(cardA).toHaveClass(/is-drop-target/);
  await page.mouse.up();
  await page.waitForTimeout(250);

  expect(context.pages()).toHaveLength(initialPageCount);
  const developTrack = page.getByTestId("site-card-github").locator("..");
  await expect
    .poll(() =>
      developTrack
        .locator(":scope > .site-card")
        .first()
        .getAttribute("data-testid"),
    )
    .toBe("site-card-codepen");
});

test("keeps a forward drop target stable before committing the new position", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop grouped drag assertion");
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.displayMode = "grouped";
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const firstCard = page.getByTestId("site-card-github");
  const nextCard = page.getByTestId("site-card-stackoverflow");
  const start = await firstCard.boundingBox();
  const target = await nextCard.boundingBox();
  if (!start || !target) throw new Error("Grouped drag cards are not visible");

  const initialPageCount = context.pages().length;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 12,
  });
  await expect(nextCard).toHaveClass(/is-drop-target/);
  for (const offset of [-3, 4, -2, 3, 0]) {
    await page.mouse.move(
      target.x + target.width / 2 + offset,
      target.y + target.height / 2,
    );
    await page.waitForTimeout(60);
    await expect(nextCard).toHaveClass(/is-drop-target/);
  }
  await page.mouse.up();
  await page.waitForTimeout(250);

  expect(context.pages()).toHaveLength(initialPageCount);
  const developTrack = page.getByTestId("site-card-stackoverflow").locator("..");
  await expect
    .poll(() =>
      developTrack
        .locator(":scope > .site-card")
        .nth(1)
        .getAttribute("data-testid"),
    )
    .toBe("site-card-github");
});

test("moves a card across grouped rows while preserving its global order", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop cross-group drag assertion");
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.displayMode = "grouped";
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const google = page.getByTestId("site-card-google");
  const github = page.getByTestId("site-card-github");
  const start = await google.boundingBox();
  const target = await github.boundingBox();
  if (!start || !target) throw new Error("Cross-group drag targets are not visible");
  const beforeGlobalOrder = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "google").globalOrder;
  });

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 14 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "google").groupId;
  })).toBe("develop");
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "google").globalOrder;
  })).toBe(beforeGlobalOrder);
});

test("switches group during a drag and accepts the add-card slot in the new group", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop tab drag assertion");
  await page.getByRole("tab", { name: /学习/ }).click();
  const wikipedia = page.getByTestId("site-card-wikipedia");
  const mediaTab = page.getByRole("tab", { name: /影音/ });
  const start = await wikipedia.boundingBox();
  const target = await mediaTab.boundingBox();
  if (!start || !target) throw new Error("Tab drag targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  const previewBeforeOverlap = await page
    .getByTestId("site-card-drag-preview")
    .boundingBox();
  if (!previewBeforeOverlap) throw new Error("Drag preview is not visible");
  const edgeOverlapPointerY =
    target.y + target.height + previewBeforeOverlap.height / 2 - 8;
  expect(edgeOverlapPointerY).toBeGreaterThan(target.y + target.height);
  await page.mouse.move(target.x + target.width / 2, edgeOverlapPointerY, {
    steps: 12,
  });
  await expect(page.getByTestId("site-card-drag-preview")).toHaveClass(
    /is-over-group-tab/,
  );
  await expect(mediaTab).toHaveClass(/is-drag-over/);
  await expect
    .poll(() =>
      page
        .getByTestId("site-card-drag-preview")
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)),
    )
    .toBeLessThanOrEqual(0.4);
  await page.waitForTimeout(500);
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  const addCard = page.getByRole("button", { name: /在影音分组添加网站/ });
  const addCardTarget = await addCard.boundingBox();
  if (!addCardTarget) throw new Error("Switched group end target is not visible");
  await page.mouse.move(
    addCardTarget.x + addCardTarget.width / 2,
    addCardTarget.y + addCardTarget.height / 2,
    { steps: 10 },
  );
  await expect(addCard.locator("..")).toHaveClass(/is-group-drag-over/);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "wikipedia").groupId;
  })).toBe("media");
  await page.reload();
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "wikipedia").groupId;
  })).toBe("media");
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
