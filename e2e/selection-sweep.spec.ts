import { expect, test, screenshotPath } from "./fixtures";
import type { Page } from "@playwright/test";

async function enter(page: Page, view: "flat" | "focused" | "grouped") {
  await page.setViewportSize({ width: 1440, height: 1100 });
  if (view === "focused") await page.locator('[data-group-drop-id="develop"]').click();
  if (view === "grouped") {
    await page.getByRole("button", { name: "显示", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  }
  await page.getByRole("button", { name: view === "grouped" ? "多选 搜索 网站" : "多选", exact: true }).click();
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
    // Revisit through the gap: no toggling and no filling the skipped cards.
    await page.mouse.move(b.x + b.width / 2, b.y - 4, { steps: 3 });
    await page.mouse.move(a.x + a.width / 2, a.y - 4, { steps: 5 });
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator("[data-site-dnd-id].is-selected")).toHaveCount(2);
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
