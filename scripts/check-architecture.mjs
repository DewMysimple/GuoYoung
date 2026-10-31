import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const slash = (value) => value.replaceAll("\\", "/");
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = (values) => [...values].sort(compare);
const isSource = (file) => /\.tsx?$/.test(file) && !/\.d\.ts$/.test(file);
const isTest = (file) => /(?:^|\/)(?:__tests__|test|tests)(?:\/|$)|\.(?:test|spec)\.[^/]+$/.test(file);

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  });
}

function zone(file) {
  const parts = file.split("/");
  if (parts[1] === "features") return `features/${parts[2]}`;
  if (["app", "shared", "platform", "popup", "data", "components", "hooks", "lib"].includes(parts[1])) return parts[1];
  if (["App.tsx", "main.tsx", "background.ts"].includes(parts[1])) return "entry";
  return "root";
}

// Reviewed file-level ownership, not filename heuristics. Mixed/unknown modules
// remain explicit; this partial map does not claim all legacy business borders.
const reviewedOwnership = Object.fromEntries(Object.entries({
  assembly: ["App.tsx", "main.tsx", "background.ts", "lib/app-startup.ts", "popup/main.tsx", "popup/popup-app.tsx"],
  collection: ["lib/collection-search.ts", "lib/collection-selection.ts", "lib/site-notes.ts", "lib/grouped-sites.ts", "components/site-card.tsx", "components/site-dialog.tsx", "components/add-site-card.tsx", "components/collection-site-grid.tsx", "hooks/use-collection-selection.ts", "hooks/use-site-dragging.ts", "hooks/use-site-click-guard.ts"],
  groups: ["lib/group-sort.ts", "lib/collection-drag-ids.ts", "lib/collection-drag-geometry.ts", "lib/collection-drag-sensors.ts", "hooks/use-group-sort-session.ts", "hooks/use-group-sorting.ts", "components/group-dialog.tsx", "components/grouped-collection.tsx", "components/group-section-nav.tsx", "components/group-section-header.tsx", "components/group-drop-target.tsx", "components/group-insert-control.tsx", "components/group-sort-preview.tsx", "components/new-group-dialog.tsx", "components/sortable-group-section.tsx"],
  github: ["lib/github-workspace.ts", "lib/github-repository-api.ts", "components/github-home-entry.tsx", "components/github-refresh-details-dialog.tsx", "components/github-repository-import-dialog.tsx"],
  history: ["lib/browser-history.ts", "components/browser-history-view.tsx", "components/history-cards.tsx", "components/history-card-content.tsx", "components/history-range-control.tsx", "hooks/use-browser-history-data.ts"],
  "data-transfer": ["lib/data-transfer.ts", "lib/data-workspace.ts", "components/data-workspace.tsx", "components/data-transfer-actions.tsx"],
  appearance: ["lib/appearance-settings.ts", "lib/layout.ts", "lib/typography.ts", "lib/local-fonts.ts", "lib/wallpaper-store.ts", "lib/wallpaper-startup.ts", "lib/wallpaper-presets.ts", "lib/wallpaper-glass.ts", "lib/brand-logo.ts", "lib/brand-icons.ts", "components/appearance-settings.tsx", "components/brand-mark.tsx", "components/brand-settings-editor.tsx", "components/typography-settings.tsx", "components/wallpaper-settings-editor.tsx", "components/wallpaper-presets.tsx", "components/local-font-picker.tsx", "hooks/use-wallpaper.ts", "hooks/use-local-font.ts", "hooks/use-theme.ts", "hooks/use-appearance-color-preview.ts"],
  platform: ["lib/browser-runtime.ts", "lib/state-store.ts", "lib/asset-store.ts"],
  shared: ["components/card-primitives.tsx", "components/select-menu.tsx", "components/confirm-dialog.tsx", "components/help-tip.tsx", "components/range-control.tsx", "components/resize-handle.tsx", "components/workspace-search.tsx", "components/settings-options.tsx"],
  mixed: ["lib/site-utils.ts", "lib/site-state.ts", "lib/storage.ts", "hooks/use-site-hub.ts", "components/settings-panel.tsx", "data/defaults.ts", "types.ts"],
}).flatMap(([owner, files]) => files.map((file) => [`src/${file}`, owner])));

function ownership(file) {
  const layer = zone(file);
  if (layer.startsWith("features/")) return layer.slice("features/".length);
  if (layer === "shared" || layer === "platform") return layer;
  return reviewedOwnership[file] ?? "unknown";
}

// No cross-feature APIs have been agreed yet. Add exact source/target pairs with
// reasons here when an actual consumer establishes a public contract.
const publicContracts = [];

