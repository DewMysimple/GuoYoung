import { expect, test, screenshotPath } from "./fixtures";

test("manager circles support all, inverse, range and confirmed batch deletion", async ({ page }, info) => {
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "管理分组", exact: true });
  await manager.getByRole("button", { name: "全选可删除分组", exact: true }).click();
  await expect(manager.getByRole("status", { name: "分组选择数量" })).toHaveText("已选 5 个分组 · 12 个网站");
  await expect(manager.getByRole("button", { name: "选择 其他 分组", exact: true })).toBeDisabled();
  await manager.getByRole("button", { name: "反选", exact: true }).click();
  await expect(manager.getByRole("button", { name: "删除所选", exact: true })).toBeDisabled();
  await manager.getByRole("button", { name: "选择 搜索 分组", exact: true }).click();
  await manager.getByRole("button", { name: "选择 开发 分组", exact: true }).click({ modifiers: ["Shift"] });
  await expect(manager.getByRole("status", { name: "分组选择数量" })).toHaveText("已选 2 个分组 · 5 个网站");
  // Editing a name does not mutate the independent batch selection.
  await manager.locator(".group-list-select").filter({ hasText: "设计" }).click();
  await manager.getByLabel("分组名称", { exact: true }).fill("设计草稿");
  const titleSize = await manager.locator(".group-editor-summary strong").boundingBox();
  expect(titleSize!.width).toBeGreaterThan(50);
  expect(titleSize!.height).toBeLessThan(30);
  await page.screenshot({ path: screenshotPath(`manager-batch-${info.project.name}.png`), animations: "disabled" });
  await manager.getByRole("button", { name: "删除所选", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "删除 2 个分组？" });
  await expect(confirm).toContainText("5 个网站移入回收站");
  await confirm.getByRole("button", { name: "取消", exact: true }).click();
  await expect(manager.getByRole("status", { name: "分组选择数量" })).toHaveText("已选 2 个分组 · 5 个网站");
  await manager.getByRole("button", { name: "删除所选", exact: true }).click();
  await confirm.getByRole("button", { name: "删除所选分组", exact: true }).click();
  await expect(manager.getByRole("button", { name: "选择 搜索 分组", exact: true })).toHaveCount(0);
  await expect(manager.getByRole("button", { name: "选择 设计 分组", exact: true })).toBeVisible();
  await manager.getByRole("button", { name: "保存分组", exact: true }).click();
  await page.reload();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  expect(state.groups.some((g: {id:string}) => ["search","develop"].includes(g.id))).toBe(false);
  expect(state.groups.some((g: {id:string}) => g.id === "other")).toBe(true);
  expect(state.deletedSites).toHaveLength(5);
  expect(state.groups.find((g: {id:string}) => g.id === "design").name).toBe("设计草稿");
});

test("search finds live IME text, pinyin, initials and ranks direct matches first", async ({ page }, info) => {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.sites.push({ ...state.sites[0], id: "kimi", name: "Kimi", url: "https://kimi.com", groupId: "search", order: 20, globalOrder: 20 });
    state.groups.find((g: {id:string}) => g.id === "search").name = "Kimi工具";
    state.searchHistory = [{ query: "Blender", searchedAt: new Date().toISOString() }];
    state.sortModeByWorkspace.main = "name-asc";
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  const input = page.getByRole("searchbox", { name: "搜索网页或筛选收藏" });
  await input.focus();
  await expect(page.getByRole("listbox", { name: "最近搜索" })).toBeVisible();
  const ime = await page.context().newCDPSession(page);
  await ime.send("Input.imeSetComposition", { text: "k'i'mi", selectionStart: 6, selectionEnd: 6 });
  await expect(page.getByTestId("site-card-kimi")).toBeVisible();
  await expect(page.locator(".site-card").first()).toHaveAttribute("data-testid", "site-card-kimi");
  await expect(page.getByRole("listbox", { name: "最近搜索" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "相关度", exact: true })).toBeDisabled();
  const pagesBefore = page.context().pages().length;
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, keyCode: 229 });
  await expect(page.getByTestId("site-card-kimi")).toBeVisible();
  expect(page.context().pages()).toHaveLength(pagesBefore);
  await expect(page).toHaveURL(/127\.0\.0\.1/);
  await ime.send("Input.insertText", { text: "Kimi" });
  await input.dispatchEvent("compositionend", { data: "Kimi" });
  for (const query of ["blbl", "bilibili", "bi'li'bi'li"]) {
    await input.fill(query);
    await expect(page.getByTestId("site-card-bilibili")).toBeVisible();
  }
  await input.fill("sj figma");
  await expect(page.getByTestId("site-card-figma")).toBeVisible();
  await expect(page.locator(".site-card")).toHaveCount(1);
  await input.fill("wjbk");
  await expect(page.getByTestId("site-card-wikipedia")).toBeVisible();
  await page.screenshot({ path: screenshotPath(`search-initials-${info.project.name}.png`), animations: "disabled" });
  await input.fill("k'i'mi");
  await page.screenshot({ path: screenshotPath(`search-ime-${info.project.name}.png`), animations: "disabled" });
  await input.fill("");
  await expect(page.locator(".site-card")).toHaveCount(13);
});

test("group preview shows recognizable content and Add stays visible without hovering", async ({ page }, info) => {
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  await page.mouse.move(0, 0);
  const add = page.getByRole("button", { name: "在 搜索 附近添加分组", exact: true });
  await expect(add).toHaveCSS("opacity", "1");
  const header = page.locator('[data-group-sort-section-id="search"] .grouped-site-header-main');
  await header.scrollIntoViewIfNeeded();
  const box = (await header.boundingBox())!;
  const touch = info.project.name === "mobile" ? await page.context().newCDPSession(page) : null;
  if (touch) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 20, y: box.y + box.height / 2 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 50, y: box.y + box.height / 2 + 24 }] });
  } else {
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + box.height / 2 + 24, { steps: 6 });
  }
  const preview = page.getByTestId("group-sort-vertical-drag-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("2 个网站");
  await expect(preview).toContainText("Google");
  await expect(preview).toContainText("Bing");
  const size = (await preview.boundingBox())!;
  expect(size.height).toBeGreaterThan(95);
  expect(size.width).toBeLessThanOrEqual(Math.min(361, page.viewportSize()!.width - 31));
  await page.screenshot({ path: screenshotPath(`group-preview-content-${info.project.name}.png`), animations: "disabled" });
  if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  else { await page.keyboard.press("Escape"); await page.mouse.up(); }
  await expect(preview).toHaveCount(0);
});
