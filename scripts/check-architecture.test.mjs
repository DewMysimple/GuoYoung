import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { analyzeArchitecture, formatArchitecture } from "./check-architecture.mjs";

function fixture(t, sources) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mysimple-architecture-"));
  t.after(() => {
    const resolvedRoot = fs.realpathSync(root);
    const resolvedTemp = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolvedRoot), resolvedTemp);
    assert.ok(path.basename(resolvedRoot).startsWith("mysimple-architecture-"));
    fs.rmSync(resolvedRoot, { recursive: true, force: true });
  });
  for (const [file, content] of Object.entries(sources)) {
    const target = path.join(root, "src", file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

test("resolves extensions, JS-to-TS mapping, directory indexes, re-exports and literal loads", (t) => {
  const root = fixture(t, {
    "main.ts": 'import { a } from "./a.ts"; export { b } from "./b"; export * from "./folder"; import("./dynamic"); require("./required"); import React from "react"; import "./style.css";',
    "a.ts": 'export { c as a } from "./c.js";',
    "b.tsx": "export const b = 1;",
    "c.ts": "export const c = 1;",
    "folder/index.ts": "export const f = 1;",
    "dynamic.ts": "export default 1;",
    "required.ts": "export const r = 1;",
    "style.css": "body {}",
    "a.test.ts": 'import "./missing";',
    "test/setup.ts": 'import "./missing";',
    "env.d.ts": "declare const env: string;",
  });
  const report = analyzeArchitecture(root);
  assert.equal(report.modules.length, 7);
  assert.equal(report.runtimeEdgeCount, 6);
  assert.equal(report.typeEdgeCount, 0);
  assert.equal(report.external.length, 1);
  assert.equal(report.assets.length, 1);
  assert.deepEqual(report.unresolved, []);
  assert.equal(report.passed, true);
  assert.deepEqual(report, analyzeArchitecture(root));
});

test("separates explicit type imports/re-exports, inline mixed specifiers and import types", (t) => {
  const report = analyzeArchitecture(fixture(t, {
    "a.ts": 'import type { B } from "./b"; export type { B } from "./b"; type I = import("./c").C;',
    "b.ts": 'import { type A } from "./a"; export { type A } from "./a";',
    "c.ts": 'import { value, type B } from "./b"; export { value, type B } from "./b";',
  }));
  assert.equal(report.runtimeEdgeCount, 1);
  assert.equal(report.typeEdgeCount, 4);
  assert.deepEqual(report.runtimeCycles, []);
  assert.deepEqual(report.typeCycles.map((cycle) => cycle.members), [["src/a.ts", "src/b.ts", "src/c.ts"]]);
  assert.equal(report.passed, true);
});

test("detects real runtime SCCs including self-import and prints source locations", (t) => {
  const report = analyzeArchitecture(fixture(t, {
    "a.ts": 'export * from "./b";',
    "b.ts": 'import("./c");',
    "c.ts": 'import "./a";',
    "self.ts": 'import "./self";',
  }));
  assert.equal(report.passed, false);
  assert.deepEqual(report.runtimeCycles, [
    { members: ["src/a.ts", "src/b.ts", "src/c.ts"], path: ["src/a.ts", "src/b.ts", "src/c.ts", "src/a.ts"] },
    { members: ["src/self.ts"], path: ["src/self.ts", "src/self.ts"] },
  ]);
  assert.match(formatArchitecture(report), /src\/a\.ts:1:1 -> src\/b\.ts/);
});

test("rejects reverse dependencies, private cross-feature paths and undeclared platform contracts", (t) => {
  const report = analyzeArchitecture(fixture(t, {
    "App.tsx": "export const app = 1;",
    "lib/legacy.ts": "export const legacy = 1;",
    "types.ts": "export type Site = string;",
    "features/collection/model/url.ts": 'import type { Site } from "../../../types"; import "../../../lib/legacy"; import "../../groups/private"; import "../../../platform/store";',
    "features/groups/private.ts": "export const group = 1;",
    "platform/store.ts": 'import "../App"; import "../shared/tool";',
    "shared/tool.ts": 'import "../features/groups/private";',
  }));
  assert.equal(report.boundaryViolations.length, 5);
  assert.ok(!report.boundaryViolations.some((edge) => edge.to === "src/types.ts"));
  assert.ok(!report.boundaryViolations.some((edge) => edge.from === "src/platform/store.ts" && edge.to === "src/shared/tool.ts"));
  assert.equal(report.passed, false);
});

test("allows same-feature and shared dependencies while legacy references remain visible", (t) => {
  const report = analyzeArchitecture(fixture(t, {
    "features/collection/model/url.ts": 'import "./names"; import "../../../shared/tool";',
    "features/collection/model/names.ts": "export const name = 1;",
    "shared/tool.ts": "export const tool = 1;",
    "lib/legacy.ts": 'import "../features/collection/model/url";',
  }));
  assert.equal(report.passed, true);
  assert.equal(report.crossBoundaryEdges.length, 2);
});

test("reports reviewed legacy cross-business edges without guessing ownership of mixed files", (t) => {
  const report = analyzeArchitecture(fixture(t, {
    "components/github-home-entry.tsx": 'import "./site-card"; import "../lib/site-utils";',
    "components/site-card.tsx": "export const card = 1;",
    "lib/site-utils.ts": "export const legacy = 1;",
    "lib/unreviewed.ts": 'import "./site-utils";',
  }));
  assert.equal(report.crossBusinessEdges.length, 1);
  assert.equal(report.crossBusinessEdges[0].fromOwner, "github");
  assert.equal(report.crossBusinessEdges[0].toOwner, "collection");
  assert.equal(report.unclassifiedBusinessEdgeCount, 2);
  assert.equal(report.ownershipCoverage.find((item) => item.file === "src/lib/unreviewed.ts").owner, "unknown");
});

test("pinpoints unresolved relative paths, records nonliteral loads and excluded test imports", (t) => {
  const report = analyzeArchitecture(fixture(t, {
    "main.ts": 'import "./typo";\nimport(path); require(name); import "./hidden.test";',
    "hidden.test.ts": "export const fixture = 1;",
  }));
  assert.equal(report.unresolved.length, 1);
  assert.equal(report.unresolved[0].line, 1);
  assert.equal(report.nonStaticLoads.length, 2);
  assert.equal(report.excludedTargets.length, 1);
  assert.match(formatArchitecture(report), /src\/main\.ts:1:1: unresolved "\.\/typo"/);
  assert.equal(report.passed, false);
});

test("CLI is read-only by default, preserves graph determinism and confines optional JSON", (t) => {
  const root = fixture(t, { "main.ts": "export const value = 1;" });
  const script = fileURLToPath(new URL("./check-architecture.mjs", import.meta.url));
  const before = fs.readFileSync(path.join(root, "src/main.ts"), "utf8");
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
  assert.equal(run().status, 0);
  assert.deepEqual(fs.readdirSync(root), ["src"]);
  assert.equal(run("--json", "src/report.json").status, 1);
  assert.equal(fs.existsSync(path.join(root, "src/report.json")), false);
  const output = "artifacts/working/architecture-phase1/report.json";
  assert.equal(run("--json", output).status, 0);
  const json = fs.readFileSync(path.join(root, output), "utf8");
  assert.equal(run("--json", output).status, 0);
  assert.equal(fs.readFileSync(path.join(root, output), "utf8"), json);
  assert.equal(fs.readFileSync(path.join(root, "src/main.ts"), "utf8"), before);
});
