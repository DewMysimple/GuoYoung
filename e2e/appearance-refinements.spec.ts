import { expect, test } from "./fixtures";

test("keeps wallpaper navigation readable and composite inputs on a single glass layer", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop wallpaper controls");
  await page.route("https://readability.example/dark.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#082015"/></svg>' }));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.appearance = { ...state.appearance, theme: "light", textColorMode: "custom", textColor: "#888888", textSecondaryColor: "#888888" };
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://readability.example/dark.svg", overlay: 0 };
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/topbar-readable/);
  await expect(page.locator(".topbar .brand")).toHaveCSS("color", "rgb(136, 136, 136)");
  await expect(page.locator(".category-tab").nth(1)).toHaveCSS("color", "rgb(136, 136, 136)");
  await page.getByRole("button", { name: "新建分组", exact: true }).click();
  const input = page.getByRole("textbox", { name: "分组名称" });
  await input.focus();
  await expect(input).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(input).toHaveCSS("outline-style", "none");
  await expect(input).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".input-shell")).toHaveCSS("background-color", /\/ 0\.18\)/);
  await expect(page.locator(".input-shell")).toHaveCSS("border-top-color", "rgb(51, 103, 214)");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("tab", { name: "壁纸", exact: true }).click();
  await page.locator("summary").filter({ hasText: "顶栏外观" }).click();
  await page.getByRole("checkbox", { name: /顶部清晰阅读/ }).uncheck();
  await expect(page.locator(".topbar .brand")).toHaveCSS("color", "rgb(136, 136, 136)");
  await page.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await expect(page.locator(".app-shell")).not.toHaveClass(/topbar-readable/);
});

test("remembers settings section, expanded groups and scroll only for this page", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop settings workflow");
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("tab", { name: "壁纸", exact: true }).click();
  await page.locator("summary").filter({ hasText: "玻璃外观" }).click();
  await page.locator("summary").filter({ hasText: "玻璃参数微调" }).click();
  await page.getByRole("slider", { name: "边缘高光" }).scrollIntoViewIfNeeded();
  const body = page.locator(".settings-body");
  const scroll = await body.evaluate(node => node.scrollTop);
  expect(scroll).toBeGreaterThan(100);
  await page.getByRole("button", { name: "关闭设置" }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(page.getByRole("tab", { name: "壁纸", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("slider", { name: "边缘高光" })).toBeVisible();
  await expect.poll(() => body.evaluate(node => node.scrollTop)).toBeCloseTo(scroll, -1);
  await page.reload();
  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(page.getByRole("tab", { name: "外观", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("saves the complete tab title and preserves the last brand editor location", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop settings workflow");
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: "名称与图标" }).click();
  await page.getByRole("textbox", { name: "标签页名称" }).fill("我的专属起点");
  await expect(page).toHaveTitle("我的专属起点");
  await page.getByRole("button", { name: "保存设置" }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(page.getByRole("textbox", { name: "标签页名称" })).toHaveValue("我的专属起点");
  await page.reload();
  await expect(page).toHaveTitle("我的专属起点");
});

test("previews and crops an image larger than 5MB before saving a portable logo", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop image editor");
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: "名称与图标" }).click();
  const buffer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="800" height="800" fill="red"/><rect x="800" width="800" height="800" fill="blue"/><!--${"x".repeat(6 * 1024 * 1024)}--></svg>`);
  await page.getByLabel("选择 Logo 图片").setInputFiles({ name: "large-logo.svg", mimeType: "image/svg+xml", buffer });
  const editor = page.getByRole("dialog", { name: "调整 Logo 图片" });
  await editor.getByRole("button", { name: "圆形", exact: true }).click();
  await editor.getByRole("checkbox", { name: /裁切选定区域/ }).check();
  await editor.getByRole("slider", { name: "裁切水平位置" }).fill("100");
  await editor.getByRole("button", { name: "压缩并应用" }).click();
  await expect(editor).toHaveCount(0);
  const mark = page.locator(".topbar .brand-mark-custom");
  await expect(mark).toHaveAttribute("data-shape", "circle");
  const pixel = await mark.locator("img").evaluate(async (node: HTMLImageElement) => {
    await node.decode();
    const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
    const context = canvas.getContext("2d")!; context.drawImage(node, 0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  });
  expect(pixel[2]).toBeGreaterThan(240);
  expect(pixel[0]).toBeLessThan(20);
  await page.getByRole("button", { name: "保存设置" }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!));
  expect(saved.brand.logoDataUrl.length).toBeLessThan(1024 * 1024);
  await page.reload();
  await expect(mark).toHaveAttribute("data-shape", "circle");
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: "名称与图标" }).click();
  await page.getByRole("button", { name: "裁切与压缩图片" }).click();
  await editor.getByRole("button", { name: "长方形", exact: true }).click();
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await expect(mark).toHaveAttribute("data-shape", "circle");
});
