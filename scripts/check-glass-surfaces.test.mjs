import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGlassSource } from "./check-glass-surfaces.mjs";

test("catches raw paints and local aliases, including inside media queries", () => {
  const css = `/* background: black; */
  @media (min-width: 800px) {
    .sample { --sample-fill: #222; background: var(--sample-fill); }
    .sample { background-image: linear-gradient(black, rgba(0, 0, 0, .7)); }
    .panel { background-color: var(--glass-fill-panel); }
  }`;
  const errors = checkGlassSource("src/feature.css", css);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /feature.css:3 --sample-fill/);
  assert.match(errors[1], /feature.css:4 background-image/);
});

test("rejects coupled floating fills, filters and indirect aliases", () => {
  const css = `:root { --local-filter: var(--card-glass-filter); --overlay-glass-filter: var(--local-filter); }
    .new-menu { background: var(--card-glass-fill); backdrop-filter: var(--local-filter); }
    .dialog-content { opacity: .8; filter: blur(12px); }
    .new-popover { background: var(--surface); backdrop-filter: blur(18px); }`;
  const errors = checkGlassSource("src/new.css", css);
  for (const pattern of [/depends on card/, /consumes card/, /opacity/, /foreground/, /overlay material tokens/]) {
    assert(errors.some(error => pattern.test(error)), `Expected ${pattern}: ${errors}`);
  }
  assert(checkGlassSource("src/new.css", ".new-menu { backdrop-filter: var(--glass-filter); }").some(error => /retires/.test(error)));
});

test("accepts sibling overlay painting, independently frosted cards and semantic danger controls", () => {
  assert.deepEqual(checkGlassSource("src/new.css", `
    .dialog-content { background: transparent; backdrop-filter: none; opacity: 1; }
    .dialog-content::before { background: var(--overlay-glass-fill); backdrop-filter: var(--overlay-material-filter); }
    .new-menu { background: var(--overlay-popover-fill); backdrop-filter: var(--overlay-material-filter); }
    .new-menu .danger { background: var(--danger-fill); }
    .site-card { backdrop-filter: var(--card-glass-filter); }
  `), []);
});

test("requires shared dialog shells and one preference/token generator", () => {
  const invalid = `const view = <Dialog.Content className="bespoke-dialog" />;
    const style = { '--overlay-glass-filter': 'blur(4px)' };
    localStorage.setItem('new-glass-settings', '{}');`;
  const errors = checkGlassSource("src/new.tsx", invalid);
  assert.equal(errors.length, 3);
  assert.deepEqual(checkGlassSource("src/new.tsx", `const view = <Dialog.Content className="dialog-content custom-layout" />;
    const style = wallpaperGlassStyle(value);`), []);
  assert.deepEqual(checkGlassSource("src/lib/wallpaper-glass.ts", `const style = {'--overlay-glass-filter': filter};`), []);
  assert(checkGlassSource("src/new.ts", `document.documentElement.style.setProperty('--overlay-glass-filter', 'blur(4px)');`)
    .some(error => /wallpaperGlassStyle/.test(error)));
});

test("catches fixed classes, inline paints and native selects in JSX", () => {
  const jsx = `const view = <div className={open ? 'hover:bg-black/80' : 'frame'} style={{ backgroundColor: '#222' }}>
    <select /><SelectMenu /><span style={{ background: 'var(--glass-fill-control)' }} />
  </div>;`;
  const errors = checkGlassSource("src/feature.tsx", jsx);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Background utility/);
  assert.match(errors[1], /Inline background/);
  assert.match(errors[2], /shared SelectMenu/);
});

test("limits intentional samples and theme paints to their owners", () => {
  const rule = ".swatch { background: #353d4b; }";
  assert.deepEqual(checkGlassSource("src/theme.css", rule), []);
  assert.deepEqual(checkGlassSource("src/components/appearance-settings.css", rule), []);
  assert.equal(checkGlassSource("src/new-menu.css", rule).length, 1);
  assert.equal(checkGlassSource("src/components/appearance-settings.css", rule.replace("4b", "4c")).length, 1);
});
