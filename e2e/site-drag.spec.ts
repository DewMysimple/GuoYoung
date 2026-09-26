import { expect, test, screenshotPath } from "./fixtures";

test("drags beyond 50px without waiting and keeps the order after refresh", async ({
  page,
}) => {
  const googleCard = page.getByTestId("site-card-google");
  const bingCard = page.getByTestId("site-card-bing");
  const start = await googleCard.boundingBox();
  const target = await bingCard.boundingBox();
  if (!start || !target) throw new Error("Drag targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height * 0.65);
  await page.mouse.down();
  await expect(googleCard).toHaveClass(/is-drag-pending/);
  await page.mouse.move(
    start.x + start.width / 2 + 51,
    start.y + start.height * 0.65,
  );
  const dragPreview = page.getByTestId("site-card-drag-preview");
  await expect(dragPreview).toBeVisible();
  await page.mouse.move(
    target.x + target.width * 0.75,
    target.y + target.height / 2,
    { steps: 12 },
  );
  const previewBox = await dragPreview.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(Math.abs(previewBox!.width - start.width)).toBeLessThan(2);
  await expect
    .poll(async () => (await bingCard.boundingBox())?.x ?? target.x)
    .toBeLessThan(target.x - 30);
  await page.mouse.up();

  const visibleIds = () =>
    page.locator(".site-grid > .site-card").evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-testid")),
    );
  await expect
    .poll(async () => (await visibleIds())[0])
    .toBe("site-card-bing");

  const reorderedIds = await visibleIds();
  expect(reorderedIds[0]).not.toBe("site-card-google");
  await page.reload();
  expect(await visibleIds()).toEqual(reorderedIds);
});

