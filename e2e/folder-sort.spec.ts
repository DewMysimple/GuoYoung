import type { Locator, Page } from "@playwright/test";
import type { SiteCollectionState } from "../src/types";
import { expect, screenshotPath, test } from "./fixtures";

async function seedFolders(page: Page) {
  await page.evaluate(() => {
    const state: SiteCollectionState = JSON.parse(localStorage.getItem("site-hub:v1")!);
    const parent = state.groups.find(group => group.id === "search")!;
    state.groups.push(
      { ...parent, id: "folder-x", name: "资源参考", icon: "folder", parentId: parent.id, order: 0 },
      { ...parent, id: "folder-y", name: "界面灵感", icon: "palette", parentId: parent.id, order: 1 },
    );
    parent.entryOrder = ["site:google", "folder:folder-x", "site:bing", "folder:folder-y"];
    state.sites.push({
      ...state.sites[0], id: "folder-link", name: "内部测试链接", url: "https://example.com/folder-link",
      groupId: "folder-y", order: 0, globalOrder: state.sites.length,
    });
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
}

function parentOrder(page: Page) {
  return page.locator('[data-group-zone-id="search"] > .site-card[data-testid]').evaluateAll(
    cards => cards.map(card => card.getAttribute("data-testid")),
  );
}

async function box(card: Locator) {
  await card.scrollIntoViewIfNeeded();
  const rect = await card.boundingBox();
  if (!rect) throw new Error("Card is not visible");
  return rect;
}

const originalOrder = ["site-card-google", "folder-card-folder-x", "site-card-bing", "folder-card-folder-y"];

test.describe("mixed folder drag on desktop", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop pointer and keyboard coverage");

  test("reorders folders and websites together with the frozen card slots and preserves the result after refresh", async ({ page }) => {
    await seedFolders(page);
    const folder = page.getByTestId("folder-card-folder-x");
    const bing = page.getByTestId("site-card-bing");
    const preview = page.getByTestId("folder-card-drag-preview");
    await expect.poll(() => parentOrder(page)).toEqual(originalOrder);
    const start = await box(folder);
    const target = await box(bing);
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 49, y);
    await expect(folder).toHaveClass(/is-drag-pending/);
    await expect(preview).toBeHidden();
    await page.screenshot({ path: screenshotPath("folder-sort-pending.png") });
    await page.mouse.move(x + 51, y);
    await expect(preview).toBeVisible();
    await expect(folder).toHaveCSS("opacity", "0.46");
    await page.mouse.move(target.x + target.width * 0.65, target.y + target.height / 2, { steps: 10 });
    await expect(bing).toHaveClass(/is-drop-target/);
    await expect.poll(async () => (await bing.boundingBox())?.x ?? target.x).toBeLessThan(target.x - 30);
    await page.screenshot({ path: screenshotPath("folder-sort-folder-over-site.png") });
    await page.mouse.up();

    const folderMoved = ["site-card-google", "site-card-bing", "folder-card-folder-x", "folder-card-folder-y"];
    await expect.poll(() => parentOrder(page)).toEqual(folderMoved);
    await page.reload();
    await expect.poll(() => parentOrder(page)).toEqual(folderMoved);

    const google = await box(page.getByTestId("site-card-google"));
    const last = page.getByTestId("folder-card-folder-y");
    const destination = await box(last);
    await page.mouse.move(google.x + google.width / 2, google.y + google.height / 2);
    await page.mouse.down();
    await page.mouse.move(google.x + google.width / 2 + 51, google.y + google.height / 2);
    await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
    await page.mouse.move(destination.x + destination.width * 0.65, destination.y + destination.height / 2, { steps: 10 });
    await expect(last).toHaveClass(/is-drop-target/);
    await page.screenshot({ path: screenshotPath("folder-sort-site-over-folder.png") });
    await page.mouse.up();
    const siteMoved = ["site-card-bing", "folder-card-folder-x", "folder-card-folder-y", "site-card-google"];
    await expect.poll(() => parentOrder(page)).toEqual(siteMoved);
    await page.reload();
    await expect.poll(() => parentOrder(page)).toEqual(siteMoved);
    await expect(page.getByTestId("site-card-folder-link")).toHaveCount(0);
    await page.screenshot({ path: screenshotPath("folder-sort-committed.png") });
  });

  test("folder cancellation keeps the current view and non-manual sorting keeps the folders available", async ({ page }) => {
    await seedFolders(page);
    const folder = page.getByTestId("folder-card-folder-x");
    const rect = await box(folder);
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const preview = page.getByTestId("folder-card-drag-preview");
    for (const cancel of [
      () => page.keyboard.press("Escape"),
      () => page.evaluate(() => window.dispatchEvent(new Event("blur"))),
    ]) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 51, y);
      await expect(preview).toBeVisible();
      await cancel();
      await expect(preview).toBeHidden();
      await expect(folder).toHaveCSS("opacity", "1");
      await page.mouse.up();
      await expect.poll(() => parentOrder(page)).toEqual(originalOrder);
    }
    const open = page.getByRole("button", { name: "打开子分组 资源参考，0 个网站" });
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 49, y);
    await page.mouse.up();
    await expect(open).toHaveCount(0);
    await page.goBack();
    await expect(open).toBeVisible();

    await page.getByRole("button", { name: "手动排列" }).click();
    await page.getByRole("menuitemradio", { name: "名称 A–Z" }).click();
    await expect.poll(() => parentOrder(page)).toEqual([
      "folder-card-folder-x", "folder-card-folder-y", "site-card-bing", "site-card-google",
    ]);
    await expect(folder).toHaveAttribute("data-drag-disabled", "true");
    await open.press("Space");
    await expect(open).toHaveCount(0);
    await page.goBack();
    await expect(open).toBeVisible();
  });

  test("keeps foreign folder slots out of cross-group site drops", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await seedFolders(page);
    const folder = page.getByTestId("folder-card-folder-x");
    const github = page.getByTestId("site-card-github");
    const from = await box(github);
    const target = await box(folder);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 51, from.y + from.height / 2);
    await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await expect(folder).not.toHaveClass(/is-drop-target/);
    await page.mouse.up();
    await expect(github).toHaveAttribute("data-site-group-id", "search");
    await expect(folder).toHaveAttribute("data-folder-parent-id", "search");
    await expect(page.getByRole("button", { name: "打开子分组 资源参考，0 个网站" })).toBeVisible();
  });
});
