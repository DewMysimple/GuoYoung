import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { glassTexture } from "./glass-texture";

const textureURL = "https://overlay-motion.example/detail.svg";
type Target = { name: string; selector: string; button: string; offsetX: number; offsetY: number; width: number };
const targets: Target[] = [
  { name: "settings", selector: ".settings-panel", button: "打开设置", offsetX: 240, offsetY: 88, width: 120 },
  { name: "manager", selector: ".group-dialog-content", button: "管理分组", offsetX: 320, offsetY: 65, width: 140 },
];

async function seed(page: Page, blur: number) {
  await page.route(textureURL, route => route.fulfill({ contentType: "image/svg+xml", body: glassTexture("complex") }));
  await page.evaluate(({ textureURL, blur }) => {
    const state = JSON.parse(localStorage.getItem("site-hub:v1")!);
    state.appearance.theme = "dark";
    state.wallpaper = { ...state.wallpaper, source: "url", url: textureURL, blur: 0, overlay: 0,
      glassTransparency: 100, glassBlur: 0, overlayTransparency: 100, overlayBlur: blur,
      overlayBackdropDim: 0, overlayReadabilityProtection: false };
    localStorage.setItem("site-hub:v1", JSON.stringify(state));
  }, { textureURL, blur });
  await page.reload();
  await expect(page.locator(".wallpaper-layer img")).toHaveAttribute("src", textureURL);
  await page.locator(".wallpaper-layer img").evaluate(img => (img as HTMLImageElement).decode());
  await page.evaluate(() => document.fonts.ready);
}

/** Pause the actual product CSS animation during mounting, before its first
 * paint. Screenshot stability/animation disabling must never advance it. */