function boundaryReason(edge) {
  const from = zone(edge.from);
  const to = zone(edge.to);
  if (!/^(?:features\/|shared$|platform$)/.test(from)) return null;
  if (from === to) return null;
  // Transitional shared domain types are not a runtime dependency.
  if (edge.kind === "type" && edge.to === "src/types.ts") return null;
  if (publicContracts.some((contract) => contract.from === edge.from && contract.to === edge.to)) return null;
  if (from.startsWith("features/")) {
    if (to === "shared") return null;
    return to === "platform" || to.startsWith("features/")
      ? "requires an explicitly agreed public API contract"
      : "feature must not depend on assembly or transitional implementation";
  }
  if (from === "platform" && to === "shared") return null;
  return `${from} must not depend on ${to}`;
}

/** Tarjan SCC, with a real directed witness path for each cyclic component. */
function cyclesFor(modules, edges) {
  const graph = new Map(modules.map((file) => [file, []]));
  for (const edge of edges) graph.get(edge.from).push(edge.to);
  for (const [file, targets] of graph) graph.set(file, sorted(new Set(targets)));
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const active = new Set();
  const components = [];
  let index = 0;
  function visit(file) {
    indices.set(file, index);
    low.set(file, index++);
    stack.push(file);
    active.add(file);
    for (const target of graph.get(file)) {
      if (!indices.has(target)) {
        visit(target);
        low.set(file, Math.min(low.get(file), low.get(target)));
      } else if (active.has(target)) low.set(file, Math.min(low.get(file), indices.get(target)));
    }
    if (low.get(file) === indices.get(file)) {
      const component = [];
      let current;
      do {
        current = stack.pop();
        active.delete(current);
        component.push(current);
      } while (current !== file);
      if (component.length > 1 || graph.get(file).includes(file)) components.push(sorted(component));
    }
  }
  for (const file of modules) if (!indices.has(file)) visit(file);
  return components.sort((a, b) => compare(a[0], b[0])).map((members) => {
    const memberSet = new Set(members);
    const start = members[0];
    const visited = new Set([start]);
    function witness(file, trail) {
      for (const target of graph.get(file).filter((item) => memberSet.has(item))) {
        if (target === start) return [...trail, target];
        if (!visited.has(target)) {
          visited.add(target);
          const found = witness(target, [...trail, target]);
          if (found) return found;
        }
      }
      return null;
    }
    return { members, path: witness(start, [start]) };
  });
}

