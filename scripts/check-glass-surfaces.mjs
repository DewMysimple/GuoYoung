import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const fixedPaint = /#[\da-f]{3,8}\b|\b(?:black|white|gray|grey|silver|navy|red)\b|\b(?:rgba?|hsla?|hwb|(?:ok)?(?:lab|lch))\((?!\s*var\()/i;
const fixedUtility = /(?:^|[\s:"'`])bg-(?:black\b|white\b|(?:slate|gray|zinc|neutral|stone)-\d+\b|\[(?:#|rgba?\(|hsla?\(|oklch\(|black\]|white\]))/;
const paintDeclaration = /(?:^|[;{])\s*(background(?:-color|-image)?|--[\w-]*(?:background|fill|surface)[\w-]*)\s*:\s*([^;}]+)/gi;
const floatingClass = /\.(?:dialog-content|confirm-content|settings-panel|popup-form-card|bookmark-tree|help-tip-bubble|[\w-]+-(?:popover|menu))(?![\w-])/;
const cardReference = /--(?:card-glass-[\w-]+|shell-glass-[\w-]+|glass-(?:filter|opacity|fill(?:-[\w-]+)?))(?![\w-])/;
const declarations = /(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g;
const sampledShell = /\.(?:dialog-content|confirm-content|settings-panel)(?![\w-])/;

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\r\n]/g, " "));
}

// This scanner only needs authored blocks and top-level selector/value tokens.
// It respects strings and functions so commas in :is(), timing functions and
// quoted content do not turn descendants or keyframe bodies into shell rules.
function splitTopLevel(source, separator) {
  const parts = [];
  let start = 0, depth = 0, quote = "";
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (depth === 0 && separator.test(char)) {
      parts.push(source.slice(start, index)); start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

function closesAt(source, start, opening, closing) {
  let depth = 1, quote = "";
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === opening) depth++;
    else if (char === closing && --depth === 0) return index;
  }
  return source.length;
}

function* cssBlocks(css, start = 0, end = css.length) {
  let headerStart = start;
  for (let index = start; index < end; index++) {
    const char = css[index];
    if (char === '"' || char === "'") {
      const quote = char;
      while (++index < end) {
        if (css[index] === "\\") index++;
        else if (css[index] === quote) break;
      }
    } else if (char === "(" || char === "[") index = closesAt(css, index, char, char === "(" ? ")" : "]");
    else if (char === ";") headerStart = index + 1;
    else if (char === "{") {
      const close = closesAt(css, index, "{", "}");
      yield { header: css.slice(headerStart, index).trim(), start: index + 1, end: close, body: css.slice(index + 1, close) };
      headerStart = close + 1; index = close;
    }
  }
}

function* authoredRules(css, start = 0, end = css.length) {
  for (const block of cssBlocks(css, start, end)) {
    if (/^@(?:media|supports|container|layer|scope)\b/.test(block.header)) yield* authoredRules(css, block.start, block.end);
    else yield block;
  }
}

function ownsSampledShell(selector) {
  return splitTopLevel(selector, /,/).some(part => {
    const compound = splitTopLevel(part, /[\s>+~]/).at(-1) ?? "";
    let plain = "", positiveFunction = false;
    for (let index = 0; index < compound.length; index++) {
      if (compound[index] === "[") { index = closesAt(compound, index, "[", "]"); continue; }
      if (compound[index] === "(") {
        const close = closesAt(compound, index, "(", ")");
        const name = plain.match(/:([\w-]+)$/)?.[1];
        if (name === "is" || name === "where") positiveFunction ||= ownsSampledShell(compound.slice(index + 1, close));
        index = close; continue;
      }
      plain += compound[index];
    }
    return !plain.includes("::") && (sampledShell.test(plain) || positiveFunction);
  });
}

