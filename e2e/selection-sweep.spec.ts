import { expect, test, screenshotPath } from "./fixtures";
import type { Page } from "@playwright/test";
import { assertHeldRoundTrips } from "./sweep-helpers";

async function enter(page: Page, view: "flat" | "focused" | "grouped") {
  await page.setViewportSize({ width: 1440, height: 1100 });
  if (view === "focused") await page.locator('[data-group-drop-id="develop"]').click();
  if (view === "grouped") {
    await page.getByRole("button", { name: "显示", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  }
  await page.getByRole("button", { name: view === "grouped" ? "多选 搜索 网站" : "多选", exact: true }).click();
}

async function seedSweepCards(page: Page, includeUntouched = false) {
  await page.evaluate(includeUntouched => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    const template = state.sites.find((site: { id: string }) => site.id === "github");
    const names = includeUntouched ? ["A", "B", "C", "D", "untouched"] : ["A", "B", "C", "D"];
    state.sites = names.map((name, i) => ({ ...template, id: `sweep-${name}`, name: `Sweep ${name}`, order: i, globalOrder: i }));
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  }, includeUntouched);
  await page.reload();
}

for (const view of ["flat", "focused", "grouped"] as const) {
  for (const steps of [1, 12, 60]) {
    test(`ABCD center reversal is stable at ${steps} steps in ${view}`, async ({ page }, info) => {
      test.skip(info.project.name !== "chromium", "Desktop sweep event density");
      await seedSweepCards(page, true);
      await enter(page, view);
      const targets = page.locator('[data-site-dnd-id="sweep-A"], [data-site-dnd-id="sweep-B"], [data-site-dnd-id="sweep-C"], [data-site-dnd-id="sweep-D"]');
      await expect(targets).toHaveCount(4);
      const untouched = page.getByTestId("site-card-sweep-untouched");
      const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
      for (const mixed of [false, true]) {
        if (mixed) {
          // The first gesture ends with ABCD selected; retain B/D and clear A/C.
          await targets.nth(0).click();
          await targets.nth(2).click();
          await untouched.click();
        }
        await assertHeldRoundTrips(page, targets, { steps, selected: "class" });
        await expect(untouched).toHaveClass(mixed ? /is-selected/ : /^(?!.*is-selected)/);
        await expect(page.getByTestId("site-card-drag-preview")).toHaveCount(0);
        expect(await targets.evaluateAll(elements => elements.every(element => getComputedStyle(element).transform === "none"))).toBe(true);
      }
      expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
    });
  }

  test(`ABCD edge and gap samples toggle each card once per pass in ${view}`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "Desktop sweep boundary sampling");
    await seedSweepCards(page);
    await enter(page, view);
    const targets = page.locator('[data-site-dnd-id^="sweep-"]');
    const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
    await assertHeldRoundTrips(page, targets, { steps: 1, selected: "class", boundaries: true });
    await expect(page.getByTestId("site-card-drag-preview")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
  });
}

