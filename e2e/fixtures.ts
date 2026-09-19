import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test as base } from "@playwright/test";

const manifest = JSON.parse(readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));
const screenshotDirectory = join("artifacts", "releases", `v${manifest.version}`, "screenshots");
mkdirSync(screenshotDirectory, { recursive: true });

export function screenshotPath(name: string) {
  return join(screenshotDirectory, name);
}

export { expect };
export const test = base.extend({
  page: async ({ page, context }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route(/^https:\/\/github\.com(?:\/.*)?$/, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>GitHub test target</title>" });
    });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await use(page);
    expect(errors, "Uncaught application errors").toEqual([]);
  },
});
