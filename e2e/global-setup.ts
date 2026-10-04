import { chromium, expect, type FullConfig } from "@playwright/test";

/** Vite readiness only covers HTML. Compile the initial module graph before
 * individual tests start their interaction budget, using disposable storage. */
export default async function prepareApp(config: FullConfig) {
  const { baseURL, channel } = config.projects[0].use;
  if (!baseURL) throw new Error("Application baseURL is required");
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage();
    await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
  } finally {
    await browser.close();
  }
}