for (const view of ["flat", "focused"] as const) {
  test(`all/cancel selection uses only the current ${view} collection and restores its controls`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "Desktop collection selection");
    await enter(page, view);
    const controls = page.locator(".collection-view-controls");
    await expect(controls.getByRole("button")).toHaveText(view === "flat" ? ["手动排列", "全选", "取消"] : ["全选", "取消"]);
    const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
    const cards = page.locator("[data-site-dnd-id]");
    const count = await cards.count();
    await controls.getByRole("button", { name: "全选", exact: true }).click();
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(count);
    await expect(controls.getByRole("button", { name: "取消全选" })).toHaveAttribute("aria-pressed", "true");
    if (view === "focused") expect(await cards.evaluateAll(els => [...new Set(els.map(el => el.getAttribute("data-site-group-id")))])).toEqual(["develop"]);
    await controls.getByRole("button", { name: "取消全选" }).click();
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(0);
    await expect(controls.getByRole("button", { name: "取消", exact: true })).toHaveAttribute("aria-pressed", "true");
    await controls.getByRole("button", { name: "取消", exact: true }).click();
    await expect(controls.getByRole("button", { name: "手动排列" })).toBeVisible();
    await expect(controls.getByRole("button", { name: "多选", exact: true })).toBeVisible();
    if (view === "flat") await expect(controls.getByRole("button", { name: "显示", exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
  });
}

for (const view of ["flat", "focused", "grouped"] as const) {
  test(`a sweep toggles mixed selections on re-entry in ${view} view`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "Desktop mouse sweep");
    await enter(page, view);
    const cards = page.locator("[data-site-dnd-id]");
    const first = cards.first(), last = cards.nth(view === "grouped" ? 1 : 2);
    const untouched = cards.nth(view === "grouped" ? 2 : 1);
    await first.click();
    await untouched.click();
    const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
    for (const reverse of [false, true]) {
      const a = (await (reverse ? last : first).boundingBox())!;
      const b = (await (reverse ? first : last).boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2, a.y - 4, { steps: 4 });
      await page.mouse.move(b.x + b.width / 2, b.y - 4, { steps: 4 });
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
      await expect(first).not.toHaveClass(/is-selected/);
      await expect(last).toHaveClass(/is-selected/);
      // Exit and re-enter both endpoints without releasing the mouse.
      await page.mouse.move(b.x + b.width / 2, b.y - 4, { steps: 3 });
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
      await page.mouse.move(b.x + b.width / 2, b.y - 4, { steps: 3 });
      await page.mouse.move(a.x + a.width / 2, a.y - 4, { steps: 4 });
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 3 });
      await page.mouse.up();
      await expect(first).toHaveClass(/is-selected/);
      await expect(last).not.toHaveClass(/is-selected/);
      await expect(untouched).toHaveClass(/is-selected/);
      await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(2);
      await expect(page.getByTestId("site-card-drag-preview")).toHaveCount(0);
    }
    expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
  });

  test(`held mouse selects only cards on its path in ${view} view, preserves clicks and never drags`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "Desktop mouse sweep");
    await enter(page, view);
    const cards = page.locator("[data-site-dnd-id]");
    const first = cards.first(), last = cards.nth(view === "grouped" ? 1 : 2);
    const a = (await first.boundingBox())!, b = (await last.boundingBox())!;
    const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
    const pages = page.context().pages().length;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(a.x + a.width / 2, a.y - 4, { steps: 5 });
    await page.mouse.move(b.x + b.width / 2, b.y - 4, { steps: 5 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
    await expect(first).toHaveClass(/is-selected/);
    await expect(last).toHaveClass(/is-selected/);
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(2);
    await expect(page.getByTestId("site-card-drag-preview")).toHaveCount(0);
    expect(await cards.evaluateAll(els => els.every(el => getComputedStyle(el).transform === "none" && !el.matches(".is-dragging,.is-drag-pending")))).toBe(true);
    // Revisit through the gap toggles the start, leaving skipped cards alone.
    await page.mouse.move(b.x + b.width / 2, b.y - 4, { steps: 3 });
    await page.mouse.move(a.x + a.width / 2, a.y - 4, { steps: 5 });
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect(first).not.toHaveClass(/is-selected/);
    await expect(last).toHaveClass(/is-selected/);
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(1);
    const untouched = cards.nth(view === "grouped" ? 2 : 1);
    await untouched.hover();
    await expect(untouched).not.toHaveClass(/is-selected/);
    await untouched.click();
    await expect(untouched).toHaveClass(/is-selected/);
    await untouched.click();
    await expect(untouched).not.toHaveClass(/is-selected/);
    expect(page.context().pages().length).toBe(pages);
    expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
    await page.screenshot({ path: screenshotPath(`selection-sweep-${view}.png`) });
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-site-dnd-id].is-selection-mode")).toHaveCount(0);
  });
}