/** Source-syntax graph: explicit type syntax is separate from value imports. */
export function analyzeArchitecture(root) {
  const absoluteRoot = path.resolve(root);
  const allFiles = filesBelow(path.join(absoluteRoot, "src"));
  const modules = sorted(allFiles.map((file) => slash(path.relative(absoluteRoot, file)))
    .filter((file) => isSource(file) && !isTest(file)));
  const moduleSet = new Set(modules);
  const edges = [];
  const external = [];
  const assets = [];
  const unresolved = [];
  const nonStaticLoads = [];
  const excludedTargets = [];
  const configPath = ts.findConfigFile(absoluteRoot, ts.sys.fileExists, "tsconfig.app.json");
  let compilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true };
  if (configPath) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
    compilerOptions = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath)).options;
  }
  function add(source, specifier, kind, form, node, sourceFile) {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const item = { from: source, specifier, kind, form, line: location.line + 1, column: location.character + 1 };
    if (!specifier.startsWith(".")) {
      external.push(item);
      return;
    }
    const importer = path.join(absoluteRoot, source);
    const resolved = ts.resolveModuleName(specifier, importer, compilerOptions, ts.sys).resolvedModule;
    let target = resolved?.resolvedFileName;
    // TypeScript does not resolve CSS and URL imports; keep them visible outside
    // the TS module graph rather than inventing module edges or ignoring typos.
    const assetPath = path.resolve(path.dirname(importer), specifier.replace(/[?#].*$/, ""));
    if (!target && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) target = assetPath;
    if (!target) {
      unresolved.push(item);
      return;
    }
    const relativeTarget = slash(path.relative(absoluteRoot, target));
    const dependency = { ...item, to: relativeTarget };
    if (moduleSet.has(relativeTarget)) edges.push(dependency);
    else if (isSource(relativeTarget) || /\.d\.ts$/.test(relativeTarget)) excludedTargets.push(dependency);
    else assets.push(dependency);
  }
  for (const file of modules) {
    const absolute = path.join(absoluteRoot, file);
    const sourceFile = ts.createSourceFile(absolute, fs.readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true);
    const addLiteral = (specifier, kind, form, node) => add(file, specifier.text, kind, form, node, sourceFile);
    function visit(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const elements = bindings && ts.isNamedImports(bindings) ? bindings.elements : [];
        const typeOnly = clause?.isTypeOnly || (!clause?.name && elements.length > 0 && elements.every((part) => part.isTypeOnly));
        addLiteral(node.moduleSpecifier, typeOnly ? "type" : "runtime", "import", node);
        if (!typeOnly && elements.some((part) => part.isTypeOnly)) addLiteral(node.moduleSpecifier, "type", "import", node);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        const elements = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements : [];
        const typeOnly = node.isTypeOnly || (elements.length > 0 && elements.every((part) => part.isTypeOnly));
        addLiteral(node.moduleSpecifier, typeOnly ? "type" : "runtime", "re-export", node);
        if (!typeOnly && elements.some((part) => part.isTypeOnly)) addLiteral(node.moduleSpecifier, "type", "re-export", node);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) {
        const specifier = node.moduleReference.expression;
        if (ts.isStringLiteralLike(specifier)) addLiteral(specifier, node.isTypeOnly ? "type" : "runtime", "import-equals", node);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
        addLiteral(node.argument.literal, "type", "import-type", node);
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        const form = node.expression.kind === ts.SyntaxKind.ImportKeyword ? "dynamic-import" : "require";
        const specifier = node.arguments[0];
        if (specifier && ts.isStringLiteralLike(specifier)) addLiteral(specifier, "runtime", form, node);
        else {
          const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          nonStaticLoads.push({ from: file, form, line: location.line + 1, column: location.character + 1 });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  const edgeOrder = (a, b) => compare(a.from, b.from) || compare(a.to ?? a.specifier ?? "", b.to ?? b.specifier ?? "") || compare(a.kind ?? "", b.kind ?? "") || a.line - b.line;
  for (const list of [edges, external, assets, unresolved, excludedTargets, nonStaticLoads]) list.sort(edgeOrder);
  // Count unique directed file pairs per kind, retaining occurrence details.
  const unique = (kind) => [...new Map(edges.filter((edge) => edge.kind === kind).map((edge) => [`${edge.from}\0${edge.to}`, edge])).values()];
  const runtimeEdges = unique("runtime");
  const typeEdges = unique("type");
  const crossBoundaryEdges = edges.filter((edge) => zone(edge.from) !== zone(edge.to));
  const ownershipCoverage = modules.map((file) => ({ file, owner: ownership(file) }));
  const classified = (file) => !["mixed", "unknown"].includes(ownership(file));
  const crossBusinessEdges = edges.filter((edge) => classified(edge.from) && classified(edge.to) && ownership(edge.from) !== ownership(edge.to))
    .map((edge) => ({ ...edge, fromOwner: ownership(edge.from), toOwner: ownership(edge.to) }));
  const unclassifiedBusinessEdgeCount = edges.filter((edge) => !classified(edge.from) || !classified(edge.to)).length;
  const boundaryViolations = edges.flatMap((edge) => {
    const reason = boundaryReason(edge);
    return reason ? [{ ...edge, reason }] : [];
  });
  const counts = new Map();
  for (const edge of crossBoundaryEdges) {
    const key = `${zone(edge.from)} -> ${zone(edge.to)} (${edge.kind})`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const businessCounts = new Map();
  for (const edge of crossBusinessEdges) {
    const key = `${edge.fromOwner} -> ${edge.toOwner} (${edge.kind})`;
    businessCounts.set(key, (businessCounts.get(key) ?? 0) + 1);
  }
  const degrees = modules.map((file) => ({
    file,
    runtimeIn: runtimeEdges.filter((edge) => edge.to === file).length,
    runtimeOut: runtimeEdges.filter((edge) => edge.from === file).length,
    typeIn: typeEdges.filter((edge) => edge.to === file).length,
    typeOut: typeEdges.filter((edge) => edge.from === file).length,
    lines: fs.readFileSync(path.join(absoluteRoot, file), "utf8").split(/\r?\n/).length,
  }));
  const runtimeCycles = cyclesFor(modules, runtimeEdges);
  const typeCycles = cyclesFor(modules, typeEdges);
  return {
    scope: "src/**/*.ts(x), excluding declarations, tests/specs and test directories; explicit type syntax separated; value syntax conservatively runtime",
    modules, edges, runtimeEdgeCount: runtimeEdges.length, typeEdgeCount: typeEdges.length,
    runtimeCycles, typeCycles, crossBoundaryEdges,
    crossBoundaryCounts: sorted(counts.keys()).map((boundary) => ({ boundary, occurrences: counts.get(boundary) })),
    ownershipCoverage, crossBusinessEdges, unclassifiedBusinessEdgeCount,
    crossBusinessCounts: sorted(businessCounts.keys()).map((boundary) => ({ boundary, occurrences: businessCounts.get(boundary) })),
    degrees, external, assets, excludedTargets, unresolved, nonStaticLoads, boundaryViolations,
    passed: runtimeCycles.length === 0 && boundaryViolations.length === 0 && unresolved.length === 0 && excludedTargets.length === 0,
    limitations: [
      "Nonliteral loads, browser/runtime injection and computed paths cannot be resolved statically.",
      "Explicit type syntax is separate; value-syntax imports are conservative (no type-checker erasure or bundler tree-shaking simulation).",
      "Bare specifiers are external; CSS/assets are listed but their own imports are not traversed.",
      "Layer names describe transitional folders, not inferred business ownership; legacy references are reported, not globally forbidden.",
      "Cross-business output uses a reviewed partial file map; mixed/unknown modules are explicitly unclassified, not assigned by filename.",
      "Unqualified require calls are conservatively treated as module loads, including potentially shadowed identifiers.",
    ],
  };
}

export function formatArchitecture(report) {
  const lines = [
    `Modules: ${report.modules.length}; runtime edges: ${report.runtimeEdgeCount}; type edges: ${report.typeEdgeCount}`,
    report.runtimeCycles.length ? `Runtime SCCs: ${report.runtimeCycles.length}` : "当前静态图无运行时循环",
    `Type-only SCCs: ${report.typeCycles.length} (reported separately, not a runtime failure)`,
  ];
  for (const [kind, cycles] of [["runtime", report.runtimeCycles], ["type", report.typeCycles]]) {
    for (const cycle of cycles) {
      lines.push(`${kind} SCC: ${cycle.members.join(", ")}`, `  path: ${cycle.path.join(" -> ")}`);
      for (let i = 0; i < cycle.path.length - 1; i++) {
        const edge = report.edges.find((item) => item.kind === kind && item.from === cycle.path[i] && item.to === cycle.path[i + 1]);
        lines.push(`  ${edge.from}:${edge.line}:${edge.column} -> ${edge.to} (${edge.form})`);
      }
    }
  }
  lines.push("Cross-layer dependency occurrences (full file edges in JSON):");
  for (const count of report.crossBoundaryCounts) lines.push(`  ${count.boundary}: ${count.occurrences}`);
  lines.push(`Cross-business occurrences from reviewed ownership map (${report.unclassifiedBusinessEdgeCount} mixed/unknown occurrences not classified):`);
  for (const count of report.crossBusinessCounts) lines.push(`  ${count.boundary}: ${count.occurrences}`);
  for (const [label, field] of [["Runtime incoming hotspots", "runtimeIn"], ["Runtime outgoing hotspots", "runtimeOut"]]) {
    lines.push(`${label}:`);
    for (const item of [...report.degrees].sort((a, b) => b[field] - a[field] || compare(a.file, b.file)).slice(0, 10)) lines.push(`  ${item.file}: ${item[field]}`);
  }
  for (const edge of report.boundaryViolations) lines.push(`ERROR ${edge.from}:${edge.line}:${edge.column} -> ${edge.to}: ${edge.reason}`);
  for (const edge of report.unresolved) lines.push(`ERROR ${edge.from}:${edge.line}:${edge.column}: unresolved ${JSON.stringify(edge.specifier)}`);
  for (const edge of report.excludedTargets) lines.push(`ERROR ${edge.from}:${edge.line}:${edge.column} -> ${edge.to}: runtime source imports excluded test/declaration module`);
  for (const load of report.nonStaticLoads) lines.push(`LIMIT ${load.from}:${load.line}:${load.column}: nonliteral ${load.form}`);
  lines.push(`External imports: ${report.external.length}; local assets: ${report.assets.length}; nonstatic loads: ${report.nonStaticLoads.length}`);
  lines.push(...report.limitations.map((item) => `Limit: ${item}`));
  lines.push(report.passed ? "Architecture check passed." : "Architecture check failed.");
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = process.cwd();
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== "--json")) throw new Error("Usage: node scripts/check-architecture.mjs [--json artifacts/working/architecture-phase1/report.json]");
    const report = analyzeArchitecture(root);
    if (args.length) {
      const output = path.resolve(root, args[1]);
      const allowed = path.resolve(root, "artifacts/working/architecture-phase1");
      const relative = path.relative(allowed, output);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.extname(output) !== ".json") throw new Error("JSON output must be inside artifacts/working/architecture-phase1/ and end in .json");
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatArchitecture(report));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(`Architecture check error: ${error.message}`);
    process.exitCode = 1;
  }
}
