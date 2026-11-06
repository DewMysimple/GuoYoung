import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const fixedPaint = /#[\da-f]{3,8}\b|\b(?:black|white|gray|grey|silver|navy|red)\b|\b(?:rgba?|hsla?|hwb|(?:ok)?(?:lab|lch))\((?!\s*var\()/i;
const fixedUtility = /(?:^|[\s:"'`])bg-(?:black\b|white\b|(?:slate|gray|zinc|neutral|stone)-\d+\b|\[(?:#|rgba?\(|hsla?\(|oklch\(|black\]|white\]))/;
const paintDeclaration = /(?:^|[;{])\s*(background(?:-color|-image)?|--[\w-]*(?:background|fill|surface)[\w-]*)\s*:\s*([^;}]+)/gi;

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

  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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
    .filter(file => file.endsWith(".css") || (/\.tsx$/.test(file) && !/\.test\.tsx$/.test(file)))
    .sort();
  const result = (await Promise.all(files.map(async file => checkGlassSource(file, await readFile(new URL(file, root), "utf8"))))).flat();
  if (result.length) {
    console.error(result.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Glass surface checks passed (${files.length} CSS and JSX files).`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) await main();
