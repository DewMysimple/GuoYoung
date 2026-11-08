import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGlassSource, checkGlassSources } from "./check-glass-surfaces.mjs";

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

test("connects real sampled-shell animation shorthands to opacity keyframes", () => {
  const css = `
    .dialog-content, .confirm-content { animation: dialog-in 220ms cubic-bezier(.16, 1, .3, 1); }
    .settings-panel { animation-name: settings-in; animation-duration: 260ms; }
    @keyframes dialog-in {
      from { opacity: 0; transform: translate(-50%, calc(-50% + 14px)) scale(.98); }
    }
    @keyframes settings-in { from { opacity: .2; transform: translateX(32px); } }
  `;
  const errors = checkGlassSource("src/animation.css", css);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /animation\.css:2.*animation dialog-in.*ancestor opacity below 1.*animation\.css:5/);
  assert.match(errors[1], /animation\.css:3.*animation settings-in/);
});

test("checks cross-CSS keyframes and nested media without inspecting unrelated animations", () => {
  const sources = [
    { file: "src/shell.css", source: `@media (min-width: 900px) {
      :root :is(.dialog-content, .confirm-content)[data-state="closed"], .settings-panel {
        animation: gentle-move 180ms ease-out, shell-exit 140ms steps(2, end);
      }
    }` },
    { file: "src/motion.css", source: `@layer motion { @media (prefers-reduced-motion: no-preference) {
      @keyframes shell-exit { 0%, 10% { opacity: 100%; } 99% { opacity: 30%; } }
      @keyframes gentle-move { from { transform: translateX(32px); } }
      @keyframes loading-icon { from { opacity: 0; } }
    } }` },
  ];
  assert.deepEqual(checkGlassSource(sources[0].file, sources[0].source), []);
  const errors = checkGlassSources(sources);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /src\/shell\.css:3.*shell-exit.*src\/motion\.css:2/);
});

test("allows transform motion and does not infer sampled shells from descendants or pseudo contents", () => {
  const css = `
    :root :is(.dialog-content, .settings-panel) { animation: shell-in 260ms cubic-bezier(.16, 1, .3, 1); }
    .confirm-content[data-state="closed"] { animation: shell-out 120ms ease-in; }
    .dialog-content::before { background: var(--overlay-glass-fill); backdrop-filter: var(--overlay-material-filter); }
    .dialog-content .icon, .settings-panel button:disabled { opacity: .4; animation: fade 160ms ease; }
    .settings-panel .icon::before { animation: fade 160ms ease; }
    .toolbar:not(.dialog-content), .toolbar:has(.settings-panel) { animation: fade 160ms ease; }
    :is(.settings-panel .icon, .dialog-content > button) { animation: fade 160ms ease; }
    .dialog-overlay { opacity: .3; animation: fade 160ms ease; }
    @keyframes shell-in { from { transform: translateX(32px); } to { transform: none; opacity: 1; } }
    @keyframes shell-out { from { opacity: 100%; } to { transform: translateY(12px); } }
    @keyframes fade { from { opacity: 0; } }
  `;
  assert.deepEqual(checkGlassSource("src/animation.css", css), []);
});

test("rejects dangerous host transition and will-change declarations without banning safe properties", () => {
  const invalid = [
    "will-change: transform, opacity", "will-change: filter", "transition: all 160ms ease",
    "transition: opacity 140ms", "transition: 160ms ease-out", "transition: ease-in 200ms",
    "transition-property: transform, opacity", "transition-property: all",
    "transition: transform 160ms ease, opacity 160ms ease",
  ];
  for (const declaration of invalid) {
    const errors = checkGlassSource("src/animation.css", `.settings-panel { ${declaration}; }`);
    assert.equal(errors.length, 1, `${declaration}: ${errors}`);
    assert.match(errors[0], /Sampled glass shell/);
  }
  assert.deepEqual(checkGlassSource("src/animation.css", `
    .dialog-content { will-change: transform; transition: transform 160ms cubic-bezier(.16, 1, .3, 1), border-color 160ms; }
    .settings-panel { transition-property: transform, color; }
    .settings-panel .icon { will-change: opacity; transition: opacity 160ms; }
    .dialog-overlay { transition: opacity 160ms; }
  `), []);
});

test("parses comments, quoted content, percentage keyframes and exact shell classes", () => {
  const css = `
    /* .settings-panel { animation: commented-out 100ms; } */
    .settings-panel-decoration { animation: fade 100ms; }
    .icon[data-label=".settings-panel"] { animation: fade 100ms; }
    .settings-panel::after { content: "{ opacity: 0; }"; }
    :where(.confirm-content) { animation: "actual-exit" 100ms; }
    @keyframes commented-out { from { opacity: 0; } }
    @keyframes fade { from { opacity: 0; } }
    @-webkit-keyframes actual-exit {
      0%, 50% { opacity: 100%; }
      90% { opacity: 0.99; }
    }
  `;
  const errors = checkGlassSource("src/animation.css", css);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /animation\.css:6.*actual-exit.*animation\.css:11/);
});
