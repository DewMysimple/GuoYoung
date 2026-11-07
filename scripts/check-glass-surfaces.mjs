import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const fixedPaint = /#[\da-f]{3,8}\b|\b(?:black|white|gray|grey|silver|navy|red)\b|\b(?:rgba?|hsla?|hwb|(?:ok)?(?:lab|lch))\((?!\s*var\()/i;
const fixedUtility = /(?:^|[\s:"'`])bg-(?:black\b|white\b|(?:slate|gray|zinc|neutral|stone)-\d+\b|\[(?:#|rgba?\(|hsla?\(|oklch\(|black\]|white\]))/;
const paintDeclaration = /(?:^|[;{])\s*(background(?:-color|-image)?|--[\w-]*(?:background|fill|surface)[\w-]*)\s*:\s*([^;}]+)/gi;
const floatingClass = /\.(?:dialog-content|confirm-content|settings-panel|popup-form-card|bookmark-tree|help-tip-bubble|[\w-]+-(?:popover|menu))(?![\w-])/;
const cardReference = /--(?:card-glass-[\w-]+|shell-glass-[\w-]+|glass-(?:filter|opacity|fill(?:-[\w-]+)?))(?![\w-])/;
const declarations = /(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g;

function checkMaterialRules(file, css) {
  const errors = [];
  const lineAt = index => `${file}:${css.slice(0, index).split("\n").length}`;
  const aliases = new Map();
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    aliases.set(name, [...(aliases.get(name) ?? []), value]);
  }
  function reachesCard(value, seen = new Set()) {
    if (cardReference.test(value)) return true;
    return [...value.matchAll(/var\(\s*(--[\w-]+)/g)].some(([, name]) => {
      if (seen.has(name)) return false;
      const next = new Set(seen).add(name);
      return aliases.get(name)?.some(alias => reachesCard(alias, next));
    });
  }
  for (const [name, values] of aliases) {
    if (name.startsWith("--overlay-") && values.some(value => reachesCard(value))) {
      errors.push(`${file} ${name} depends on card/shell material. Overlay settings must be independent.`);
    }
  }
  if (/--glass-filter\b/.test(css)) errors.push(`${file} retires --glass-filter; use a card, shell or overlay filter explicitly.`);
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = rule;
    if (!floatingClass.test(selector) || /^\s*@/.test(selector)) continue;
    const subject = selector.trim().split(/\s+/).at(-1);
    const ownsSurface = floatingClass.test(subject);
    for (const declaration of body.matchAll(declarations)) {
      const [, property, value] = declaration;
      const location = lineAt(rule.index + selector.length + 1 + declaration.index);
      if (/^(?:background(?:-color|-image)?|(?:-webkit-)?backdrop-filter|--select-(?:filter|menu-fill))$/.test(property)) {
        if (reachesCard(value)) errors.push(`${location} Floating surface consumes card/shell material (${property}).`);
        const neutral = /^(?:transparent|none|inherit|initial|unset)(?:\s*!important)?$/.test(value.trim());
        if (ownsSurface && !neutral && !/--overlay-/.test(value) && !/is-(?:selected|delete-armed)|danger/.test(subject)) {
          errors.push(`${location} Floating ${property} must use overlay material tokens.`);
        }
      }
      if (ownsSurface && property === "opacity" && !/^1(?:\.0+)?(?:\s*!important)?\s*$/.test(value)) {
        errors.push(`${location} Do not fade a floating shell's text with opacity.`);
      }
      if (ownsSurface && property === "filter" && /blur\(/.test(value)) {
        errors.push(`${location} Blur the backdrop, never the floating foreground.`);
      }
    }
  }
  return errors;
}

// Exact exemptions cover intentional color samples and existing shared feedback.
const paintExceptions = {
  "src/styles.css": [
    "#a9333e", "#922d36",
    "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(var(--picker-hue) 100% 50%)",
    "linear-gradient( 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00 )",
  ],
  "src/wallpaper-glass.css": [
    "linear-gradient(142deg, rgb(255 255 255 / .28), transparent 52%), linear-gradient(180deg, color-mix(in srgb, var(--accent) 82%, transparent), color-mix(in srgb, var(--accent) 69%, transparent))",
    "linear-gradient(142deg, rgb(255 255 255 / .34), transparent 52%), linear-gradient(180deg, color-mix(in srgb, var(--accent-strong) 84%, transparent), color-mix(in srgb, var(--accent-strong) 72%, transparent))",
  ],
  "src/components/appearance-settings.css": [
    "linear-gradient(90deg, #f4f6f9 50%, #171a21 50%)", "linear-gradient(90deg, #dfe4ec 50%, #353d4b 50%)",
    "#dfe4ec", "#353d4b",
  ],
  "src/components/logo-image-editor.css": ["repeating-conic-gradient(#bbc0c6 0 25%, #e8eaed 0 50%) 50% / 16px 16px"],
  "src/components/settings-editors.css": [
    "repeating-linear-gradient(125deg, #a7d5e6 0 15px, #428cb5 15px 25px, #ded7ef 25px 40px)",
    "rgb(255 255 255 / var(--preset-fill, .12))",
  ],
};

export function checkGlassSource(file, source) {
  const errors = [];
  if (file.endsWith(".css")) {
    if (file === "src/theme.css") return errors; // Shared theme owns base colors.
    const css = source.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\r\n]/g, " "));
    errors.push(...checkMaterialRules(file, css));
    for (const match of css.matchAll(paintDeclaration)) {
      const [, property, value] = match;
      const paint = value.trim().replace(/\s+/g, " ");
      if (fixedPaint.test(paint) && !paintExceptions[file]?.includes(paint)) {
        const line = css.slice(0, match.index + match[0].indexOf(property)).split("\n").length;
        errors.push(`${file}:${line} ${property} uses a fixed color. Use shared theme or glass tokens.`);
      }
    }
    return errors;
  }

  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function report(node, message) {
    const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    errors.push(`${file}:${line + 1} ${message}`);
  }
  function checkInlineStyle(node) {
    if (ts.isPropertyAssignment(node) && /^(?:background(?:Color|Image)?|--[\w-]*(?:background|fill|surface)[\w-]*)$/.test(node.name.getText(tree).replace(/["']/g, "")) && fixedPaint.test(node.initializer.getText(tree))) {
      report(node, "Inline background uses a fixed color. Use shared theme or glass tokens.");
    }
    ts.forEachChild(node, checkInlineStyle);
  }
  function visit(node) {
    if (ts.isCallExpression(node) && /\.setProperty$/.test(node.expression.getText(tree)) &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && /^--(?:overlay-|card-glass-)/.test(node.arguments[0].text) &&
        file !== "src/lib/wallpaper-glass.ts") {
      report(node, "Generate material preferences only in wallpaperGlassStyle(), then reuse its output.");
    }
    if (ts.isPropertyAssignment(node) && /^['"]--(?:overlay-|card-glass-)/.test(node.name.getText(tree)) && file !== "src/lib/wallpaper-glass.ts") {
      report(node, "Generate material preferences only in wallpaperGlassStyle(), then reuse its output.");
    }
    if (ts.isCallExpression(node) && /(?:localStorage|sessionStorage)\.setItem$/.test(node.expression.getText(tree)) &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && /(?:theme|glass|appearance)/i.test(node.arguments[0].text)) {
      report(node, "Keep appearance in the existing collection settings, not a competing preference store.");
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && /(?:Dialog|AlertDialog)\.Content$/.test(node.tagName.getText(tree))) {
      const className = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === "className");
      if (!className?.initializer || !/\b(?:dialog-content|confirm-content|settings-panel)\b/.test(className.initializer.getText(tree))) {
        report(node, "Dialog content must reuse a shared overlay shell.");
      }
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(tree) === "select") {
      report(node, "Use the shared SelectMenu for themed selects.");
    }
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(tree);
      if (name === "className" && fixedUtility.test(node.initializer.getText(tree))) {
        report(node, "Background utility uses a fixed color. Use shared theme or glass tokens.");
      }
      if (name === "style") checkInlineStyle(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return errors;
}

async function main() {
  const root = new URL("../", import.meta.url);
  const files = (await readdir(new URL("src/", root), { recursive: true, withFileTypes: false }))
    .map(file => `src/${file.replaceAll("\\", "/")}`)
    .filter(file => /\.(?:css|tsx?)$/.test(file) && !/\.test\.|\.d\.ts$/.test(file))
    .sort();
  const result = (await Promise.all(files.map(async file => checkGlassSource(file, await readFile(new URL(file, root), "utf8"))))).flat();
  if (result.length) {
    console.error(result.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Glass surface checks passed (${files.length} production CSS/TS/JSX files).`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) await main();
