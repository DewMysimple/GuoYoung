import { expect, test, screenshotPath } from "./fixtures";

test("does not show a loading placeholder for a quick history read", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop history loading regression");
  await page.addInitScript(() => {
    Object.defineProperty(window, "chrome", { configurable: true, value: {
      runtime: { id: "history-quick-read-test" },
      permissions: { contains: async () => true, request: async () => true },
      history: { search: async () => {
        await new Promise(resolve => window.setTimeout(resolve, 80));
        return [{ id: "quick", title: "Quick history", url: "https://example.com/quick", lastVisitTime: Date.now() }];
      } },
    } });
    (window as unknown as { historyLoadingNoticeSeen: boolean }).historyLoadingNoticeSeen = false;
    new MutationObserver(() => {
      if (document.querySelector(".history-initial-loading span")) {
        (window as unknown as { historyLoadingNoticeSeen: boolean }).historyLoadingNoticeSeen = true;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await page.getByRole("button", { name: "打开历史记录" }).click();
  await expect(page.locator(".history-site-card")).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { historyLoadingNoticeSeen: boolean }).historyLoadingNoticeSeen)).toBe(false);
  await expect(page.locator(".history-skeleton-card")).toHaveCount(0);
});

test("never flashes empty history during the first read or a workspace refresh", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop history lifecycle regression");
  await page.addInitScript(() => {
    let reads = 0;
    Object.defineProperty(window, "chrome", { configurable: true, value: {
      runtime: { id: "history-refresh-test" },
      permissions: { contains: async () => true, request: async () => true },
      history: { search: async () => {
        reads++;
        await new Promise<void>(resolve => window.addEventListener("finish-history-read", () => resolve(), { once: true }));
        return [{ id: "example", title: "History snapshot", url: "https://example.com/history", lastVisitTime: Date.now(), visitCount: reads }];
      } },
    } });
    (window as unknown as { historyEmptyFrames: number }).historyEmptyFrames = 0;
    const sample = () => {
      if (document.querySelector(".history-empty")) (window as unknown as { historyEmptyFrames: number }).historyEmptyFrames++;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.reload();
  await page.getByRole("button", { name: "打开历史记录" }).click();
  await expect(page.getByLabel("正在加载历史记录", { exact: true })).toBeVisible();
  await expect(page.locator(".history-skeleton-card")).toHaveCount(0);
  await expect(page.getByText("正在读取浏览器历史记录…", { exact: true })).toBeVisible();
  await page.screenshot({ path: screenshotPath("history-first-read-loading.png"), animations: "disabled" });
  await page.evaluate(() => window.dispatchEvent(new Event("finish-history-read")));
  await expect(page.locator(".history-site-card")).toHaveCount(1);
  await page.getByRole("button", { name: "打开收藏主页" }).click();
  await expect(page.locator(".browser-history")).toHaveCount(0);
  await page.getByRole("button", { name: "打开历史记录" }).click();
  await expect(page.locator(".history-site-card")).toHaveCount(1);
  await expect(page.getByText("1 个网站 · 1 个网页", { exact: true })).toBeVisible();
  await expect(page.getByLabel("正在加载历史记录", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: screenshotPath("history-retained-during-refresh.png"), animations: "disabled" });
  await page.evaluate(() => window.dispatchEvent(new Event("finish-history-read")));
  await expect(page.getByText("1 个网站 · 1 个网页", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { historyEmptyFrames: number }).historyEmptyFrames)).toBe(0);
});

test("recovers after denied, granted and revoked history permissions without reopening the page", async ({ page }, info) => {
  await page.addInitScript(() => {
    let granted = false, requests = 0;
    type PermissionListener = (value: { permissions: string[] }) => void;
    const added = new Set<PermissionListener>(), removed = new Set<PermissionListener>();
    const change = (next: boolean) => {
      granted = next;
      (next ? added : removed).forEach(fn => fn({ permissions: ["history"] }));
    };
    window.addEventListener("test-history-revoke", () => change(false));
    window.addEventListener("test-history-grant", () => change(true));
    Object.defineProperty(window, "chrome", { configurable: true, value: {
      runtime: { id: "history-lifecycle-test" },
      permissions: {
        contains: async () => granted,
        request: async () => { if (++requests > 1) change(true); return granted; },
        onAdded: { addListener: (fn: PermissionListener) => added.add(fn), removeListener: (fn: PermissionListener) => added.delete(fn) },
        onRemoved: { addListener: (fn: PermissionListener) => removed.add(fn), removeListener: (fn: PermissionListener) => removed.delete(fn) },
      },
      history: {
        search: async () => {
          if (!granted) throw new Error("Permission removed");
          return [{ id: "example", title: "Permission lifecycle", url: "https://example.com/native-check", lastVisitTime: Date.now() }];
        },
      },
    } });
  });
  await page.reload();
  await page.getByRole("button", { name: "打开历史记录" }).click();
  const authorize = page.getByRole("button", { name: "允许读取历史记录" });
  await expect(authorize).toBeVisible();
  await authorize.click();
  await expect(page.locator(".history-site-card")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("test-history-revoke")));
  await expect(authorize).toBeVisible();
  await expect(page.locator(".history-site-card")).toHaveCount(0);
  await page.screenshot({ path: screenshotPath(`history-permission-revoked-${info.project.name}.png`) });
  await page.evaluate(() => window.dispatchEvent(new Event("test-history-grant")));
  await expect(page.locator(".history-site-card")).toHaveCount(1);
  await expect(authorize).toHaveCount(0);
});

test("opens the browser history entry and explains the web-only limitation", async ({
  page,
}) => {
  const brand = page.getByRole("button", { name: "Mysimple 首页" });
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

  const initialUrl = page.url();
  await githubButton.click();
  await expect(page.getByRole("heading", { name: "全部 GitHub" })).toBeVisible();
  await brand.click();
  await expect(page.getByRole("heading", { name: "全部网站" })).toBeVisible();
  await expect(page).toHaveURL(initialUrl);
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
  await expect(page.locator(".workspace-intro")).toHaveCSS("opacity", "1");
  const homeCardBox = await page.locator(".site-card").first().boundingBox();
  const homeSearchBox = await page.locator(".workspace-intro .search-input").boundingBox();
  if (!homeSearchBox) throw new Error("Favorite search box is not visible");
  await page.getByRole("button", { name: "打开历史记录" }).click();
  await expect(page.locator("h1#history-title")).toHaveCount(1);
  await expect(page.locator(".browser-history .workspace-intro")).toHaveCSS("opacity", "1");
  const historySearchBox = await page
    .locator(".browser-history .workspace-intro .search-input")
    .boundingBox();
  if (!historySearchBox) throw new Error("History search box is not visible");
  const historyRange = page.getByRole("button", { name: "历史记录时间范围" });
  await expect(historyRange).toContainText("近 7 天");
  await historyRange.click();
  await expect(page.getByRole("listbox", { name: "历史记录时间范围选项" })).toBeVisible();
  await page.getByRole("option", { name: "近 7 天" }).click();
  expect(historySearchBox.y).toBeCloseTo(homeSearchBox.y, 0);
  expect(historySearchBox.x).toBeCloseTo(homeSearchBox.x, 0);
  expect(historySearchBox.width).toBeCloseTo(homeSearchBox.width, 0);
  const githubCard = page.locator(".history-site-card").filter({ hasText: "GitHub" });
  const exampleCard = page.locator(".history-site-card").filter({ hasText: "Example" });
  await expect(githubCard).toBeVisible();
  await expect(exampleCard).toBeVisible();
  const historyCardBox = await githubCard.boundingBox();
  if (!homeCardBox || !historyCardBox) throw new Error("Card geometry unavailable");
  expect(historyCardBox.height).toBeCloseTo(homeCardBox.height, 0);
  expect(historyCardBox.width).toBeCloseTo(homeCardBox.width, 0);
  await expect(page.locator(".history-page-header")).toHaveCount(0);
  await expect(githubCard.locator(".site-card-link")).toHaveCSS("padding-left", "0px");
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

  const overviewDragStart = await githubCard.boundingBox();
  if (!overviewDragStart) throw new Error("History overview drag source is not visible");
  await page.mouse.move(
    overviewDragStart.x + overviewDragStart.width / 2,
    overviewDragStart.y + overviewDragStart.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    overviewDragStart.x + overviewDragStart.width / 2 + 51,
    overviewDragStart.y + overviewDragStart.height / 2,
  );
  await expect(page.getByTestId("history-card-drag-preview")).toBeVisible();
  await expect(githubCard).toHaveClass(/is-dragging/);
  await expect(githubCard).toHaveCSS("opacity", "0.16");
  await expect(page.getByText("拖动历史卡片到收藏分组")).toHaveCount(0);
  await page.screenshot({
    path: screenshotPath(`browser-history-drag-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.mouse.up();
  await expect(page.getByTestId("history-card-drag-preview")).toHaveCount(0);
  await expect(githubCard).not.toHaveClass(/is-dragging/);
  await page.waitForTimeout(250);

  // Leaving the window cancels both the overlay and the dnd-kit sensor session.
  await page.mouse.move(historyCardBox.x + historyCardBox.width / 2, historyCardBox.y + historyCardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(historyCardBox.x + historyCardBox.width / 2 + 55, historyCardBox.y + historyCardBox.height / 2);
  await expect(page.getByTestId("history-card-drag-preview")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByTestId("history-card-drag-preview")).toHaveCount(0);
  await expect(githubCard).not.toHaveClass(/is-dragging/);
  await page.mouse.up();
  await page.waitForTimeout(250);

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
  await githubCard.getByRole("button", { name: "查看 GitHub 历史记录" }).click();
  await expect(githubCard.locator(".history-selection-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".history-site-detail")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".history-selection-toggle")).toHaveCount(0);

  const popupPromise = context.waitForEvent("page");
  await githubCard.getByRole("button", { name: "查看 GitHub 历史记录" }).click();
  await expect(page.getByTestId("history-site-detail-github.com")).toBeVisible();
  const titleBox = await page.locator(".history-detail-site-info strong").boundingBox();
  const domainBox = await page.locator(".history-detail-site-info span").boundingBox();
  if (!titleBox || !domainBox) throw new Error("History detail header is not visible");
  expect(domainBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
  expect(domainBox.x).toBeCloseTo(titleBox.x, 0);
  await expect(page.locator(".history-url-card")).toHaveCount(1);
  const detailCard = page.locator(".history-url-card").first();
  const detailDragStart = await detailCard.boundingBox();
  if (!detailDragStart) throw new Error("History detail drag source is not visible");
  await page.mouse.move(
    detailDragStart.x + detailDragStart.width / 2,
    detailDragStart.y + detailDragStart.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    detailDragStart.x + detailDragStart.width / 2 + 51,
    detailDragStart.y + detailDragStart.height / 2,
  );
  await expect(page.getByTestId("history-card-drag-preview")).toBeVisible();
  await expect(detailCard).toHaveClass(/is-dragging/);
  await page.screenshot({
    path: screenshotPath(`browser-history-detail-drag-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.mouse.up();
  await expect(page.getByTestId("history-card-drag-preview")).toHaveCount(0);
  await expect(detailCard).not.toHaveClass(/is-dragging/);
  await page.waitForTimeout(250);
  await page.screenshot({
    path: screenshotPath(`browser-history-detail-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.goBack();
  await expect(page.locator(".history-site-detail")).toHaveCount(0);
  await expect(githubCard).toBeVisible();
  await githubCard.getByRole("button", { name: "查看 GitHub 历史记录" }).click();
  await expect(page.getByTestId("history-site-detail-github.com")).toBeVisible();
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
  await page.getByRole("button", { name: "查看 Edge Callback 历史记录" }).click();
  await expect(page.getByText("Edge Callback Example", { exact: true })).toBeVisible();
  await expect(page.locator(".history-url-link")).toHaveAttribute("title", /访问 2 次/);
});
