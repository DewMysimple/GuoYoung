import { expect, test, screenshotPath } from "./fixtures";

test("manager circles toggle ABC on each return without release and preserve editor and storage", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop manager sweep");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "管理分组" });
  const checks = dialog.locator(".group-manager-list .group-manager-check:not(:disabled)");
  const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));
  const editor = await dialog.getByLabel("分组名称").inputValue();
  await checks.nth(1).click();
  const a = (await checks.first().boundingBox())!, c = (await checks.nth(2).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  for (const forward of [true, false, true]) {
    await page.mouse.move(a.x + a.width / 2, forward ? c.y + c.height + 5 : a.y - 5);
    for (let i = 0; i < 3; i++) await expect(checks.nth(i)).toHaveAttribute("aria-pressed", String((i === 1) !== forward));
    await expect(checks.nth(3)).toHaveAttribute("aria-pressed", "false");
    await expect(dialog.getByLabel("分组名称")).toHaveValue(editor);
    await expect(page.locator(".group-list-item-drag-preview")).toHaveCount(0);
    await page.screenshot({ path: screenshotPath(`manager-circles-${forward ? "selected" : "returned"}-held.png`) });
  }
  await page.mouse.up();
  await expect(checks.nth(2)).toHaveAttribute("aria-pressed", "true");
  // Movement inside one circle never toggles repeatedly; release adds no click.
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + 2, c.y + 2);
  await expect(checks.nth(2)).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(c.x + c.width - 2, c.y + c.height - 2);
  await expect(checks.nth(2)).toHaveAttribute("aria-pressed", "false");
  await page.mouse.up();
  await expect(checks.nth(2)).toHaveAttribute("aria-pressed", "false");
  await checks.first().click();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, c.y + c.height + 5);
  for (let i = 0; i < 3; i++) await expect(checks.nth(i)).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(a.x + a.width / 2, a.y - 5);
  await expect(dialog.locator(".group-manager-list .group-manager-check[aria-pressed='true']")).toHaveCount(0);
  await page.mouse.up();
  await expect(dialog.locator(".group-manager-check:disabled")).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
});

test("manager sweeps ignore names and protected circles, cancel cleanly, and keep click/Shift/keyboard selection", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop manager sweep lifecycle");
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "管理分组" });
  const checks = dialog.locator(".group-manager-list .group-manager-check:not(:disabled)");
  const a = (await checks.first().boundingBox())!, b = (await checks.nth(1).boundingBox())!;
  const names = dialog.locator(".group-list-select");
  await names.nth(1).click();
  await expect(dialog.getByLabel("分组名称")).toHaveValue("开发");
  const name = (await names.first().boundingBox())!;
  await page.mouse.move(name.x + name.width / 2, name.y + name.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.up();
  await expect(dialog.locator(".group-manager-list [aria-pressed='true'].group-manager-check")).toHaveCount(0);
  for (const reason of ["blur", "pointercancel"]) {
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, a.y - 5);
    await page.evaluate(reason => window.dispatchEvent(reason === "blur" ? new Event(reason) : new PointerEvent(reason, { pointerId: 1 })), reason);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.up();
    await expect(checks.nth(1)).toHaveAttribute("aria-pressed", "false");
  }
  const protectedBox = (await dialog.locator(".group-manager-check:disabled").boundingBox())!;
  await page.mouse.move(protectedBox.x + protectedBox.width / 2, protectedBox.y + protectedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.up();
  await expect(checks.nth(1)).toHaveAttribute("aria-pressed", "false");
  await checks.first().click();
  await checks.nth(2).click({ modifiers: ["Shift"] });
  for (let i = 0; i < 3; i++) await expect(checks.nth(i)).toHaveAttribute("aria-pressed", "true");
  await checks.nth(2).focus();
  await page.keyboard.press("Space");
  await expect(checks.nth(2)).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "管理分组", exact: true }).click();
  await expect(dialog.locator(".group-manager-list .group-manager-check[aria-pressed='true']")).toHaveCount(0);
});
