import { expect, test } from "./fixtures";

test("preserves navigation URLs through adding, editing, refreshing and group import", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "This iteration targets desktop browsers");
  const original = "https://example.com/docs#installation";
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByRole("menuitem", { name: /添加网站/ }).click();
  let dialog = page.getByRole("dialog", { name: "添加网站" });
  await dialog.getByLabel("网站地址").fill(original);
  await dialog.getByLabel("网站名称").fill("Navigation Guide");
  await dialog.getByRole("button", { name: "添加网站", exact: true }).click();
  await expect(page.getByRole("link", { name: "打开 Navigation Guide", exact: true })).toHaveAttribute("href", original);
  await page.reload();
  const link = page.getByRole("link", { name: "打开 Navigation Guide", exact: true });
  await expect(link).toHaveAttribute("href", original);

  const edited = "https://example.com/Guide?id=AbC&id=abc&next=/docs/#Part/";
  await page.getByRole("button", { name: "编辑 Navigation Guide", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "编辑网站" });
  await expect(dialog.getByLabel("网站地址")).toHaveValue(original);
  await dialog.getByLabel("网站地址").fill(edited);
  await dialog.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(link).toHaveAttribute("href", edited);
  await page.reload();
  await expect(page.getByRole("link", { name: "打开 Navigation Guide", exact: true })).toHaveAttribute("href", edited);

  await page.getByRole("button", { name: "打开数据" }).click();
  const imported = "https://example.com/#/dashboard";
  const payload = {
    format: "site-hub-group-export", exportVersion: 1, exportedAt: "2026-10-30T00:00:00Z",
    group: { name: "URL Fidelity", icon: "folder" },
    sites: [
      { name: "Hash Route", url: imported, order: 0 },
      { name: "Case Variant", url: edited.replace("Guide", "guide"), order: 1 },
      { name: "Exact Duplicate", url: edited, order: 2 },
    ],
  };
  await page.getByLabel("选择要导入的数据文件").setInputFiles({
    name: "urls.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page.getByRole("button", { name: "预览并导入" }).click();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "已导入 2 个网站" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "打开 Hash Route", exact: true })).toHaveAttribute("href", imported);
  await expect(page.getByRole("link", { name: "打开 Case Variant", exact: true })).toHaveAttribute("href", edited.replace("Guide", "guide"));
  await expect(page.getByRole("link", { name: "打开 Exact Duplicate", exact: true })).toHaveCount(0);
});
