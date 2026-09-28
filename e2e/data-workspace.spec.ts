import { readFile } from "node:fs/promises";
import { expect, test, screenshotPath } from "./fixtures";

const payload = {
  format: "site-hub-group-export", exportVersion: 1, exportedAt: "2026-09-28T00:00:00Z",
  group: { name: "共享收藏", icon: "folder" },
  sites: [{ name: "Data Example", url: "https://data.example/", order: 0 }],
};

test("imports a group into a new folder only after confirmation and survives refresh", async ({ page }, testInfo) => {
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).sites.length);
  await page.getByRole("button", { name: "打开数据" }).click();
  await expect(page.getByRole("dialog", { name: "设置" })).toHaveCount(0);
  await page.getByLabel("选择要导入的数据文件").setInputFiles({ name: "shared.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)) });
  await page.getByLabel("新分组名称", { exact: true }).fill("我的共享收藏");
  await page.screenshot({ path: screenshotPath(`data-import-preview-${testInfo.project.name}.png`), fullPage: true });
  await page.getByRole("button", { name: "预览并导入" }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).sites.length)).toBe(before);
  await page.getByRole("button", { name: "预览并导入" }).click();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "已导入 1 个网站" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "打开 Data Example" })).toBeVisible();
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    const group = state.groups.find((item: { name: string }) => item.name === "我的共享收藏");
    return state.sites.find((item: { name: string }) => item.name === "Data Example").groupId === group.id;
  })).toBe(true);
});

test("exports selected groups and reopens the collection as a selectable import", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "打开数据" }).click();
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: /指定分组/ }).click();
  const checkboxes = page.getByRole("checkbox");
  await checkboxes.nth(0).check(); await checkboxes.nth(1).check();
  await page.screenshot({ path: screenshotPath(`data-export-selection-${testInfo.project.name}.png`), fullPage: true });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const downloaded = await download;
  const text = await readFile((await downloaded.path())!, "utf8");
  const exported = JSON.parse(text);
  expect(exported.format).toBe("site-hub-groups-export"); expect(exported.groups).toHaveLength(2);
  await page.getByRole("button", { name: "导入", exact: true }).click();
  await page.getByLabel("选择要导入的数据文件").setInputFiles({ name: "groups.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await page.getByRole("checkbox").nth(1).uncheck();
  await expect(page.getByText("已选择 1 / 2 个分组")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("region", { name: "数据页面" })).toHaveCount(0);
});
