import { expect, test, screenshotPath } from "./fixtures";

test("keeps a deleted default GitHub group deleted after reload and workspace reentry", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  await page.getByRole("tab", { name: /仓库/ }).click();
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "管理分组", exact: true });
  await manager.getByRole("button", { name: "删除这个分组" }).click();
  await manager.getByRole("button", { name: "再次点击删除这个分组" }).click();
  await expect(manager).toBeHidden();
  await page.reload();
  await expect(page.getByText("本地数据无法读取")).toHaveCount(0);
  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  await expect(page.getByRole("tab", { name: /仓库/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /其他/ })).toBeVisible();
  await page.getByRole("button", { name: "打开收藏主页" }).click();
  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  await expect(page.getByRole("tab", { name: /仓库/ })).toHaveCount(0);
  await page.screenshot({ path: screenshotPath(`github-deleted-group-${testInfo.project.name}.png`), animations: "disabled" });
});

test("opens the independent GitHub workspace and hides one-time migration controls", async ({
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
  await expect(page.getByRole("button", { name: "刷新仓库" })).toBeVisible();
  await expect(page.getByText("GitHub 收藏已整理")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "打开 GitHub Test Repo" })).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`github-workspace-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.getByRole("button", { name: "刷新仓库" }).click();
  const refreshDialog = page.getByRole("dialog", { name: "导入作者仓库" });
  await expect(refreshDialog).toBeVisible();
  await refreshDialog.getByRole("button", { name: "返回收藏主页" }).click();

  await page.getByRole("button", { name: "管理 GitHub 官方主页" }).click();
  await expect(page.getByRole("menuitem", { name: "放回收藏主页" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /撤销上次整理/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "打开收藏主页" }).click();
  await expect(page.getByRole("heading", { name: "全部网站" })).toBeVisible();
  await expect(page.getByRole("link", { name: "打开 GitHub", exact: true })).toBeVisible();
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
  let repositoryRequestCount = 0;
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
      repositoryRequestCount += 1;
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
          ...(repositoryRequestCount > 1
            ? [{
                id: 3,
                name: "refresh-repo",
                full_name: "acme/refresh-repo",
                html_url: "https://github.com/acme/refresh-repo",
                private: false,
                fork: false,
                archived: false,
              }]
            : []),
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
  await page.getByRole("button", { name: "刷新仓库" }).click();
  await expect(page.getByRole("dialog", { name: "导入作者仓库" })).toHaveCount(0);
  const refreshReport = page.getByRole("dialog", { name: "GitHub 刷新详情" });
  await expect(refreshReport).toBeVisible();
  await expect(refreshReport).toHaveCSS("opacity", "1");
  await expect(refreshReport.getByText("@acme")).toBeVisible();
  await expect(refreshReport.getByText("acme/refresh-repo")).toBeVisible();
  await expect(refreshReport.getByText("新增 1 个")).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`github-refresh-details-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await refreshReport.getByRole("button", { name: "知道了" }).click();
  await expect(page.locator(".transfer-banner")).toContainText("已刷新 1 个作者仓库");
});

test("opens the GitHub home entry from its card surface", async ({ page, context }, testInfo) => {
  await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
  const entry = page.locator(".github-home-entry");
  await expect(entry).toBeVisible();
  const box = await entry.boundingBox();
  if (!box) throw new Error("GitHub home entry is not visible");
  const refreshButton = page.getByRole("button", { name: "刷新仓库" });
  const menuButton = page.getByRole("button", { name: "管理 GitHub 官方主页" });
  const refreshBox = await refreshButton.boundingBox();
  const menuBox = await menuButton.boundingBox();
  if (!refreshBox || !menuBox) throw new Error("GitHub home actions are not visible");
  expect(refreshBox.width).toBeCloseTo(menuBox.width, 1);
  expect(refreshBox.height).toBeCloseTo(menuBox.height, 1);
  const restingChrome = await entry.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
    };
  });
  await expect(refreshButton).toHaveCSS("background-color", "rgb(51, 103, 214)");
  await expect(refreshButton).toHaveCSS("color", "rgb(247, 249, 253)");

  const requestPromise = context.waitForEvent("request", {
    predicate: (request) => request.url().startsWith("https://github.com"),
  });
  const popupPromise = context.waitForEvent("page");
  await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.5);
  await expect.poll(() => entry.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
  const hoverChrome = await entry.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
    };
  });
  expect(hoverChrome).toEqual(restingChrome);
  await expect
    .poll(() =>
      page.locator(".collection-section").evaluate((element) =>
        getComputedStyle(element, "::before").content,
      ),
    )
    .toBe("none");
  await page.screenshot({
    path: screenshotPath(`github-home-entry-hover-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.mouse.click(box.x + box.width * 0.38, box.y + box.height * 0.5);
  await popupPromise;
  expect((await requestPromise).url()).toContain("github.com");
  expect(
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return state.sites.find((site: { id: string }) => site.id === "github")?.clickCount;
    }),
  ).toBe(1);

  await menuButton.click();
  const menu = page.locator(".github-home-entry-menu-popover");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS("background-color", "rgb(249, 250, 252)");
  await expect(menu).toHaveCSS("backdrop-filter", "none");
  const deleteItem = menu.getByRole("menuitem", { name: "删除官方入口" });
  expect(await deleteItem.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.closest("[role='menuitem']") === element;
  })).toBe(true);
  await page.screenshot({
    path: screenshotPath(`github-home-entry-menu-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await deleteItem.click();
  await expect(menu.getByRole("menuitem", { name: "再次点击删除官方入口" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();
});
