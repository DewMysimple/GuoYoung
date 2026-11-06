import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGlassSource } from "./check-glass-surfaces.mjs";

test("catches raw paints and local aliases, including inside media queries", () => {
  const css = `/* background: black; */
  @media (min-width: 800px) {
    .menu { --menu-fill: #222; background: var(--menu-fill); }
    .dialog { background-image: linear-gradient(black, rgba(0, 0, 0, .7)); }
    .panel { background-color: var(--glass-fill-panel); }
  }`;
  const errors = checkGlassSource("src/feature.css", css);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /feature.css:3 --menu-fill/);
  assert.match(errors[1], /feature.css:4 background-image/);
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