function collectKeyframes(sources) {
  const frames = new Map();
  for (const { file, source } of sources) {
    const css = withoutComments(source);
    for (const block of authoredRules(css)) {
      const name = block.header.match(/^@(?:-webkit-)?keyframes\s+(?:"([^"]+)"|'([^']+)'|([\w-]+))$/)?.slice(1).find(Boolean);
      if (!name) continue;
      for (const frame of cssBlocks(css, block.start, block.end)) for (const declaration of frame.body.matchAll(declarations)) {
        const [, property, value] = declaration;
        const opacity = value.trim().match(/^([+-]?(?:\d*\.)?\d+)\s*(%)?(?:\s*!important)?$/);
        if (property !== "opacity" || !opacity || Number(opacity[1]) >= (opacity[2] ? 100 : 1)) continue;
        const line = css.slice(0, frame.start + declaration.index + declaration[0].indexOf(property)).split("\n").length;
        frames.set(name, [...(frames.get(name) ?? []), `${file}:${line} (${frame.header}: opacity ${value.trim()})`]);
      }
    }
  }
  return frames;
}

function checkSampledShellAnimations(file, css, frames) {
  const errors = [];
  for (const block of authoredRules(css)) {
    if (!ownsSampledShell(block.header)) continue;
    for (const declaration of block.body.matchAll(declarations)) {
      const [, property, raw] = declaration;
      const value = raw.trim().replace(/\s*!important$/, "");
      const location = `${file}:${css.slice(0, block.start + declaration.index + declaration[0].indexOf(property)).split("\n").length}`;
      if (/^(?:-webkit-)?animation(?:-name)?$/.test(property)) {
        const names = splitTopLevel(value, /[\s,]/).map(token => token.replace(/^(['"])(.*)\1$/, "$2"));
        for (const name of new Set(names)) if (frames.has(name)) {
          errors.push(`${location} Sampled glass shell animation ${name} changes ancestor opacity below 1; keep its backdrop sampling boundary stable. Keyframe: ${frames.get(name).join(", ")}.`);
        }
      }
      if (property === "will-change" && splitTopLevel(value, /,/).some(token => token === "opacity" || token === "filter")) {
        errors.push(`${location} Sampled glass shell will-change must not establish an opacity/filter sampling boundary.`);
      }
      if (property === "transition-property" && splitTopLevel(value, /,/).some(token => token === "all" || token === "opacity") ||
          property === "transition" && splitTopLevel(value, /,/).some(transition => {
            const tokens = splitTopLevel(transition, /\s/);
            return tokens.some(token => token === "all" || token === "opacity") || tokens.every(token =>
              /^[\d.]+m?s$/.test(token) || /^(?:ease(?:-in(?:-out)?|-out)?|linear|step-start|step-end|normal|allow-discrete)$/.test(token) ||
              /^(?:cubic-bezier|steps|linear)\(/.test(token));
          })) {
        errors.push(`${location} Sampled glass shell transition must name safe properties; all/opacity can change its backdrop sampling boundary.`);
      }
    }
  }
  return errors;
}

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

export function checkGlassSource(file, source, frames) {
  const errors = [];
  if (file.endsWith(".css")) {
    if (file === "src/theme.css") return errors; // Shared theme owns base colors.
    const css = withoutComments(source);
    errors.push(...checkMaterialRules(file, css));
    errors.push(...checkSampledShellAnimations(file, css, frames ?? collectKeyframes([{ file, source }])));
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

// The production entry checks the whole source set so an animation defined in
// a different CSS module cannot bypass the same-shell keyframe check. Static
// rules cannot establish arbitrary runtime ancestor chains or prove pixels.
export function checkGlassSources(sources) {
  const frames = collectKeyframes(sources.filter(({ file }) => file.endsWith(".css")));
  return sources.flatMap(({ file, source }) => checkGlassSource(file, source, frames));
}

async function main() {
  const root = new URL("../", import.meta.url);
  const files = (await readdir(new URL("src/", root), { recursive: true, withFileTypes: false }))
    .map(file => `src/${file.replaceAll("\\", "/")}`)
    .filter(file => /\.(?:css|tsx?)$/.test(file) && !/\.test\.|\.d\.ts$/.test(file))
    .sort();
  const sources = await Promise.all(files.map(async file => ({ file, source: await readFile(new URL(file, root), "utf8") })));
  const result = checkGlassSources(sources);
  if (result.length) {
    console.error(result.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Glass surface checks passed (${files.length} production CSS/TS/JSX files).`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) await main();
