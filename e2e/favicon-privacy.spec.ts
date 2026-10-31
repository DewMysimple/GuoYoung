import { expect, screenshotPath, test } from "./fixtures";

const navigation = (host: string) => `https://${host}/Private/Report?token=FAKE_TOKEN&view=AbC&view=%2f#section-2`;
const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="24" fill="#3478f6"/><path d="M32 64h64M64 32v64" stroke="white" stroke-width="12"/></svg>';

test("minimizes real mirror requests in cards and the source picker while preserving navigation", async ({ page }, testInfo) => {
  const mirrorRequests: URL[] = [];
  const offlineRequests: string[] = [];
  await page.route("https://www.google.com/s2/favicons**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("domain_url")?.includes(".example.com")) mirrorRequests.push(url);
    if (url.searchParams.get("domain_url")?.includes("offline.example.com")) {
      offlineRequests.push("google");
      await route.abort("internetdisconnected");
    } else {
      await route.fulfill({ contentType: "image/svg+xml", body: icon });
    }
  });
  await page.route("https://icons.duckduckgo.com/**", async route => {
    if (route.request().url().includes("offline.example.com")) offlineRequests.push("duckduckgo");
    await route.abort("internetdisconnected");
  });
  await page.route(/^https:\/\/(explicit|automatic|offline)\.example\.com\//, async route => {
    await route.abort("internetdisconnected");
  });
  await page.evaluate(({ navigationUrls }) => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    const group = state.groups.find((item: { workspace?: string; isProtected?: boolean }) => item.workspace !== "github" && !item.isProtected);
    const template = state.sites[0];
    state.sites = navigationUrls.map((url, index) => ({
      ...template, id: `privacy-${index}`, name: ["Explicit Example", "Automatic Example", "Offline Example"][index],
      url, customIconUrl: undefined, iconSource: index === 0 ? "google" : "auto",
      groupId: group.id, order: index, globalOrder: index,
    }));
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  }, { navigationUrls: [navigation("explicit.example.com"), navigation("automatic.example.com"), navigation("offline.example.com")] });
  await page.reload();

  for (const [index, host] of ["explicit.example.com", "automatic.example.com"].entries()) {
    const card = page.getByTestId(`site-card-privacy-${index}`);
    await expect(card.locator("img")).toHaveClass("is-loaded");
    expect(new URL(await card.locator("img").getAttribute("src") ?? "").searchParams.get("domain_url"))
      .toBe(`https://${host}`);
    await expect(card.getByRole("link")).toHaveAttribute("href", navigation(host));
  }
  await expect(page.getByTestId("site-card-privacy-2").getByTestId("favicon-fallback")).toBeVisible();
  expect(offlineRequests).toEqual(["google", "duckduckgo"]);
  expect(mirrorRequests.map(url => url.searchParams.get("domain_url")).sort())
    .toEqual(["https://automatic.example.com", "https://explicit.example.com", "https://offline.example.com"]);
  await page.screenshot({ path: screenshotPath(`favicon-origin-cards-${testInfo.project.name}.png`), fullPage: true, animations: "disabled" });

  await page.getByRole("button", { name: "编辑 Explicit Example", exact: true }).click();
  const google = page.getByRole("radio", { name: "使用高清图标", exact: true });
  await expect(google).toBeVisible();
  expect(new URL(await google.locator("img").getAttribute("src") ?? "").searchParams.get("domain_url"))
    .toBe("https://explicit.example.com");
  await expect(google).toHaveAttribute("aria-checked", "true");
  await google.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath(`favicon-origin-picker-${testInfo.project.name}.png`), fullPage: true, animations: "disabled" });
  for (const request of mirrorRequests) {
    expect([...request.searchParams]).toEqual([["domain_url", new URL(request.searchParams.get("domain_url")!).origin], ["sz", "256"]]);
    expect(request.href).not.toContain("FAKE_TOKEN");
  }
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("link", { name: "打开 Explicit Example", exact: true }))
    .toHaveAttribute("href", navigation("explicit.example.com"));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("site-hub:v1")!).sites[0].url))
    .toBe(navigation("explicit.example.com"));
});
