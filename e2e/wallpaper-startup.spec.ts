import { expect, test, screenshotPath } from "./fixtures";

test("paints saved local wallpaper before the app and covers GitHub entry surfaces", async ({ page }, info) => {
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 960; canvas.height = 640;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 960, 640);
    gradient.addColorStop(0, "#2b698c"); gradient.addColorStop(1, "#bde6d5");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 960, 640);
    ctx.strokeStyle = "#e2ffff"; ctx.lineWidth = 4;
    for (let y = 0; y < 640; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(300, y - 80, 700, y + 80, 960, y); ctx.stroke(); }
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("site-hub-assets", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("wallpapers");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("wallpapers", "readwrite");
        tx.objectStore("wallpapers").put(blob, "startup-local");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.wallpaper = { ...state.wallpaper, source: "local", localAssetId: "startup-local", overlay: 0, glassTransparency: 88, glassBlur: 8, glassRefraction: true };
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:wallpaper-startup:v1") || "null")?.key)).toBe("local:startup-local");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/src/main.tsx", async route => { await gate; await route.continue(); });
  try {
    await page.reload({ waitUntil: "commit" });
    await expect(page.locator("#wallpaper-startup img")).toBeVisible();
    expect(await page.locator("#wallpaper-startup img").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(page.locator(".site-card")).toHaveCount(0);
    await page.screenshot({ path: screenshotPath(`wallpaper-before-app-${info.project.name}.png`) });
  } finally { release(); }
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  await expect(page.locator("#wallpaper-startup")).toHaveCount(0);
  await page.getByRole("button", { name: "打开 GitHub 收藏", exact: true }).click();
  const entry = page.locator(".github-home-entry");
  await expect(entry).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect.poll(() => entry.evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toContain("wallpaper-glass-lens");
  await page.getByRole("button", { name: "管理 GitHub 官方主页" }).click();
  await expect(page.getByRole("menu")).toHaveCSS("backdrop-filter", /blur\(8px\)/);
  await page.screenshot({ path: screenshotPath(`github-glass-startup-${info.project.name}.png`) });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "打开设置" }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  await panel.getByRole("button", { name: "清除壁纸" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:wallpaper-startup:v1")!).key)).toBe("local:startup-local");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/has-wallpaper/);
  await page.getByRole("button", { name: "打开设置" }).click();
  await panel.getByRole("tab", { name: /壁纸/ }).click();
  await panel.getByRole("button", { name: "清除壁纸" }).click();
  await panel.getByRole("button", { name: "保存设置" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("site-hub:wallpaper-startup:v1"))).toBeNull();
  await page.reload();
  await expect(page.locator(".app-shell")).not.toHaveClass(/has-wallpaper/);
  await expect(page.locator("#wallpaper-startup")).toHaveCount(0);
});

test("an uncached failed wallpaper releases startup into a usable collection", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://wallpaper.example/broken.png", async route => { await gate; await route.abort(); });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.wallpaper = { ...state.wallpaper, source: "url", url: "https://wallpaper.example/broken.png" };
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  });
  try {
    await page.reload({ waitUntil: "commit" });
    await expect(page.getByRole("status", { name: "" }).filter({ hasText: "正在读取收藏" })).toBeAttached();
    await expect(page.locator(".app-loading, .loading-mark")).toHaveCount(0);
    await expect(page.locator(".site-card")).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  await expect(page.locator(".site-card").first()).toBeVisible();
  await expect(page.locator("#wallpaper-startup")).toHaveCount(0);
});