for (const view of ["flat", "focused", "grouped"] as const) {
  test(`ABC toggles on repeated forward and reverse passes with one mouse press in ${view}`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "Desktop continuous sweep");
    await enter(page, view);
    const cards = ["github", "stackoverflow", "codepen"].map(id => page.getByTestId(`site-card-${id}`));
    await cards[0].scrollIntoViewIfNeeded();
    await cards[1].click();
    const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
    const boxes = await Promise.all(cards.map(async card => (await card.boundingBox())!));
    const first = boxes[0], last = boxes[2];
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    for (const forward of [true, false, true]) {
      const end = forward ? last : first;
      await page.mouse.move(forward ? end.x + end.width + 5 : end.x - 5, end.y + end.height / 2);
      for (let i = 0; i < cards.length; i++) {
        await expect(cards[i]).toHaveClass((i === 1) !== forward ? /is-selected/ : /^(?!.*is-selected)/);
      }
      await expect(page.getByTestId("site-card-drag-preview")).toHaveCount(0);
    }
    await page.mouse.up();
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(2);
    await cards[0].click();
    await cards[2].click();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width + 5, last.y + last.height / 2);
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(3);
    await page.mouse.move(first.x - 5, first.y + first.height / 2);
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(0);
    await page.mouse.up();
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
  });
}

test("a sweep crosses groups without selecting untouched cards and Shift continues from its last hit", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop cross-group sweep");
  await enter(page, "grouped");
  const google = page.getByTestId("site-card-google"), github = page.getByTestId("site-card-github");
  const a = (await google.boundingBox())!, b = (await github.boundingBox())!;
  await page.mouse.move(a.x + 30, a.y + 45);
  await page.mouse.down();
  await page.mouse.move(a.x - 8, a.y + 45, { steps: 3 });
  await page.mouse.move(a.x - 8, b.y + 45, { steps: 8 });
  await page.mouse.move(b.x + 30, b.y + 45, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(2);
  await expect(google).toHaveClass(/is-selected/);
  await expect(github).toHaveClass(/is-selected/);
  await page.getByRole("button", { name: "选择 CodePen", exact: true }).click({ modifiers: ["Shift"] });
  await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(4);
  await expect(page.getByTestId("site-card-bing")).not.toHaveClass(/is-selected/);
  await expect(page.getByTestId("site-card-stackoverflow")).toHaveClass(/is-selected/);
});

test("cancelled or blurred sweep sessions cannot resume and a new press can select again", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop pointer lifecycle");
  await enter(page, "flat");
  const google = page.getByTestId("site-card-google"), bing = page.getByTestId("site-card-bing");
  const a = (await google.boundingBox())!, b = (await bing.boundingBox())!;
  for (const event of ["blur", "pointercancel"]) {
    await page.mouse.move(a.x + 20, a.y + 30);
    await page.mouse.down();
    await page.mouse.move(a.x + 35, a.y + 30);
    await page.evaluate(event => window.dispatchEvent(event === "blur" ? new Event(event) : new PointerEvent(event, { pointerId: 1 })), event);
    await page.mouse.move(b.x + 20, b.y + 30);
    await page.mouse.up();
    await expect(bing).not.toHaveClass(/is-selected/);
    await bing.click();
    await expect(bing).toHaveClass(/is-selected/);
    await bing.click();
  }
  await page.locator(".collection-heading h2").click();
  await expect(page.getByRole("button", { name: "多选", exact: true })).toBeVisible();
});

test("public glass controls open in one disclosure and keep draft/save behavior", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop settings disclosure");
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
  const glass = panel.locator(".wallpaper-settings > details").filter({ has: page.locator("summary").filter({ hasText: /^玻璃外观/ }) });
  await expect(glass.getByRole("slider")).toHaveCount(0);
  await glass.locator(":scope > summary").click();
  await expect(glass.getByRole("slider")).toHaveCount(8);
  await expect(glass.locator("details")).toHaveCount(0);
  await glass.getByRole("slider", { name: "玻璃透明度", exact: true }).fill("61");
  await glass.locator(":scope > summary").click();
  await glass.locator(":scope > summary").click();
  await expect(glass.getByRole("slider", { name: "玻璃透明度", exact: true })).toHaveValue("61");
  await page.screenshot({ path: screenshotPath("glass-single-disclosure.png") });
  await panel.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("tab", { name: "壁纸", exact: true }).click();
  await glass.locator(":scope > summary").click();
  await expect(glass.getByRole("slider", { name: "玻璃透明度", exact: true })).toHaveValue("61");
});
