import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const chromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const manifest = JSON.parse(
  await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"),
);
const screenshotDirectory = join(
  "artifacts",
  "releases",
  `v${manifest.version}`,
  "screenshots",
);

await mkdir(screenshotDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});
const errors = [];

for (const spec of [
  { name: "desktop-light", width: 1440, height: 1100, dark: false },
  { name: "desktop-dark", width: 1440, height: 1100, dark: true },
  { name: "mobile-light", width: 390, height: 844, dark: false },
]) {
  const context = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    colorScheme: spec.dark ? "dark" : "light",
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      errors.push(
        `${spec.name}: ${message.text()}${location.url ? ` ${location.url}` : ""}`,
      );
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`${spec.name}: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (failure?.errorText.includes("ERR_BLOCKED_BY_RESPONSE")) {
      errors.push(
        `${spec.name}: ${failure.errorText} ${request.url()}`,
      );
    }
  });

  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({
    path: join(screenshotDirectory, `${spec.name}.png`),
    fullPage: true,
  });
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    title: document.title,
  }));
  console.log(spec.name, JSON.stringify(metrics));
  await context.close();
}

const dialogContext = await browser.newContext({
  viewport: { width: 920, height: 820 },
  colorScheme: "light",
});
const dialogPage = await dialogContext.newPage();
await dialogPage.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await dialogPage.getByRole("button", { name: "管理分组" }).click();
await dialogPage.screenshot({
  path: join(screenshotDirectory, "group-dialog.png"),
  fullPage: true,
});
await dialogPage.getByRole("button", { name: "关闭" }).click();
await dialogPage.getByRole("button", { name: "打开设置" }).click();
await dialogPage.waitForTimeout(280);
await dialogPage.screenshot({
  path: join(screenshotDirectory, "settings-panel.png"),
  fullPage: true,
});
await dialogPage.getByRole("button", { name: "关闭设置" }).click();
await dialogPage.getByRole("button", { name: "新建分组" }).click();
await dialogPage.screenshot({
  path: join(screenshotDirectory, "new-group-dialog.png"),
  fullPage: true,
});
await dialogPage.getByRole("button", { name: "关闭" }).click();
await dialogPage
  .getByRole("button", { name: "添加网站", exact: true })
  .click();
await dialogPage.getByLabel("网站地址").fill("douyin.com");
await dialogPage.screenshot({
  path: join(screenshotDirectory, "site-dialog.png"),
  fullPage: true,
});
await dialogContext.close();

console.log("CONSOLE_ERRORS", JSON.stringify(errors));
await browser.close();