async function openAt(page: Page, target: Target, progress: number) {
  await page.evaluate(({ selector, progress }) => {
    const state: { paused: boolean; animation?: Animation } = { paused: false };
    Object.assign(window, { __overlaySample: state });
    const observer = new MutationObserver(() => {
      const host = document.querySelector(selector);
      if (!host) return;
      getComputedStyle(host).animationName;
      const animation = host.getAnimations()[0];
      if (!animation) return;
      animation.pause();
      animation.currentTime = Number(animation.effect!.getTiming().duration) * progress;
      state.animation = animation;
      state.paused = true;
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }, { selector: target.selector, progress });
  // Trigger only after observation is installed; actionability waiting for the
  // moving dialog would skip exactly the frames under investigation.
  await page.getByRole("button", { name: target.button, exact: true }).evaluate((el: HTMLButtonElement) => el.click());
  await expect.poll(() => page.evaluate(() => (window as unknown as { __overlaySample: { paused: boolean } }).__overlaySample.paused)).toBe(true);
  const host = page.locator(target.selector);
  const state = await host.evaluate(el => {
    const css = getComputedStyle(el), paint = getComputedStyle(el, "::before");
    const animation = (window as unknown as { __overlaySample: { animation: CSSAnimation } }).__overlaySample.animation;
    return { opacity: css.opacity, foreground: css.filter, fill: paint.backgroundColor, blur: paint.backdropFilter,
      sampledAnimation: { name: animation.animationName, currentTime: animation.currentTime, playState: animation.playState },
      rect: el.getBoundingClientRect().toJSON(), animation: el.getAnimations().map(a => ({ name: (a as CSSAnimation).animationName, currentTime: a.currentTime, playState: a.playState })) };
  });
  expect(state.rect.width).toBeGreaterThan(0);
  expect(state.opacity).toBe("1");
  expect(state.foreground).toBe("none");
  const expectedAnimation = { name: target.name === "settings" ? "settings-in" : "dialog-in",
    currentTime: (target.name === "settings" ? 260 : 220) * progress, playState: "paused" };
  expect(state.sampledAnimation).toEqual(expectedAnimation);
  // With fill:none the finished effect correctly leaves the active list. Its
  // original object above still proves the exact terminal time being sampled.
  expect(state.animation).toEqual(progress === 1 ? [] : [expectedAnimation]);
  const clip = { x: Math.round(state.rect.x + target.offsetX), y: Math.round(state.rect.y + target.offsetY), width: target.width, height: 16 };
  const png = await page.screenshot({ clip, animations: "allow" });
  const energy = await page.evaluate(async encoded => {
    const img = new Image(); img.src = `data:image/png;base64,${encoded}`; await img.decode();
    const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
    let sum = 0, count = 0;
    for (let i = 4; i < pixels.length; i += 4) {
      if ((i / 4) % img.width === 0) continue;
      for (let c = 0; c < 3; c++) { sum += Math.abs(pixels[i + c] - pixels[i - 4 + c]); count++; }
    }
    return sum / count;
  }, png.toString("base64"));
  await page.keyboard.press("Escape");
  await expect(host).toHaveCount(0);
  return { state, energy, png, clip };
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop overlay animation acceptance");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

for (const target of targets) test(`real ${target.name} motion blurs from its first visible frame through the end`, async ({ page }, info) => {
  const samples = [];
  for (const blur of [0, 30]) {
    await seed(page, blur);
    for (const progress of [0, .1, .5, .9, .99, 1]) {
      const sample = await openAt(page, target, progress);
      expect(sample.state.blur).toBe(blur ? "blur(30px)" : "none");
      await info.attach(`${target.name}-${blur}-${progress}`, { body: sample.png, contentType: "image/png" });
      samples.push({ blur, progress, state: sample.state, clip: sample.clip, energy: sample.energy });
    }
  }
  await info.attach("motion-pixel-comparison", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
  for (let i = 0; i < 6; i++) {
    expect(samples[i].energy, "Zero blur must expose the fixed high-frequency background").toBeGreaterThan(2);
    // The same texture's original animation exposes >3.8 energy until its last
    // frame; the one-variable corrected control stays below .4. A 60% detail
    // reduction is the existing material-test criterion, not a relaxed limit.
    expect(samples[i + 6].energy, `Actual blur at ${samples[i].progress}`).toBeLessThan(samples[i].energy * .4);
    expect(samples[i + 6].clip).toEqual(samples[i].clip);
  }
});

test("normal motion keeps material ready across immediate close and repeated opens", async ({ page }, info) => {
  await seed(page, 30);
  for (const target of targets) {
    await page.evaluate(selector => {
      const frames: unknown[] = [];
      Object.assign(window, { __overlayFrames: frames });
      const start = performance.now();
      const sample = () => {
        const el = document.querySelector(selector);
        if (el) frames.push({ at: performance.now(), opacity: getComputedStyle(el).opacity, blur: getComputedStyle(el, "::before").backdropFilter });
        if (performance.now() - start < 1400) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, target.selector);
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: target.button, exact: true }).evaluate((el: HTMLButtonElement) => el.click());
      // Wait for actual rAFs, not an invented duration or animation completion.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.keyboard.press("Escape");
      await expect(page.locator(target.selector)).toHaveCount(0);
    }
    const frames = await page.evaluate(() => (window as unknown as { __overlayFrames: { opacity: string; blur: string }[] }).__overlayFrames);
    await info.attach(`${target.name}-normal-rAF`, { body: JSON.stringify(frames), contentType: "application/json" });
    expect(frames.length).toBeGreaterThan(2);
    expect(frames.every(frame => frame.opacity === "1" && frame.blur === "blur(30px)")).toBe(true);
  }
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
  await page.getByRole("button", { name: "打开设置", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "打开设置", exact: true })).toBeFocused();
});

test("closing settings respects a new data-workspace focus destination", async ({ page }) => {
  for (const dirty of [false, true]) {
    await page.getByRole("button", { name: "打开设置", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "设置", exact: true });
    if (dirty) {
      await panel.getByRole("tab", { name: "外观", exact: true }).click();
      await panel.getByRole("button", { name: "名称与图标", exact: true }).click();
      await panel.getByRole("textbox", { name: "品牌名称", exact: true }).fill("未保存设置");
    }
    await panel.getByRole("tab", { name: "数据", exact: true }).click();
    await panel.getByRole("button", { name: dirty ? "导入" : "导出", exact: true }).click();
    if (dirty) await page.getByRole("alertdialog", { name: "放弃未保存的设置？" }).getByRole("button", { name: "放弃更改", exact: true }).click();
    await expect(panel).toHaveCount(0);
    const heading = page.locator(".data-workspace h1");
    await expect(heading).toBeFocused();
    // Observe a real next frame after Radix's unmount focus handling as well.
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await expect(heading).toBeFocused();
    await page.getByRole("button", { name: "返回收藏", exact: true }).click();
  }
});

test("a nested confirmation returns keyboard focus to its caller in the open drawer", async ({ page }) => {
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await panel.getByRole("tab", { name: "字体调节", exact: true }).click();
  const caller = panel.getByRole("button", { name: "系统字体", exact: true });
  await caller.click();
  await page.getByTestId("settings-outside-dismiss-layer").click({ position: { x: 100, y: 100 } });
  const confirmation = page.getByRole("alertdialog", { name: "放弃未保存的设置？" });
  await page.keyboard.press("Tab");
  await expect.poll(() => confirmation.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await confirmation.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(caller).toBeFocused();
  await expect(panel).toBeVisible();
  await caller.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(caller).toBeFocused();
  await panel.getByRole("button", { name: "取消", exact: true }).click();
});
