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

test("keeps group and GitHub extraction entrypoints compatible without allowing legacy type dependencies", (t) => {
  const report = analyzeArchitecture(fixture(t, {
    "App.tsx": 'import "./features/github/model/repository-refresh";',
    "hooks/use-site-hub.ts": 'import "../features/groups/model/group-reorder";',
    "lib/site-utils.ts": 'export { reorderGroups } from "../features/groups/model/group-reorder";',
    "types.ts": "export interface SiteGroup { id: string } export interface GithubImportSource { login: string }",
    "features/groups/model/group-reorder.ts": 'import type { SiteGroup } from "../../../types"; export const reorderGroups = (groups: SiteGroup[]) => groups;',
    "features/github/model/repository-refresh.ts": 'import type { GithubImportSource } from "../../../types"; import type { Report } from "../../../components/github-refresh-details-dialog"; import type { Owner } from "../../../lib/github-repository-api";',
    "components/github-refresh-details-dialog.tsx": "export interface Report { entries: unknown[] }",
    "lib/github-repository-api.ts": "export interface Owner { login: string }",
  }));

  assert.equal(report.runtimeEdgeCount, 3);
  assert.equal(report.typeEdgeCount, 4);
  assert.deepEqual(report.runtimeCycles, []);
  assert.deepEqual(report.typeCycles, []);
  assert.deepEqual(report.unresolved, []);
  assert.deepEqual(report.boundaryViolations.map(({ from, to, kind }) => ({ from, to, kind })), [
    { from: "src/features/github/model/repository-refresh.ts", to: "src/components/github-refresh-details-dialog.tsx", kind: "type" },
    { from: "src/features/github/model/repository-refresh.ts", to: "src/lib/github-repository-api.ts", kind: "type" },
  ]);
  assert.equal(report.ownershipCoverage.find(({ file }) => file === "src/features/groups/model/group-reorder.ts").owner, "groups");
  assert.equal(report.ownershipCoverage.find(({ file }) => file === "src/features/github/model/repository-refresh.ts").owner, "github");
  assert.equal(report.ownershipCoverage.find(({ file }) => file === "src/lib/site-utils.ts").owner, "mixed");
  assert.ok(report.edges.some(({ from, to, form }) => from === "src/lib/site-utils.ts" && to === "src/features/groups/model/group-reorder.ts" && form === "re-export"));
  assert.equal(report.passed, false);
});

test("keeps reviewed app workflows above legacy services and pure models without weakening reverse boundaries or cycles", (t) => {
  const sources = {
    "App.tsx": 'import "./app/hooks/use-github-repository-workflow"; import "./app/hooks/use-collection-search-session";',
    "app/hooks/use-github-repository-workflow.ts": 'import { read } from "../../lib/github-repository-api"; import type { Report } from "../../components/github-refresh-details-dialog"; import { deduplicate } from "../../features/github/model/repository-refresh"; export interface Session { report: Report }',
    "app/hooks/use-collection-search-session.ts": 'import { searchWeb } from "../../lib/browser-search"; import type { SiteGroup } from "../../types"; export interface SearchSession { groups: SiteGroup[] }',
    "app/hooks/use-unreviewed-session.ts": "export const unreviewed = 1;",
    "lib/github-repository-api.ts": "export const read = () => [];",
    "lib/browser-search.ts": "export const searchWeb = () => {};",
    "components/github-refresh-details-dialog.tsx": "export interface Report { entries: unknown[] }",
    "features/github/model/repository-refresh.ts": 'import type { SiteGroup } from "../../../types"; export const deduplicate = (groups: SiteGroup[]) => groups;',
    "types.ts": "export interface SiteGroup { id: string }",
  };
  const allowed = analyzeArchitecture(fixture(t, sources));
  assert.equal(allowed.passed, true);
  assert.equal(allowed.runtimeEdgeCount, 5);
  assert.equal(allowed.typeEdgeCount, 3);
  assert.deepEqual(allowed.boundaryViolations, []);
  assert.deepEqual(allowed.unresolved, []);
  for (const file of ["src/app/hooks/use-github-repository-workflow.ts", "src/app/hooks/use-collection-search-session.ts"]) {
    assert.equal(allowed.ownershipCoverage.find((item) => item.file === file).owner, "assembly");
  }
  assert.equal(allowed.ownershipCoverage.find((item) => item.file === "src/app/hooks/use-unreviewed-session.ts").owner, "unknown");

  const reversed = analyzeArchitecture(fixture(t, {
    ...sources,
    "features/collection/model/reverse.ts": 'import "../../../app/hooks/use-github-repository-workflow"; import type { SearchSession } from "../../../app/hooks/use-collection-search-session";',
    "shared/tool.ts": 'import "../app/hooks/use-github-repository-workflow"; import type { SearchSession } from "../app/hooks/use-collection-search-session";',
  }));
  assert.equal(reversed.passed, false);
  assert.deepEqual(reversed.unresolved, []);
  assert.deepEqual(reversed.boundaryViolations.map(({ from, to, kind }) => ({ from, to, kind })), [
    { from: "src/features/collection/model/reverse.ts", to: "src/app/hooks/use-collection-search-session.ts", kind: "type" },
    { from: "src/features/collection/model/reverse.ts", to: "src/app/hooks/use-github-repository-workflow.ts", kind: "runtime" },
    { from: "src/shared/tool.ts", to: "src/app/hooks/use-collection-search-session.ts", kind: "type" },
    { from: "src/shared/tool.ts", to: "src/app/hooks/use-github-repository-workflow.ts", kind: "runtime" },
  ]);

  const cyclic = analyzeArchitecture(fixture(t, {
    ...sources,
    "lib/github-repository-api.ts": 'import "../app/hooks/use-github-repository-workflow"; export const read = () => [];',
    "components/github-refresh-details-dialog.tsx": 'import type { Session } from "../app/hooks/use-github-repository-workflow"; export interface Report { session?: Session }',
  }));
  assert.equal(cyclic.passed, false);
  assert.deepEqual(cyclic.boundaryViolations, []);
  assert.deepEqual(cyclic.runtimeCycles.map((cycle) => cycle.members), [["src/app/hooks/use-github-repository-workflow.ts", "src/lib/github-repository-api.ts"]]);
  assert.deepEqual(cyclic.typeCycles.map((cycle) => cycle.members), [["src/app/hooks/use-github-repository-workflow.ts", "src/components/github-refresh-details-dialog.tsx"]]);
});

