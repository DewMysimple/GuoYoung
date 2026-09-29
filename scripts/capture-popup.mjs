// Capture the built popup in a fresh MV3 profile with the real bookmarks API.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const extension = resolve("dist-extension");
const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"));
const output = resolve(`artifacts/releases/v${manifest.version}/screenshots`);
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "mysimple-popup-check-"));
const errors = [];
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  viewport: { width: 440, height: 600 },
  colorScheme: "light",
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const origin = `chrome-extension://${new URL(worker.url()).host}`;
  await worker.evaluate(async () => {
    const tree = await chrome.bookmarks.getTree();
    const bar = tree[0].children[0];
    const folder = await chrome.bookmarks.create({ parentId: bar.id, title: "参考资料" });
    const ideas = await chrome.bookmarks.create({ parentId: bar.id, title: "工作灵感" });
    const tools = await chrome.bookmarks.create({ parentId: bar.id, title: "开发工具" });
    const sites = await Promise.all([
      chrome.bookmarks.create({ parentId: folder.id, title: "示例文档", url: "https://example.org/docs" }),
      chrome.bookmarks.create({ parentId: folder.id, title: "开发者工具", url: "https://developer.mozilla.org/" }),
      chrome.bookmarks.create({ parentId: folder.id, title: "设计资源", url: "https://www.figma.com/" }),
      chrome.bookmarks.create({ parentId: folder.id, title: "阅读清单", url: "https://www.notion.so/" }),
    ]);
    await chrome.bookmarks.create({ parentId: ideas.id, title: "灵感示例", url: "https://example.net/ideas" });
    await chrome.bookmarks.create({ parentId: tools.id, title: "工具示例", url: "https://example.net/tools" });
    return { folderId: folder.id, siteIds: sites.map((site) => site.id) };
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const tabsApi = window.chrome?.tabs;
    if (!tabsApi) return;
    const sampleIcon = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Crect%20width='64'%20height='64'%20rx='14'%20fill='%234f7fe8'/%3E%3Cpath%20d='M22%2015v34M24%2032l20-17M24%2032l20%2017'%20stroke='white'%20stroke-width='6'%20stroke-linecap='round'/%3E%3C/svg%3E";
    Object.defineProperty(tabsApi, "query", {
      configurable: true,
      value: async () => [{
        id: 42,
        title: "目标网站示例",
        url: "https://example.org/docs",
        favIconUrl: sampleIcon,
      }],
    });
  });
  await page.goto(`${origin}/popup.html`);
  await expect(page.getByRole("button", { name: "浏览器书签" })).toBeVisible();
  assert.equal(await page.locator(".popup-brand").count(), 0, "The popup header should not show a brand name or logo");
  const quickHeaderCenterOffset = await page.locator(".popup-header").evaluate((header) => {
    const tabs = header.querySelector(".popup-tabs").getBoundingClientRect();
    const home = header.querySelector(".popup-open-home").getBoundingClientRect();
    return Math.abs((tabs.top + tabs.height / 2) - (home.top + home.height / 2));
  });
  assert.ok(quickHeaderCenterOffset <= 1, "Quick add, bookmarks, and homepage controls should share one header row");
  await expect(page.getByRole("textbox", { name: "网站名称" })).toHaveValue("目标网站示例");
  await expect(page.locator(".popup-target-icon img")).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(page.getByRole("radiogroup", { name: "添加到分组" })).toBeVisible();
  await expect(page.locator(".popup-group-option").first()).toBeEnabled();
  await expect(page.locator(".popup-target-icon .favicon-frame")).toHaveCSS("border-width", "0px");
  const quickIconCenter = await page.locator(".popup-target-icon .favicon-frame").evaluate(frame => {
    const tile = frame.getBoundingClientRect(), image = frame.querySelector("img").getBoundingClientRect();
    return { x: Math.abs(tile.left + tile.width / 2 - image.left - image.width / 2),
      y: Math.abs(tile.top + tile.height / 2 - image.top - image.height / 2) };
  });
  assert.ok(quickIconCenter.x < .5 && quickIconCenter.y < .5, "Resized favicon images remain centered in the common tile");
  const quickPopupSize = await page.locator(".popup-shell").evaluate((popup) => {
    const bounds = popup.getBoundingClientRect();
    return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  });
  assert.deepEqual(quickPopupSize, { width: 440, height: 600 }, "The quick-add tab should use the shared popup size");
  const quickLayout = await page.locator(".quick-page").evaluate((quickPage) => {
    const pageBounds = quickPage.getBoundingClientRect();
    const cardBounds = quickPage.querySelector(".popup-form-card").getBoundingClientRect();
    const groupOptions = quickPage.querySelector(".popup-group-options");
    return {
      topGap: cardBounds.top - pageBounds.top,
      bottomGap: pageBounds.bottom - cardBounds.bottom,
      groupHeight: groupOptions.getBoundingClientRect().height,
      groupScrollHeight: groupOptions.scrollHeight,
    };
  });
  assert.ok(quickLayout.topGap <= 1, "The quick-add card should begin at the top of the available page area");
  assert.ok(quickLayout.bottomGap >= 15 && quickLayout.bottomGap <= 17,
    "The quick-add card should use the available height and leave only page padding below it");
  assert.ok(quickLayout.groupHeight > 330, "The group picker should use the remaining popup height");
  assert.equal(await page.locator(".popup-group-options").evaluate((options) => getComputedStyle(options).alignContent), "start");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-quick-light.png"), animations: "disabled" });
  await page.getByRole("button", { name: "浏览器书签" }).click();
  const bookmarksHeaderCenterOffset = await page.locator(".popup-header").evaluate((header) => {
    const tabs = header.querySelector(".popup-tabs").getBoundingClientRect();
    const home = header.querySelector(".popup-open-home").getBoundingClientRect();
    return Math.abs((tabs.top + tabs.height / 2) - (home.top + home.height / 2));
  });
  assert.ok(bookmarksHeaderCenterOffset <= 1, "The one-row header should remain aligned on the bookmark tab");
  const bookmarksPopupSize = await page.locator(".popup-shell").evaluate((popup) => {
    const bounds = popup.getBoundingClientRect();
    return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  });
  assert.deepEqual(bookmarksPopupSize, quickPopupSize, "The popup frame should not resize when changing tabs");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmarks-overview-light.png"), animations: "disabled" });
  await page.getByRole("textbox", { name: "搜索书签或网址" }).click();
  const searchFocusStyle = await page.getByRole("textbox", { name: "搜索书签或网址" }).evaluate((input) => {
    const parent = input.closest(".bookmark-search");
    return {
      outline: getComputedStyle(input).outlineStyle,
      outlineWidth: getComputedStyle(input).outlineWidth,
      parentBorderColor: getComputedStyle(parent).borderColor,
      parentBoxShadow: getComputedStyle(parent).boxShadow,
      parentBounds: parent.getBoundingClientRect().toJSON(),
      inputBounds: input.getBoundingClientRect().toJSON(),
    };
  });
  assert.equal(searchFocusStyle.outline, "none", "The search input should not draw a second inner focus outline");
  assert.equal(searchFocusStyle.outlineWidth, "0px", "The search input should rely on its single shared container focus ring");
  assert.notEqual(searchFocusStyle.parentBoxShadow, "none", "The search container should retain its single focus indicator");
  assert.ok(searchFocusStyle.inputBounds.left >= searchFocusStyle.parentBounds.left && searchFocusStyle.inputBounds.right <= searchFocusStyle.parentBounds.right,
    "The search input should remain inside the shared focus surface");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmark-search-focus-light.png"), animations: "disabled" });
  await page.getByRole("button", { name: "刷新书签" }).focus();
  const destinationLayout = await page.locator(".bookmark-destination").evaluate((destination) => {
    const bounds = destination.getBoundingClientRect();
    const trigger = destination.querySelector(".popup-select-trigger").getBoundingClientRect();
    const footer = destination.closest(".bookmark-footer");
    const triggerElement = destination.querySelector(".popup-select-trigger");
    const label = destination.querySelector(".bookmark-destination-label");
    const treeBounds = document.querySelector(".bookmark-tree").getBoundingClientRect();
    return {
      width: bounds.width,
      wrapperBorderStyle: getComputedStyle(destination).borderTopStyle,
      wrapperBackground: getComputedStyle(destination).backgroundColor,
      footerBorderStyle: getComputedStyle(footer).borderTopStyle,
      footerBorderWidth: getComputedStyle(footer).borderTopWidth,
      triggerBorderStyle: getComputedStyle(triggerElement).borderTopStyle,
      triggerBackground: getComputedStyle(triggerElement).backgroundColor,
      labelText: label.textContent.trim(),
      hasExternalLabel: Boolean(destination.querySelector(":scope > span")),
      treeFooterGap: trigger.top - treeBounds.bottom,
      triggerLeft: trigger.left,
      triggerRight: trigger.right,
      containerRight: bounds.right,
    };
  });
  assert.equal(destinationLayout.wrapperBorderStyle, "none", "The destination should not draw an outer frame around its selector");
  assert.equal(destinationLayout.wrapperBackground, "rgba(0, 0, 0, 0)", "The destination wrapper should remain visually transparent");
  assert.equal(destinationLayout.footerBorderStyle, "none", "The bookmark footer should not draw a horizontal separator");
  assert.equal(destinationLayout.footerBorderWidth, "0px", "The unwanted footer line should be removed entirely");
  assert.equal(destinationLayout.triggerBorderStyle, "solid", "The destination should use one bordered select control");
  assert.notEqual(destinationLayout.triggerBackground, "rgba(0, 0, 0, 0)", "The select control should use the popup surface palette");
  assert.ok(destinationLayout.labelText.length > 0 && !destinationLayout.hasExternalLabel,
    "The selected group name should appear inside the one select control");
  assert.ok(destinationLayout.triggerLeft >= (await page.locator(".bookmark-destination").evaluate((element) => element.getBoundingClientRect().left)) && destinationLayout.triggerRight <= destinationLayout.containerRight,
    "The destination select control should fit the available footer width");
  assert.ok(destinationLayout.treeFooterGap >= 7,
    "The bookmark list border and destination control should be separated by clear whitespace");
  await page.addStyleTag({ content: ".popup-field .popup-select-popover { max-height: 190px !important; }" });
  await page.getByRole("button", { name: "默认分组" }).click();
  const lightGroupMenu = page.getByRole("listbox", { name: "默认分组" });
  await expect(lightGroupMenu).toBeVisible();
  assert.equal(await lightGroupMenu.evaluate((menu) => menu.scrollHeight > menu.clientHeight), true,
    "The popup capture should exercise the destination menu scrollbar");
  assert.equal(await lightGroupMenu.evaluate((menu) => {
    const style = getComputedStyle(menu);
    const thumb = getComputedStyle(menu, "::-webkit-scrollbar-thumb");
    return style.borderRadius === "13px" && style.scrollbarWidth === "thin" && thumb.borderRadius === "999px";
  }), true, "The destination menu and scrollbar should keep the popup's rounded style");
  assert.equal(await lightGroupMenu.evaluate((menu) => {
    const bounds = menu.getBoundingClientRect();
    const popup = document.querySelector(".popup-shell");
    if (!popup) return false;
    const popupBounds = popup.getBoundingClientRect();
    return bounds.top >= popupBounds.top && bounds.bottom <= popupBounds.bottom;
  }), true, "The bookmark destination menu stays inside the popup");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmark-select-light.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /打开书签文件夹/ }).first().click();
  await expect(page.getByRole("button", { name: "打开书签文件夹 参考资料" })).toBeVisible();
  const folderCardSize = await page.locator(".bookmark-tile.is-folder").first().evaluate((card) => {
    const bounds = card.getBoundingClientRect();
    return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  });
  assert.equal(await page.locator(".bookmark-grid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length), 4,
    "Bookmark cards should form a four-column grid");
  assert.equal(folderCardSize.height, 76, "Bookmark cards should use the compact tile height");
  assert.ok(folderCardSize.width >= 85 && folderCardSize.width <= 95, "Four-column bookmark cards should use the available row width");
  const folderRowTops = await page.locator(".bookmark-tile.is-folder").evaluateAll((cards) =>
    cards.slice(0, 3).map((card) => card.getBoundingClientRect().top),
  );
  assert.equal(folderRowTops.length, 3, "The bookmark-bar fixture should show three folders");
  assert.ok(Math.max(...folderRowTops) - Math.min(...folderRowTops) < 1, "Three bookmark folders should occupy the same row");
  assert.equal(await page.locator(".bookmark-tile.is-folder").first().evaluate((card) => getComputedStyle(card).borderTopStyle), "solid",
    "Folder bookmark tiles should have a visible card border");
  assert.notEqual(await page.locator(".bookmark-tile.is-folder").first().evaluate((card) => getComputedStyle(card).backgroundColor), "rgba(0, 0, 0, 0)",
    "Folder bookmark tiles should have a card surface");
  const folderFooterCenters = await page.locator(".bookmark-tile.is-folder .bookmark-tile-footer").first().evaluate((footer) => {
    const name = footer.querySelector(".bookmark-tile-name").getBoundingClientRect();
    const caret = footer.querySelector(".bookmark-tile-caret").getBoundingClientRect();
    return Math.abs((name.top + name.height / 2) - (caret.top + caret.height / 2));
  });
  assert.ok(folderFooterCenters < 1, "Bookmark folder name and caret should share a row");
  const folderIcon = page.locator(".bookmark-tile.is-folder .bookmark-kind").first();
  assert.equal(await folderIcon.evaluate((icon) => icon.getBoundingClientRect().width), 30,
    "Bookmark folder icon tiles should be reduced by more than 50% from the previous 64px size");
  assert.equal(await folderIcon.locator("svg").getAttribute("width"), "16",
    "Bookmark folder glyphs should be reduced by more than 50% from the previous 34px size");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmark-folders-light.png"), animations: "disabled" });
  await page.getByRole("button", { name: "打开书签文件夹 参考资料" }).click();
  await expect(page.getByText("示例文档")).toBeVisible();
  const siteCardSize = await page.locator('[data-bookmark-kind="site"]').first().evaluate((card) => {
    const bounds = card.getBoundingClientRect();
    return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  });
  assert.equal(siteCardSize.height, 76, "Website bookmark cards should use the compact tile height");
  assert.ok(siteCardSize.width >= 85 && siteCardSize.width <= 95, "Website bookmark cards should use four columns");
  const firstRowY = await page.locator('[data-bookmark-kind="site"]').evaluateAll((cards) =>
    cards.slice(0, 4).map((card) => Math.round(card.getBoundingClientRect().top)),
  );
  assert.equal(firstRowY.length, 4);
  assert.equal(new Set(firstRowY).size, 1, "Four bookmark cards should share a row");
  assert.equal(await page.locator('[data-bookmark-kind="site"]').first().evaluate((card) => getComputedStyle(card).borderTopStyle), "solid",
    "Website bookmark tiles should share the folder card frame");
  assert.notEqual(await page.locator('[data-bookmark-kind="site"]').first().evaluate((card) => getComputedStyle(card).backgroundColor), "rgba(0, 0, 0, 0)",
    "Website bookmark tiles should have a card surface");
  const favicon = page.locator('[data-bookmark-kind="site"] .favicon-frame img').first();
  assert.match(await favicon.getAttribute("src"), /_favicon\/\?pageUrl=/,
    "Bookmark website cards should use Chromium's original favicon service");
  assert.equal(await favicon.evaluate((image) => image.parentElement.getBoundingClientRect().width), 30,
    "Bookmark website favicon tiles should be reduced by more than 50% from the previous 64px size");
  await expect(favicon).toHaveClass(/is-loaded/);
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmarks-light.png"), animations: "disabled" });
  await page.getByRole("checkbox", { name: "选择 示例文档" }).check();
  const lightSelectionLayout = await page.locator(".bookmark-selection-count").evaluate((count) => {
    const counterBounds = count.getBoundingClientRect();
    const treeBounds = document.querySelector(".bookmark-tree").getBoundingClientRect();
    return { text: count.textContent.trim().replace(/\s+/g, " "), counterBottom: counterBounds.bottom, treeTop: treeBounds.top };
  });
  assert.match(lightSelectionLayout.text, /已选择 1 项/, "The selection count should update when a bookmark is selected");
  assert.ok(lightSelectionLayout.counterBottom <= lightSelectionLayout.treeTop,
    "The selection count should stay in the row above the bookmark list");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmark-selection-light.png"), animations: "disabled" });
  await page.getByRole("checkbox", { name: "选择 示例文档" }).uncheck();

  await page.getByRole("textbox", { name: "搜索书签或网址" }).fill("示例文档");
  await page.getByRole("checkbox", { name: "选择 示例文档" }).check();
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByRole("alertdialog", { name: "删除浏览器原生书签？" }))
    .toContainText("1 个网站和 0 个文件夹");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: /添加到主页/ }).click();
  await expect(page.getByRole("status")).toContainText("新增 1 个");
  const saved = await page.evaluate(async () => JSON.parse((await chrome.storage.local.get("site-hub:v1"))["site-hub:v1"]));
  const imported = saved.sites.find((site) => site.url === "https://example.org/docs");
  assert.ok(imported, "The selected bookmark should be imported");
  assert.equal(saved.groups.find((group) => group.id === imported.groupId)?.icon, "stack");

  const originalGroups = await page.evaluate(async () => {
    const key = "site-hub:v1";
    const state = JSON.parse((await chrome.storage.local.get(key))[key]);
    const groups = state.groups;
    const mainGroups = groups.filter((group) => group.workspace !== "github");
    const template = mainGroups.find((group) => !group.isProtected);
    state.groups = [...groups, ...Array.from({ length: 24 - mainGroups.length }, (_, index) => ({
      ...template, id: `capture-group-${index}`, name: `分组 ${index + 1}`, order: groups.length + index,
    }))];
    await chrome.storage.local.set({ [key]: JSON.stringify(state) });
    return groups;
  });
  await page.reload();
  await expect(page.locator(".popup-group-option")).toHaveCount(24);
  const manyGroupLayout = await page.locator(".popup-group-options").evaluate((options) => ({
    height: options.clientHeight,
    scrollHeight: options.scrollHeight,
    firstTop: options.firstElementChild.getBoundingClientRect().top - options.getBoundingClientRect().top,
    fullyVisible: Array.from(options.children).filter((item) => item.getBoundingClientRect().bottom <= options.getBoundingClientRect().bottom).length,
  }));
  assert.ok(manyGroupLayout.scrollHeight > manyGroupLayout.height, "Overflow should remain inside the group list");
  assert.ok(manyGroupLayout.firstTop <= 3, "Group choices should begin at the top without distributed blank space");
  assert.ok(manyGroupLayout.fullyVisible >= 14, "At least seven rows should fit before scrolling");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-quick-many-groups.png"), animations: "disabled" });
  await page.locator(".popup-group-option").last().click();
  await expect(page.locator(".popup-group-option").last()).toHaveAttribute("aria-checked", "true");
  const saveBounds = await page.locator(".quick-page .popup-primary").boundingBox();
  assert.ok(saveBounds.y + saveBounds.height <= 584, "The primary action should remain visible while scrolling groups");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-quick-groups-scrolled.png"), animations: "disabled" });
  await page.evaluate(async (groups) => {
    const key = "site-hub:v1";
    const state = JSON.parse((await chrome.storage.local.get(key))[key]);
    state.groups = groups;
    await chrome.storage.local.set({ [key]: JSON.stringify(state) });
  }, originalGroups);
  await page.reload();

  await page.evaluate(async () => {
    const key = "site-hub:v1";
    const state = JSON.parse((await chrome.storage.local.get(key))[key]);
    state.appearance.theme = "dark";
    await chrome.storage.local.set({ [key]: JSON.stringify(state) });
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkGroupLayout = await page.locator(".popup-group-options").evaluate((options) => ({
    height: options.clientHeight,
    scrollHeight: options.scrollHeight,
    count: options.querySelectorAll(".popup-group-option").length,
  }));
  assert.ok(darkGroupLayout.count > 0 && darkGroupLayout.scrollHeight <= darkGroupLayout.height,
    "All group choices should fit in the expanded dark-theme group area");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-quick-dark.png"), animations: "disabled" });
  await page.getByRole("button", { name: "浏览器书签" }).click();
  await page.addStyleTag({ content: ".popup-field .popup-select-popover { max-height: 190px !important; }" });
  await page.getByRole("button", { name: /打开书签文件夹/ }).first().click();
  await expect(page.getByRole("button", { name: "打开书签文件夹 参考资料" })).toBeVisible();
  await page.getByRole("checkbox", { name: "选择 参考资料" }).check();
  const darkSelectionText = await page.locator(".bookmark-selection-count").textContent();
  assert.match(darkSelectionText ?? "", /已选择 5 项/, "Selecting the folder and its four sites should update the dark-theme count");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmark-selection-dark.png"), animations: "disabled" });
  await page.getByRole("checkbox", { name: "选择 参考资料" }).uncheck();
  await page.getByRole("button", { name: "返回上一级书签文件夹" }).click();
  await page.getByRole("button", { name: "默认分组" }).click();
  const darkGroupMenu = page.getByRole("listbox", { name: "默认分组" });
  await expect(darkGroupMenu).toBeVisible();
  assert.equal(await darkGroupMenu.evaluate((menu) => menu.scrollHeight > menu.clientHeight), true,
    "The dark-theme popup capture should exercise the destination menu scrollbar");
  assert.equal(await darkGroupMenu.evaluate((menu) => {
    const style = getComputedStyle(menu);
    const thumb = getComputedStyle(menu, "::-webkit-scrollbar-thumb");
    return style.borderRadius === "13px" && style.scrollbarWidth === "thin" && thumb.borderRadius === "999px";
  }), true, "The dark-theme destination menu and scrollbar should keep the popup's rounded style");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmark-select-dark.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmarks-overview-dark.png"), animations: "disabled" });
  await page.getByRole("button", { name: /打开书签文件夹/ }).first().click();
  await expect(page.getByRole("button", { name: "打开书签文件夹 参考资料" })).toBeVisible();
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmark-folders-dark.png"), animations: "disabled" });
  await page.getByRole("button", { name: "打开书签文件夹 参考资料" }).click();
  await expect(page.locator('[data-bookmark-kind="site"] .favicon-frame img').first()).toHaveClass(/is-loaded/);
  await expect(page.locator('.bookmark-kind.site').first()).toHaveCSS("border-width", "0px");
  await expect(page.locator('.bookmark-kind.site .favicon-frame').first()).toHaveCSS("border-width", "0px");
  await page.locator(".popup-shell").screenshot({ path: join(output, "popup-production-bookmarks-dark.png"), animations: "disabled" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ version: manifest.version, popupHeader: "single-row", quickHeaderCenterOffset, bookmarksHeaderCenterOffset, brandHeaderElements: 0, quickTargetIdentity: true, quickIconCenter, inlineGroups: true, quickCardUsesAvailableHeight: true, visibleGroupHeight: Math.round(quickLayout.groupHeight), groupScrollHeight: quickLayout.groupScrollHeight, manyGroupLayout, darkVisibleGroups: darkGroupLayout.count, darkGroupHeight: darkGroupLayout.height, darkGroupScrollHeight: darkGroupLayout.scrollHeight, bookmarkGridColumns: 4, folderCardWidth: folderCardSize.width, bookmarkCardWidth: siteCardSize.width, bookmarkCardHeight: siteCardSize.height, bookmarkScrollbar: "rounded-thin", bookmarkIconTileSize: 30, bookmarkFolderGlyphSize: 16, bookmarkNavigation: "drilldown", searchFocusOutline: searchFocusStyle.outline, destinationWidth: Math.round(destinationLayout.width), treeFooterGap: destinationLayout.treeFooterGap, oneDestinationControl: true, footerSeparator: "none", selectedCountAboveList: true, errors, screenshots: 15 }));
} finally {
  await context.close();
}