test("cancels a site drag when the browser window loses focus", async ({
  page,
}, testInfo) => {
  const googleCard = page.getByTestId("site-card-google");
  const start = await googleCard.boundingBox();
  if (!start) throw new Error("Drag source is not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 51, start.y + start.height / 2);
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.screenshot({
    path: screenshotPath(`site-drag-focus-loss-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByTestId("site-card-drag-preview")).toBeHidden();
  await expect(page.locator(".site-card.is-dragging")).toHaveCount(0);
  await page.mouse.up();
});

test("uses card overlap and moves the target frame before drop", async ({
  page,
}) => {
  const googleCard = page.getByTestId("site-card-google");
  const bingCard = page.getByTestId("site-card-bing");
  const start = await googleCard.boundingBox();
  const target = await bingCard.boundingBox();
  if (!start || !target) throw new Error("Drag targets are not visible");

  const grabX = start.x + 8;
  const grabY = start.y + start.height / 2;
  const partialTravel = Math.max(55, (target.x - start.x) * 0.65);
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 51, grabY);
  await page.mouse.move(grabX + partialTravel, grabY);

  await expect(bingCard).toHaveClass(/is-drop-target/);
  await expect(bingCard).toHaveCSS("border-style", "dashed");
  await expect(bingCard).toHaveCSS("opacity", "0.78");
  await expect(googleCard).toHaveCSS("opacity", "0.26");
  await expect
    .poll(async () => (await googleCard.boundingBox())?.x ?? start.x)
    .toBeGreaterThan(target.x - 3);
  const targetFrame = await googleCard.boundingBox();
  expect(targetFrame).not.toBeNull();
  expect(Math.abs(targetFrame!.x - target.x)).toBeLessThan(3);

  await page.mouse.up();
  await expect
    .poll(async () =>
      page.locator(".site-grid > .site-card").first().getAttribute("data-testid"),
    )
    .toBe("site-card-bing");
});

test("keeps unrelated cards neutral during a transfer drag", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop transfer hover assertion");

  await page.getByRole("button", { name: "手动排列" }).click();
  await page.getByRole("menuitemradio", { name: "名称 A–Z" }).click();

  const googleCard = page.getByTestId("site-card-google");
  const bingCard = page.getByTestId("site-card-bing");
  const start = await googleCard.boundingBox();
  const target = await bingCard.boundingBox();
  if (!start || !target) throw new Error("Transfer targets are not visible");
  const neutralBorder = await bingCard.evaluate(
    (element) => getComputedStyle(element).borderColor,
  );

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 51, start.y + start.height / 2);
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);

  await expect(bingCard).not.toHaveClass(/is-drop-target/);
  await expect
    .poll(() => bingCard.evaluate((element) => getComputedStyle(element).borderColor))
    .toBe(neutralBorder);
  await page.mouse.up();
});

test("keeps the original order when the live target frame returns to source", async ({
  page,
}) => {
  const googleCard = page.getByTestId("site-card-google");
  const bingCard = page.getByTestId("site-card-bing");
  const start = await googleCard.boundingBox();
  const target = await bingCard.boundingBox();
  if (!start || !target) throw new Error("Drag targets are not visible");

  const visibleIds = () =>
    page.locator(".site-grid > .site-card").evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-testid")),
    );
  const before = await visibleIds();

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 51, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 10,
  });
  await expect(bingCard).toHaveClass(/is-drop-target/);

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2, {
    steps: 10,
  });
  await expect(bingCard).not.toHaveClass(/is-drop-target/);
  await page.mouse.up();

  await expect.poll(visibleIds).toEqual(before);
  await page.reload();
  await expect.poll(visibleIds).toEqual(before);
});

test("a click with 49px pointer movement still opens the site", async ({
  page,
  context,
}) => {
  const requestPromise = context.waitForEvent("request", {
    predicate: (request) => request.url().startsWith("https://github.com"),
  });
  const card = page.getByTestId("site-card-github");
  const box = await card.boundingBox();
  if (!box) throw new Error("GitHub card is not visible");
  const popupPromise = context.waitForEvent("page");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.58);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 49,
    box.y + box.height * 0.58,
  );
  await page.mouse.up();
  await popupPromise;
  expect((await requestPromise).url()).toContain("github.com");
});

test("moving card C to card A does not open the dragged site", async ({
  page,
  context,
}) => {
  const card = page.getByTestId("site-card-github");
  const target = page.getByTestId("site-card-google");
  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) throw new Error("Drag cards are not visible");

  const initialPageCount = context.pages().length;
  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(250);

  expect(context.pages()).toHaveLength(initialPageCount);
  await expect
    .poll(async () =>
      page.locator(".site-grid > .site-card").first().getAttribute("data-testid"),
    )
    .toBe("site-card-github");
});

test("moves a non-manually sorted card across grouped rows and keeps All grouped", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop grouped transfer assertion");
  await page.setViewportSize({ width: 1280, height: 1000 });

  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "名称 A–Z" }).click();
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const google = page.getByTestId("site-card-google");
  const github = page.getByTestId("site-card-github");
  const developTrack = page.locator('[data-group-zone-id="develop"]');
  const start = await google.boundingBox();
  const target = await github.boundingBox();
  if (!start || !target) throw new Error("Transfer targets are not visible");

  await expect(google).toHaveAttribute("data-drag-mode", "transfer");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 14,
  });

  let targetNudge = 0;
  await expect
    .poll(async () => {
      const offset = targetNudge++ % 2 === 0 ? -2 : 2;
      await page.mouse.move(
        target.x + target.width / 2 + offset,
        target.y + target.height / 2,
      );
      await page.waitForTimeout(32);
      return developTrack.evaluate((element) =>
        element.classList.contains("is-group-drag-over"),
      );
    })
    .toBe(true);
  await expect(github).not.toHaveClass(/is-drop-target/);
  expect(await github.evaluate((element) => element.style.transform)).toBe("");

  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "google").groupId;
  })).toBe("develop");
  await expect(page.getByRole("tab", { name: /全部/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: /开发/ })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await expect(page.locator(".grouped-site-section")).toHaveCount(6);
  await expect(
    developTrack.getByTestId("site-card-google"),
  ).toBeVisible();

  const sortedNames = await developTrack.locator(".site-card .site-name").allTextContents();
  expect(sortedNames).toEqual(
    [...sortedNames].sort((a, b) => a.localeCompare(b, "zh-CN", { sensitivity: "base" })),
  );
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    const developSites = state.sites.filter(
      (site: { groupId: string }) => site.groupId === "develop",
    );
    const google = developSites.find((site: { id: string }) => site.id === "google");
    return google.order === Math.max(...developSites.map((site: { order: number }) => site.order));
  })).toBe(true);

  await page.reload();
  await expect(page.locator('[data-group-zone-id="develop"]').getByTestId("site-card-google")).toBeVisible();
});

test("treats a same-group drop as a no-op outside manual sorting", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop same-group transfer assertion");

  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "最早添加" }).click();
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();

  const google = page.getByTestId("site-card-google");
  const bing = page.getByTestId("site-card-bing");
  const start = await google.boundingBox();
  const target = await bing.boundingBox();
  if (!start || !target) throw new Error("Same-group targets are not visible");
  const before = await page.evaluate(() => localStorage.getItem("site-hub:v1"));

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 10,
  });
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await expect(page.locator('[data-group-zone-id="search"]')).not.toHaveClass(
    /is-group-drag-over/,
  );
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("site-hub:v1"))).toBe(before);
});

test("moves a non-manually sorted card to a group tab and opens the target group", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop tab transfer assertion");

  const learningTab = page.getByRole("tab", { name: /学习/ });
  const mediaTab = page.getByRole("tab", { name: /影音/ });
  await learningTab.click();
  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "名称 Z–A" }).click();

  const wikipedia = page.getByTestId("site-card-wikipedia");
  const start = await wikipedia.boundingBox();
  const target = await mediaTab.boundingBox();
  if (!start || !target) throw new Error("Tab transfer targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 14,
  });

  await expect(mediaTab).toHaveClass(/is-drag-over/);
  await page.waitForTimeout(520);
  await expect(learningTab).toHaveAttribute("aria-selected", "false");
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("site-card-youtube")).toBeVisible();
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "wikipedia").groupId;
  })).toBe("media");
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await expect(learningTab).toHaveAttribute("aria-selected", "false");
  await expect(wikipedia).toBeVisible();
});

test("lets a non-manual tab transfer return to its origin before release", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop reversible tab transfer assertion");

  const developTab = page.locator('[data-group-drop-id="develop"]');
  const designTab = page.locator('[data-group-drop-id="design"]');
  await developTab.click();
  await page.locator(".view-control-button").first().click();
  await page.locator('.sort-popover [role="menuitemradio"]').nth(1).click();

  const github = page.getByTestId("site-card-github");
  const start = await github.boundingBox();
  const designTarget = await designTab.boundingBox();
  const developTarget = await developTab.boundingBox();
  if (!start || !designTarget || !developTarget) {
    throw new Error("Reversible tab transfer targets are not visible");
  }

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(
    designTarget.x + designTarget.width / 2,
    designTarget.y + designTarget.height / 2,
    { steps: 14 },
  );
  await page.waitForTimeout(520);
  await expect(designTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("site-card-figma")).toBeVisible();
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();

  await page.mouse.move(
    developTarget.x + developTarget.width * 0.2,
    developTarget.y + developTarget.height / 2,
    { steps: 14 },
  );
  await expect(developTab).toHaveClass(/is-drag-over/);
  await page.waitForTimeout(520);
  await expect(developTab).toHaveAttribute("aria-selected", "true");
  await expect(designTab).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("site-card-stackoverflow")).toBeVisible();
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "github").groupId;
  })).toBe("develop");
  await expect(developTab).toHaveAttribute("aria-selected", "true");
  await expect(github).toBeVisible();
});

test("moves a non-manually sorted card to a group tab with touch input", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile touch transfer assertion");

  const learningTab = page.getByRole("tab", { name: /学习/ });
  const mediaTab = page.getByRole("tab", { name: /影音/ });
  await learningTab.click();
  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "最近添加" }).click();
  await mediaTab.scrollIntoViewIfNeeded();

  const wikipedia = page.getByTestId("site-card-wikipedia");
  const start = await wikipedia.boundingBox();
  const target = await mediaTab.boundingBox();
  if (!start || !target) throw new Error("Touch transfer targets are not visible");

  const client = await page.context().newCDPSession(page);
  const startPoint = {
    x: Math.round(start.x + start.width / 2),
    y: Math.round(start.y + start.height / 2),
  };
  const activationPoint = { x: startPoint.x + 52, y: startPoint.y };
  const targetPoint = {
    x: Math.round(target.x + target.width / 2),
    y: Math.round(target.y + target.height / 2),
  };
  const touchPoint = (point: { x: number; y: number }) => ({
    ...point,
    radiusX: 2,
    radiusY: 2,
    force: 1,
  });

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint(startPoint)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touchPoint(activationPoint)],
  });
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  for (let step = 1; step <= 12; step += 1) {
    const progress = step / 12;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        touchPoint({
          x: Math.round(activationPoint.x + (targetPoint.x - activationPoint.x) * progress),
          y: Math.round(activationPoint.y + (targetPoint.y - activationPoint.y) * progress),
        }),
      ],
    });
    await page.waitForTimeout(16);
  }

  await expect(mediaTab).toHaveClass(/is-drag-over/);
  await page.waitForTimeout(520);
  await expect(learningTab).toHaveAttribute("aria-selected", "false");
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("site-card-youtube")).toBeVisible();
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "wikipedia").groupId;
  })).toBe("media");
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await expect(learningTab).toHaveAttribute("aria-selected", "false");
  await expect(wikipedia).toBeVisible();
});

test("moves selected sites together from grouped All without leaving All", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop batch drag assertion");
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.getByRole("button", { name: "显示" }).click();
  await page.getByRole("menuitemradio", { name: "按分组显示" }).click();
  await page
    .locator('[data-group-sort-section-id="search"]')
    .getByRole("button", { name: "多选 搜索 网站" })
    .click();
  await page.getByRole("button", { name: "选择 Google" }).click();
  await page.getByTestId("site-card-github").click();

  const google = page.getByTestId("site-card-google");
  const designTrack = page.locator('[data-group-zone-id="design"]');
  const start = await google.boundingBox();
  const target = await designTrack.boundingBox();
  if (!start || !target) throw new Error("Batch drag targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await expect(page.getByTestId("site-card-drag-preview")).toHaveAttribute(
    "data-batch-count",
    "2",
  );
  await page.mouse.move(target.x + target.width / 2, target.y + 40, { steps: 16 });
  await page.mouse.up();

  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return ["google", "github"].map(
        (id) => state.sites.find((site: { id: string }) => site.id === id).groupId,
      );
    }),
  ).toEqual(["design", "design"]);
  await expect(page.getByRole("tab", { name: /全部/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page
      .locator('[data-group-sort-section-id="search"]')
      .getByRole("button", { name: "多选 搜索 网站" }),
  ).toBeVisible();
  await page.waitForTimeout(220);
  await page.screenshot({
    path: screenshotPath("group-order-multiselect.png"),
    fullPage: true,
  });
});

test("moves selected sites from a specifically focused non-manual group", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop focused batch drag assertion");
  const developTab = page.locator('[data-group-drop-id="develop"]');
  const mediaTab = page.locator('[data-group-drop-id="media"]');
  await developTab.click();
  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "名称 Z–A" }).click();
  await page.getByRole("button", { name: "多选" }).click();
  await page.getByRole("button", { name: "选择 GitHub" }).click();
  await page.getByRole("button", { name: "选择 CodePen" }).click();

  const github = page.getByTestId("site-card-github");
  const start = await github.boundingBox();
  const target = await mediaTab.boundingBox();
  if (!start || !target) throw new Error("Focused batch drag targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 14,
  });
  await expect(page.getByTestId("site-card-drag-preview")).toHaveAttribute(
    "data-batch-count",
    "2",
  );
  await page.waitForTimeout(520);
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await page.mouse.up();

  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return ["github", "codepen"].map(
        (id) => state.sites.find((site: { id: string }) => site.id === id).groupId,
      );
    }),
  ).toEqual(["media", "media"]);
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "多选" })).toBeVisible();
});

test("auto-scrolls overflowing group tabs during a site transfer", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop edge auto-scroll assertion");
  await page.setViewportSize({ width: 900, height: 900 });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("site-hub:v1")))
    .not.toBeNull();
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    const ordinary = state.groups.filter(
      (group: { isProtected: boolean; workspace?: string }) =>
        group.workspace !== "github" && !group.isProtected,
    );
    const githubGroups = state.groups.filter(
      (group: { workspace?: string }) => group.workspace === "github",
    );
    const other = state.groups.find(
      (group: { id: string }) => group.id === "other",
    );
    const now = new Date().toISOString();
    const extras = Array.from({ length: 12 }, (_, index) => ({
      id: `edge-${index}`,
      name: `边缘分组 ${index + 1}`,
      icon: "folder",
      isProtected: false,
      workspace: "main",
      order: ordinary.length + index,
      createdAt: now,
      updatedAt: now,
    }));
    state.groups = [
      ...ordinary,
      ...extras,
      { ...other, order: ordinary.length + extras.length },
      ...githubGroups,
    ];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.locator('[data-group-drop-id="search"]').click();
  await page.getByRole("button", { name: /手动排列/ }).click();
  await page.getByRole("menuitemradio", { name: "名称 A–Z" }).click();

  const tabs = page.locator(".category-tabs");
  const google = page.getByTestId("site-card-google");
  const start = await google.boundingBox();
  const tabsBox = await tabs.boundingBox();
  if (!start || !tabsBox) throw new Error("Auto-scroll drag targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(tabsBox.x + tabsBox.width - 4, tabsBox.y + tabsBox.height / 2, {
    steps: 16,
  });
  await expect.poll(() => tabs.evaluate((element) => element.scrollLeft)).toBeGreaterThan(120);
  await expect
    .poll(() =>
      page.locator('.category-tab.is-drag-over[data-group-drop-id^="edge-"]').getAttribute(
        "data-group-drop-id",
      ),
    )
    .toBeTruthy();
  await page.waitForTimeout(520);
  const targetGroupId = await page
    .locator('.category-tab.is-drag-over[data-group-drop-id]')
    .getAttribute("data-group-drop-id");
  await page.mouse.up();

  await expect.poll(() =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
      return state.sites.find((site: { id: string }) => site.id === "google").groupId;
    }),
  ).toBe(targetGroupId);
  await expect(page.locator(`[data-group-drop-id="${targetGroupId}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("reorders card C to card A inside one group without opening it", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop grouped drag assertion");
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.displayMode = "grouped";
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const cardC = page.getByTestId("site-card-codepen");
  const cardA = page.getByTestId("site-card-github");
  // Grouped rows can extend below the default 720px desktop viewport.
  // mouse.move does not scroll locators into view like locator.click does.
  await cardC.scrollIntoViewIfNeeded();
  await cardA.scrollIntoViewIfNeeded();
  const start = await cardC.boundingBox();
  const target = await cardA.boundingBox();
  if (!start || !target) throw new Error("Grouped drag cards are not visible");

  const initialPageCount = context.pages().length;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 12,
  });
  await expect(cardA).toHaveClass(/is-drop-target/);
  await page.screenshot({ path: screenshotPath("group-reorder-backward.png"), fullPage: false });
  await page.mouse.up();
  await page.waitForTimeout(250);

  expect(context.pages()).toHaveLength(initialPageCount);
  const developTrack = page.getByTestId("site-card-github").locator("..");
  await expect
    .poll(() =>
      developTrack
        .locator(":scope > .site-card")
        .first()
        .getAttribute("data-testid"),
    )
    .toBe("site-card-codepen");
  await page.reload();
  await expect(developTrack.locator(":scope > .site-card").first()).toHaveAttribute(
    "data-testid", "site-card-codepen",
  );
});

test("keeps a forward drop target stable before committing the new position", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop grouped drag assertion");
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.displayMode = "grouped";
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const firstCard = page.getByTestId("site-card-github");
  const nextCard = page.getByTestId("site-card-stackoverflow");
  await firstCard.scrollIntoViewIfNeeded();
  await nextCard.scrollIntoViewIfNeeded();
  const start = await firstCard.boundingBox();
  const target = await nextCard.boundingBox();
  if (!start || !target) throw new Error("Grouped drag cards are not visible");

  const initialPageCount = context.pages().length;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 12,
  });
  await expect(nextCard).toHaveClass(/is-drop-target/);
  await expect(page.getByTestId("site-card-drag-preview")).toBeVisible();
  for (const offset of [-3, 4, -2, 3, 0]) {
    await page.mouse.move(
      target.x + target.width / 2 + offset,
      target.y + target.height / 2,
    );
    await page.waitForTimeout(60);
    await expect(nextCard).toHaveClass(/is-drop-target/);
  }
  await page.screenshot({ path: screenshotPath("group-reorder-forward.png"), fullPage: false });
  await page.mouse.up();
  await page.waitForTimeout(250);

  expect(context.pages()).toHaveLength(initialPageCount);
  const developTrack = page.getByTestId("site-card-stackoverflow").locator("..");
  await expect
    .poll(() =>
      developTrack
        .locator(":scope > .site-card")
        .nth(1)
        .getAttribute("data-testid"),
    )
    .toBe("site-card-github");
  await page.reload();
  await expect(developTrack.locator(":scope > .site-card").nth(1)).toHaveAttribute(
    "data-testid", "site-card-github",
  );
});