test("reviews storage normalizers as transitional pure modules without allowing reverse feature dependencies", (t) => {
  const sources = {
    "lib/storage.ts": 'import { clamp } from "./storage-normalization/number"; import { normalizeBrand } from "./storage-normalization/brand"; import { normalizeWallpaper } from "./storage-normalization/wallpaper"; export { normalizeBrand, normalizeWallpaper }; export interface LegacyState {}',
    "lib/storage-normalization/brand.ts": 'import { defaults } from "../../data/defaults"; import { valid } from "../brand-logo"; import type { Brand } from "../../types"; export interface NormalizedBrand {} export const normalizeBrand = (value: Brand) => value;',
    "lib/storage-normalization/wallpaper.ts": 'import { defaults } from "../../data/defaults"; import { keys } from "../wallpaper-presets"; import { clamp } from "./number"; import type { Wallpaper } from "../../types"; export const normalizeWallpaper = (value: Wallpaper) => value;',
    "lib/storage-normalization/number.ts": "export const clamp = (value: number) => value;",
    "lib/brand-logo.ts": "export const valid = () => true;",
    "lib/wallpaper-presets.ts": "export const keys = [];",
    "lib/storage-normalization/unreviewed.ts": "export const value = 1;",
    "data/defaults.ts": "export const defaults = {};",
    "types.ts": "export interface Brand {} export interface Wallpaper {}",
  };
  const allowed = analyzeArchitecture(fixture(t, sources));
  assert.equal(allowed.passed, true);
  assert.deepEqual(allowed.runtimeCycles, []);
  assert.deepEqual(allowed.typeCycles, []);
  assert.deepEqual(allowed.unresolved, []);
  for (const file of ["brand", "wallpaper"]) {
    assert.equal(allowed.ownershipCoverage.find((item) => item.file === `src/lib/storage-normalization/${file}.ts`).owner, "appearance");
  }
  assert.equal(allowed.ownershipCoverage.find((item) => item.file === "src/lib/storage-normalization/number.ts").owner, "shared");
  assert.equal(allowed.ownershipCoverage.find((item) => item.file === "src/lib/storage-normalization/unreviewed.ts").owner, "unknown");
  assert.ok(allowed.edges.some((edge) => edge.from === "src/lib/storage.ts" && edge.to === "src/lib/storage-normalization/brand.ts" && edge.kind === "runtime"));

  const reversed = analyzeArchitecture(fixture(t, {
    ...sources,
    "features/appearance/model/reverse.ts": 'import "../../../lib/storage-normalization/brand"; import type { NormalizedBrand } from "../../../lib/storage-normalization/brand";',
    "shared/number.ts": 'import "../lib/storage-normalization/number";',
    "platform/storage/adapter.ts": 'import "../../lib/storage";',
  }));
  assert.equal(reversed.passed, false);
  assert.deepEqual(reversed.unresolved, []);
  assert.deepEqual(reversed.boundaryViolations.map(({ from, to, kind }) => ({ from, to, kind })), [
    { from: "src/features/appearance/model/reverse.ts", to: "src/lib/storage-normalization/brand.ts", kind: "runtime" },
    { from: "src/features/appearance/model/reverse.ts", to: "src/lib/storage-normalization/brand.ts", kind: "type" },
    { from: "src/platform/storage/adapter.ts", to: "src/lib/storage.ts", kind: "runtime" },
    { from: "src/shared/number.ts", to: "src/lib/storage-normalization/number.ts", kind: "runtime" },
  ]);

  const cyclic = analyzeArchitecture(fixture(t, {
    ...sources,
    "lib/storage.ts": `${sources["lib/storage.ts"]} import type { NormalizedBrand } from "./storage-normalization/brand";`,
    "lib/storage-normalization/brand.ts": `${sources["lib/storage-normalization/brand.ts"]} import "../storage"; import type { LegacyState } from "../storage";`,
  }));
  assert.equal(cyclic.passed, false);
  assert.deepEqual(cyclic.boundaryViolations, []);
  assert.deepEqual(cyclic.runtimeCycles.map((cycle) => cycle.members), [["src/lib/storage-normalization/brand.ts", "src/lib/storage.ts"]]);
  assert.deepEqual(cyclic.typeCycles.map((cycle) => cycle.members), [["src/lib/storage-normalization/brand.ts", "src/lib/storage.ts"]]);
});

