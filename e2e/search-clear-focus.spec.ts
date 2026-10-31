import { expect, test } from "./fixtures";

test("keeps direct typing in the search input after mouse and keyboard clear in every workspace", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const calls = { searches: [] as string[], deletions: 0 };
    (window as typeof window & { searchClearCalls?: typeof calls }).searchClearCalls = calls;
    Object.defineProperty(globalThis, "chrome", { configurable: true, value: {
      runtime: { id: "search-clear-test" },
      search: { query: async ({ text }: { text: string }) => { calls.searches.push(text); } },
      permissions: { contains: async () => true, request: async () => true },
      history: {
        search: async ({ text }: { text: string }) => [{ id: "synthetic", title: "Synthetic history", url: "https://example.com/history", lastVisitTime: Date.now() }]
          .filter(item => `${item.title} ${item.url}`.toLowerCase().includes(text.toLowerCase())),
        deleteUrl: async () => { calls.deletions++; },
        deleteRange: async () => { calls.deletions++; },
        deleteAll: async () => { calls.deletions++; },
      },
    } });
  });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.searchHistory = [{ query: "Synthetic saved search", searchedAt: "2026-10-31T00:00:00Z" }];
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "搜索网页或筛选收藏", exact: true })).not.toBeFocused();
  const observations: { workspace: string; activation: string; focused: boolean; activeTag: string; input: string }[] = [];
  for (const workspace of ["collection", "github", "history"]) {
    await page.getByRole("button", { name: workspace === "collection" ? "打开收藏主页" : workspace === "github" ? "打开 GitHub 收藏" : "打开历史记录", exact: true }).click();
    const history = workspace === "history";
    const search = page.getByRole("searchbox", { name: history ? "搜索浏览历史" : "搜索网页或筛选收藏", exact: true });
    await expect(search).toBeVisible();
    const group = history ? null : page.getByRole("tab", { name: workspace === "collection" ? /设计/ : /仓库/ });
    if (group) await group.click();
    for (const activation of ["mouse", "Enter", "Space"]) {
      await search.fill("prior query");
      const clear = page.getByRole("button", { name: history ? "清空历史搜索" : "清空搜索", exact: true });
      if (activation === "mouse") await clear.click();
      else {
        await search.focus();
        await page.keyboard.press("Tab");
        await expect(clear).toBeFocused();
        await page.keyboard.press(activation);
      }
      await expect(clear).toHaveCount(0);
      const focus = await search.evaluate(input => ({ focused: document.activeElement === input, activeTag: document.activeElement?.tagName ?? "none" }));
      if (group) await expect(group).toHaveAttribute("aria-selected", "true");
      await page.keyboard.type("next query");
      observations.push({ workspace, activation, ...focus, input: await search.inputValue() });
      await search.fill("");
    }
    if (history) {
      await expect(page.locator(".history-site-card")).toHaveCount(1);
      await expect(page.getByRole("button", { name: "搜索网页", exact: true })).toHaveCount(0);
    }
  }
  await testInfo.attach("search-clear-focus", { body: JSON.stringify(observations, null, 2), contentType: "application/json" });
  expect(observations).toEqual(["collection", "github", "history"].flatMap(workspace =>
    ["mouse", "Enter", "Space"].map(activation => ({ workspace, activation, focused: true, activeTag: "INPUT", input: "next query" }))));
  expect(await page.evaluate(() => (window as typeof window & { searchClearCalls?: unknown }).searchClearCalls))
    .toEqual({ searches: [], deletions: 0 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).searchHistory))
    .toEqual([{ query: "Synthetic saved search", searchedAt: "2026-10-31T00:00:00Z" }]);

  await page.getByRole("button", { name: "打开收藏主页", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "搜索网页或筛选收藏", exact: true });
  await search.click();
  await expect(page.getByRole("listbox", { name: "最近搜索" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "最近搜索" })).toHaveCount(0);
  await search.blur();
  await search.focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => (window as typeof window & { searchClearCalls?: { searches: string[] } }).searchClearCalls?.searches)).toEqual([]);
  await page.keyboard.press("ArrowDown");
  await expect(search).toHaveValue("");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as typeof window & { searchClearCalls?: { searches: string[] } }).searchClearCalls?.searches))
    .toEqual(["Synthetic saved search"]);
});
