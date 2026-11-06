import type { Page } from "@playwright/test";
import { expect, screenshotPath, test } from "./fixtures";

const design = (page: Page) => page.getByRole("tab", { name: /^设计/ });
const title = (page: Page) => page.locator("#collection-title");
const folder = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^打开子分组 ${name}`) });
const site = (page: Page, name: string) => page.getByRole("link", { name: `打开 ${name}`, exact: true });
const manager = (page: Page) => page.getByRole("dialog", { name: "管理分组" });
const all = (page: Page) => page.getByRole("tab", { name: /^全部/ });

async function manage(page: Page) {
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  await expect(manager(page)).toBeVisible();
}

async function createChild(page: Page, name: string, capture = false) {
  await manage(page);
  await manager(page).getByRole("button", { name: "创建子分组" }).click();
  const dialog = page.getByRole("dialog", { name: "新建子分组" });
  await dialog.getByLabel("分组名称").fill(name);
  if (capture) await page.screenshot({ path: screenshotPath("folders-create.png") });
  await dialog.getByRole("button", { name: "创建子分组" }).click();
  await expect(folder(page, name)).toBeVisible();
}

async function moveSelected(page: Page, group: string, capture = false) {
  await page.getByRole("button", { name: "移动至分组" }).click();
  const dialog = page.getByRole("dialog", { name: "移动至分组" });
  await dialog.locator("label.category-choice").filter({ has: page.getByText(group, { exact: true }) }).click();
  await expect(dialog.getByRole("radio", { name: group, exact: true })).toBeChecked();
  if (capture) await page.screenshot({ path: screenshotPath("folders-move.png") });
  await dialog.getByRole("button", { name: "移动网站" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("desktop folders", () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "Desktop folder acceptance");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("creates folders, hides contents in both home layouts, and restores folder navigation and search", async ({ page }) => {
    await expect(site(page, "Figma")).toBeVisible();
    await page.screenshot({ path: screenshotPath("folders-legacy-home.png") });
    await design(page).click();
    await createChild(page, "UI 灵感", true);
    await createChild(page, "图标资源");
    await expect(folder(page, "UI 灵感")).toHaveAccessibleName(/0 个网站/);
    await expect(page.getByRole("tab", { name: /UI 灵感/ })).toHaveCount(0);
    await page.screenshot({ path: screenshotPath("folders-parent.png") });

    await folder(page, "UI 灵感").focus();
    await page.keyboard.press("Space");
    await expect(title(page)).toHaveText("UI 灵感");
    await expect(title(page)).toBeFocused();
    const path = page.getByRole("navigation", { name: "收藏路径" });
    await expect(path).toHaveText("全部网站/设计/UI 灵感");
    const back = page.getByRole("button", { name: "返回设计", exact: true });
    const [backBox, titleBox, pathBox, homeCrumb] = await Promise.all([
      back.boundingBox(), title(page).boundingBox(), path.boundingBox(), path.getByRole("button", { name: "全部网站" }).boundingBox(),
    ]);
    expect(backBox!.x).toBe(titleBox!.x);
    expect(backBox!.x + backBox!.width).toBeLessThan(homeCrumb!.x);
    expect(pathBox!.height).toBe(homeCrumb!.height);
    expect(titleBox!.y).toBe(pathBox!.y + pathBox!.height + 4);
    await expect(design(page)).toHaveAttribute("aria-selected", "true");
    for (const index of [1, 2, 3]) {
      await page.getByRole("button", { name: "在UI 灵感分组添加网站" }).click();
      const dialog = page.getByRole("dialog", { name: "添加网站" });
      await expect(dialog.getByRole("radio", { name: "设计 / UI 灵感" })).toBeChecked();
      await dialog.getByLabel("网站地址").fill(`https://example.com/folder-test-${index}`);
      await dialog.getByLabel("网站名称").fill(`收纳站点 ${index}`);
      await dialog.getByLabel("网站备注").fill(`收藏核验备注 ${index}`);
      await dialog.getByRole("button", { name: "添加网站", exact: true }).click();
    }
    await expect(site(page, "收纳站点 3")).toBeVisible();
    await page.screenshot({ path: screenshotPath("folders-child.png") });
    await page.reload();
    await expect(title(page)).toHaveText("UI 灵感");
    await page.goBack();
    await expect(title(page)).toHaveText("设计");
    await expect(folder(page, "UI 灵感")).toHaveAccessibleName(/3 个网站/);
    await expect(site(page, "收纳站点 1")).toHaveCount(0);
    await page.goForward();
    await expect(title(page)).toHaveText("UI 灵感");

    const search = page.getByRole("searchbox", { name: "搜索网页或筛选收藏" });
    await search.fill("收藏核验备注 2");
    await expect(site(page, "收纳站点 2")).toBeVisible();
    await expect(page.locator(".site-card").filter({ has: site(page, "收纳站点 2") })).toContainText("设计 / UI 灵感");
    await search.fill("UI 灵感");
    await expect(site(page, "收纳站点 1")).toBeVisible();
    await page.getByRole("button", { name: "打开数据" }).click();
    await page.goBack();
    await expect(search).toHaveValue("UI 灵感");
    await page.getByRole("button", { name: "清空搜索" }).click();
    await expect(title(page)).toHaveText("UI 灵感");

    await page.getByRole("button", { name: "返回设计" }).click();
    await expect(title(page)).toHaveText("设计");
    await expect(site(page, "Figma")).toBeVisible();
    await expect(site(page, "收纳站点 1")).toHaveCount(0);
    await all(page).click();
    for (const mode of ["按分组显示", "全部平铺"]) {
      await page.getByRole("button", { name: "显示", exact: true }).click();
      await page.getByRole("menuitemradio", { name: mode }).click();
      await expect(folder(page, "UI 灵感")).toBeVisible();
      await expect(site(page, "收纳站点 1")).toHaveCount(0);
      if (mode === "按分组显示") {
        await folder(page, "UI 灵感").scrollIntoViewIfNeeded();
        const scrollTop = await page.evaluate(() => window.scrollY);
        expect(scrollTop).toBeGreaterThan(0);
        await folder(page, "UI 灵感").press("Enter");
        await expect(title(page)).toHaveText("UI 灵感");
        await page.goBack();
        await expect(title(page)).toHaveText("全部网站");
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scrollTop, 0);
        await page.goForward();
        await expect(title(page)).toHaveText("UI 灵感");
        await page.getByRole("button", { name: "返回全部", exact: true }).click();
        await expect(title(page)).toHaveText("全部网站");
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scrollTop, 0);
      }
    }
    await folder(page, "UI 灵感").press("Enter");
    await expect(title(page)).toHaveText("UI 灵感");
    await page.getByRole("button", { name: "打开 GitHub 收藏" }).click();
    await expect(title(page)).toHaveText("全部 GitHub");
    await expect(page.getByRole("navigation", { name: "收藏路径" })).toHaveCount(0);
  });

  test("moves only visible sites, handles group changes, and supports safe deletion and trash confirmation", async ({ page }) => {
    await design(page).click();
    await createChild(page, "设计资料");
    await page.getByRole("button", { name: "多选", exact: true }).click();
    await page.getByRole("button", { name: "选择 Figma", exact: true }).click();
    await moveSelected(page, "设计 / 设计资料", true);
    await expect(site(page, "Figma")).toHaveCount(0);
    await page.getByRole("button", { name: "多选", exact: true }).click();
    await page.getByRole("button", { name: "全选", exact: true }).click();
    await page.getByRole("button", { name: "移动至分组" }).click();
    const moveDialog = page.getByRole("dialog", { name: "移动至分组" });
    await expect(moveDialog).toContainText("为所选的 1 个网站");
    await moveDialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await folder(page, "设计资料").click();
    await expect(site(page, "Figma")).toBeVisible();
    await page.getByRole("button", { name: "多选", exact: true }).click();
    await page.getByRole("button", { name: "全选", exact: true }).click();
    await moveSelected(page, "设计");
    await expect(folder(page, "设计资料")).toHaveCount(0);
    await page.getByRole("button", { name: "返回设计" }).click();
    await expect(site(page, "Figma")).toBeVisible();

    await folder(page, "设计资料").click();
    await manage(page);
    await manager(page).getByRole("button", { name: "所属一级分组" }).click();
    await page.getByRole("option", { name: "学习", exact: true }).click();
    await manager(page).getByRole("button", { name: "保存分组" }).click();
    await expect(title(page)).toHaveText("设计");
    await expect(folder(page, "设计资料")).toHaveCount(0);
    await page.getByRole("tab", { name: /^学习/ }).click();
    await folder(page, "设计资料").click();
    await manage(page);
    await manager(page).getByRole("button", { name: "更多分组操作" }).click();
    await manager(page).getByRole("menuitem", { name: "删除这个分组" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "连同网站删除…" }).click();
    await expect(page.getByRole("alertdialog")).toHaveAccessibleName("确认删除“设计资料”？");
    await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
    await manager(page).getByRole("button", { name: "更多分组操作" }).click();
    await manager(page).getByRole("menuitem", { name: "删除这个分组" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "保留网站并删除文件夹" }).click();
    await expect(title(page)).toHaveText("学习");
    await expect(folder(page, "设计资料")).toHaveCount(0);

    await design(page).click();
    await createChild(page, "晋升资料");
    await manage(page);
    await manager(page).getByRole("button", { name: "更多分组操作" }).click();
    await manager(page).getByRole("menuitem", { name: "删除这个分组" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "解散分组" }).click();
    await expect(page.getByRole("tab", { name: /^晋升资料/ })).toBeVisible();
    await expect(design(page)).toHaveCount(0);
    await expect(site(page, "Figma")).toBeVisible();
  });

  test("matches website geometry with compact square cards on dark glass wallpaper", async ({ page }) => {
    const wallpaperUrl = "https://folder-wallpaper.example/landscape.svg";
    await page.route(wallpaperUrl, route => route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><defs><linearGradient id="bg"><stop stop-color="#283457"/><stop offset="1" stop-color="#74565e"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/><circle cx="1050" cy="250" r="230" fill="#547977"/></svg>',
    }));
    await page.evaluate(url => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      const parent = state.groups.find((group: { id: string }) => group.id === "design");
      state.groups.push(
        { ...parent, id: "dark-folder-a", parentId: "design", name: "灵感文件夹", icon: "folder", order: 0 },
        { ...parent, id: "dark-folder-b", parentId: "design", name: "这是一个很长的子分组名称用来检查卡片文字截断与布局", icon: "folder", order: 1 },
      );
      state.appearance = { ...state.appearance, theme: "dark", cardShape: "square", cardHeight: 142, cardLayout: "columns", cardColumns: 5 };
      state.wallpaper = { ...state.wallpaper, source: "url", url };
      localStorage.setItem("site-hub:v1", JSON.stringify(state));
    }, wallpaperUrl);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
    await design(page).click();
    const folderCard = page.getByTestId("folder-card-dark-folder-a");
    await expect(folderCard).toBeVisible();
    const folderBounds = await folderCard.boundingBox();
    const siteBounds = await page.locator(".site-card").filter({ has: site(page, "Figma") }).boundingBox();
    expect(folderBounds?.width).toBeCloseTo(siteBounds!.width);
    expect(folderBounds?.height).toBeCloseTo(siteBounds!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
    await page.screenshot({ path: screenshotPath("folders-dark-wallpaper-square.png") });
    await folder(page, "灵感文件夹").press("Enter");
    await expect(title(page)).toHaveText("灵感文件夹");
    await page.getByRole("button", { name: "返回设计" }).click();
    await expect(title(page)).toHaveText("设计");
  });
});