test("keeps popup bookmark sessions in assembly with one-way legacy dependencies and independent cycle checks", (t) => {
  const sources = {
    "popup/popup-app.tsx": 'import "./hooks/use-bookmark-session"; import "../lib/state-store";',
    "popup/hooks/use-bookmark-session.ts": 'import { importBookmarks } from "../../lib/bookmark-manager"; import type { BookmarksApi } from "../../lib/browser-runtime"; import { getBookmarkSiteIds } from "../bookmark-tree"; export interface BookmarkSession {}',
    "popup/hooks/use-unreviewed.ts": "export const value = 1;",
    "popup/bookmark-tree.tsx": "export const getBookmarkSiteIds = () => [];",
    "lib/state-store.ts": "export const createStore = () => ({});",
    "lib/bookmark-manager.ts": "export const importBookmarks = () => [];",
    "lib/browser-runtime.ts": "export interface BookmarksApi {}",
  };
  const allowed = analyzeArchitecture(fixture(t, sources));
  assert.equal(allowed.passed, true);
  assert.deepEqual(allowed.runtimeCycles, []);
  assert.deepEqual(allowed.typeCycles, []);
  assert.deepEqual(allowed.unresolved, []);
  assert.equal(allowed.ownershipCoverage.find((item) => item.file === "src/popup/hooks/use-bookmark-session.ts").owner, "assembly");
  assert.equal(allowed.ownershipCoverage.find((item) => item.file === "src/popup/hooks/use-unreviewed.ts").owner, "unknown");

  const reversed = analyzeArchitecture(fixture(t, {
    ...sources,
    "features/bookmarks/model/reverse.ts": 'import "../../../popup/hooks/use-bookmark-session"; import type { BookmarkSession } from "../../../popup/hooks/use-bookmark-session";',
    "shared/bookmarks.ts": 'import "../popup/hooks/use-bookmark-session"; import type { BookmarkSession } from "../popup/hooks/use-bookmark-session";',
  }));
  assert.equal(reversed.passed, false);
  assert.deepEqual(reversed.unresolved, []);
  assert.deepEqual(reversed.boundaryViolations.map(({ from, to, kind }) => ({ from, to, kind })), [
    { from: "src/features/bookmarks/model/reverse.ts", to: "src/popup/hooks/use-bookmark-session.ts", kind: "runtime" },
    { from: "src/features/bookmarks/model/reverse.ts", to: "src/popup/hooks/use-bookmark-session.ts", kind: "type" },
    { from: "src/shared/bookmarks.ts", to: "src/popup/hooks/use-bookmark-session.ts", kind: "runtime" },
    { from: "src/shared/bookmarks.ts", to: "src/popup/hooks/use-bookmark-session.ts", kind: "type" },
  ]);

  const cyclic = analyzeArchitecture(fixture(t, {
    ...sources,
    "lib/bookmark-manager.ts": `${sources["lib/bookmark-manager.ts"]} import "../popup/hooks/use-bookmark-session";`,
    "lib/browser-runtime.ts": `${sources["lib/browser-runtime.ts"]} import type { BookmarkSession } from "../popup/hooks/use-bookmark-session";`,
  }));
  assert.equal(cyclic.passed, false);
  assert.deepEqual(cyclic.boundaryViolations, []);
  assert.deepEqual(cyclic.runtimeCycles.map((cycle) => cycle.members), [["src/lib/bookmark-manager.ts", "src/popup/hooks/use-bookmark-session.ts"]]);
  assert.deepEqual(cyclic.typeCycles.map((cycle) => cycle.members), [["src/lib/browser-runtime.ts", "src/popup/hooks/use-bookmark-session.ts"]]);
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