test("moves a card across grouped rows while preserving its global order", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop cross-group drag assertion");
  await page.evaluate(() => {
    const key = "site-hub:v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.displayMode = "grouped";
    state.displayModeByWorkspace.main = "grouped";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const google = page.getByTestId("site-card-google");
  const github = page.getByTestId("site-card-github");
  const start = await google.boundingBox();
  const target = await github.boundingBox();
  if (!start || !target) throw new Error("Cross-group drag targets are not visible");
  const beforeGlobalOrder = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "google").globalOrder;
  });

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 14 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "google").groupId;
  })).toBe("develop");
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "google").globalOrder;
  })).toBe(beforeGlobalOrder);
});

test("switches group during a drag and accepts the add-card slot in the new group", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop tab drag assertion");
  await page.getByRole("tab", { name: /学习/ }).click();
  const wikipedia = page.getByTestId("site-card-wikipedia");
  const mediaTab = page.getByRole("tab", { name: /影音/ });
  const start = await wikipedia.boundingBox();
  const target = await mediaTab.boundingBox();
  if (!start || !target) throw new Error("Tab drag targets are not visible");

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 52, start.y + start.height / 2);
  const previewBeforeOverlap = await page
    .getByTestId("site-card-drag-preview")
    .boundingBox();
  if (!previewBeforeOverlap) throw new Error("Drag preview is not visible");
  const edgeOverlapPointerY =
    target.y + target.height + previewBeforeOverlap.height / 2 - 8;
  expect(edgeOverlapPointerY).toBeGreaterThan(target.y + target.height);
  await page.mouse.move(target.x + target.width / 2, edgeOverlapPointerY, {
    steps: 12,
  });
  await expect(page.getByTestId("site-card-drag-preview")).toHaveClass(
    /is-over-group-tab/,
  );
  await expect(mediaTab).toHaveClass(/is-drag-over/);
  await expect
    .poll(() =>
      page
        .getByTestId("site-card-drag-preview")
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)),
    )
    .toBeLessThanOrEqual(0.4);
  await page.waitForTimeout(500);
  await expect(mediaTab).toHaveAttribute("aria-selected", "true");
  const addCard = page.getByRole("button", { name: /在影音分组添加网站/ });
  const addCardTarget = await addCard.boundingBox();
  if (!addCardTarget) throw new Error("Switched group end target is not visible");
  await page.mouse.move(
    addCardTarget.x + addCardTarget.width / 2,
    addCardTarget.y + addCardTarget.height / 2,
    { steps: 10 },
  );
  await expect(addCard.locator("..")).toHaveClass(/is-group-drag-over/);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "wikipedia").groupId;
  })).toBe("media");
  await page.reload();
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    return state.sites.find((site: { id: string }) => site.id === "wikipedia").groupId;
  })).toBe("media");
});
