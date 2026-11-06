import { describe, expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import { createGroupExportPayload, serializeExport } from "./data-transfer";
import { applyDataImport, createSelectedGroupsExport, getTransferGroupCounts, parseTransferFile } from "./data-workspace";
import { commitGroupEntriesToState, getGroupEntries } from "./group-hierarchy";
import { addGroupToState, addSiteToState } from "./site-state";
import { getSitesInGroup } from "./site-utils";

function sharedFile() {
  const payload = createGroupExportPayload(createDefaultState(), "design");
  payload.sites = [{ name: "New", url: "https://shared.example/", order: 0 }, { name: "Duplicate", url: "https://www.google.com/", order: 1 }];
  return parseTransferFile(JSON.stringify(payload));
}

function hierarchySource() {
  const state = { ...createDefaultState(), sites: [] };
  let source = addGroupToState(state, "灵感", "palette", "inspiration", undefined, undefined, "main", "design");
  source = addGroupToState(source, "空目录", "folder", "empty", undefined, undefined, "main", "design");
  for (const [id, name, groupId] of [["a", "A", "design"], ["b", "B", "design"], ["c", "C", "inspiration"]]) {
    source = addSiteToState(source, {
      name, groupId, url: `https://${id}.hierarchy.example`, note: `${name} note`, customIconUrl: "", iconSource: "auto",
    }, id);
  }
  return commitGroupEntriesToState(source, "design", ["site:a", "folder:inspiration", "site:b", "folder:empty"]);
}

function entries(state: ReturnType<typeof createDefaultState>, groupId: string) {
  const group = state.groups.find(candidate => candidate.id === groupId)!;
  return getGroupEntries(group, state.groups, getSitesInGroup(state.sites, groupId), "manual").map(entry =>
    entry.kind === "site" ? entry.site.name : entry.group.name);
}
describe("data workspace transactions", () => {
  it("round-trips a group package and conservatively merges its navigation targets", () => {
    const state = createDefaultState();
    const urls = [
      "https://example.com/docs#installation",
      "https://example.com/Guide",
      "https://example.com/guide",
      "https://example.com/docs",
      "https://example.com/docs/",
      "https://example.com/?next=/docs/",
      "https://example.com/#/dashboard/",
    ];
    const source = createDefaultState();
    source.sites = urls.map((url, index) => ({
      ...source.sites[0], id: `source-${index}`, name: `Target ${index}`,
      groupId: "design", url, order: index, globalOrder: index,
    }));
    state.sites.push({ ...source.sites[0], id: "existing-anchor", groupId: "search" });
    const originalSites = JSON.stringify(state.sites);
    const file = parseTransferFile(JSON.stringify(createSelectedGroupsExport(source, ["design"])));
    expect(file.groups[0].payload.sites.map((site) => site.url)).toEqual(urls);

    const result = applyDataImport(state, {
      file, keys: ["0"], destination: { kind: "existing", groupId: "search" },
    });
    expect(result).toMatchObject({ added: 6, skipped: 1, created: 0 });
    expect(result.state.sites.filter((site) => site.name.startsWith("Target "))
      .map((site) => site.url)).toEqual(urls);
    expect(JSON.stringify(state.sites)).toBe(originalSites);
    const repeated = applyDataImport(result.state, {
      file, keys: ["0"], destination: { kind: "existing", groupId: "search" },
    });
    expect(repeated).toMatchObject({ added: 0, skipped: 7 });
  });

  it("creates a uniquely named group and preserves all existing data without mutating the snapshot", () => {
    const state = createDefaultState();
    const before = JSON.stringify(state);
    const file = sharedFile();
    const result = applyDataImport(state, { file, keys: ["0"], destination: { kind: "new", name: state.groups[0].name } });
    expect(result).toMatchObject({ added: 1, skipped: 1, created: 1 });
    expect(result.state.groups.find(group => group.name === `${state.groups[0].name} (2)`)).toBeTruthy();
    expect(result.state.appearance).toBe(state.appearance);
    expect(result.state.sites.length).toBe(state.sites.length + 1);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("appends into a protected group, and rejects a deleted destination", () => {
    const state = createDefaultState();
    const target = state.groups.find(group => group.isProtected && group.workspace === "main")!;
    const file = sharedFile();
    const result = applyDataImport(state, { file, keys: ["0"], destination: { kind: "existing", groupId: target.id } });
    expect(result.state.sites.find(site => site.name === "New")?.groupId).toBe(target.id);
    expect(result.state.groups).toEqual(state.groups);
    expect(() => applyDataImport(state, { file, keys: ["0"], destination: { kind: "existing", groupId: "deleted" } })).toThrow("目标分组");
  });
  it("exports multiple groups with their workspaces and allows a subset to be imported", () => {
    const state = createDefaultState();
    const ids = ["design", "search"];
    const file = parseTransferFile(JSON.stringify(createSelectedGroupsExport(state, ids)));
    expect(file.groups).toHaveLength(2);
    const result = applyDataImport(state, { file, keys: [file.groups[0].key], destination: { kind: "new" } });
    expect(result.created).toBe(1);
    expect(result.added).toBe(0);
    expect(result.state.groups.length).toBe(state.groups.length + 1);
    expect(() => createSelectedGroupsExport(state, [])).toThrow("至少选择");
  });
  it("only replaces from a full backup and preserves local recovery data", () => {
    const state = createDefaultState();
    const backup = createDefaultState(); backup.sites = [];
    const file = parseTransferFile(serializeExport(backup));
    const result = applyDataImport(state, { file, keys: [], destination: { kind: "replace" } });
    expect(result.state.sites).toHaveLength(0);
    expect(result.state.deletedSites).toBe(state.deletedSites);
    expect(result.state.searchHistory).toBe(state.searchHistory);
    expect(() => applyDataImport(state, { file: sharedFile(), keys: ["0"], destination: { kind: "replace" } })).toThrow("整库备份");
  });
  it("keeps GitHub routing and counts incompatible URLs as skipped", () => {
    const state = createDefaultState();
    const file = sharedFile();
    const result = applyDataImport(state, { file, keys: ["0"], destination: { kind: "new", workspace: "github" } });
    expect(result).toMatchObject({ added: 0, skipped: 2 });
    file.groups[0].payload.sites = [{ name: "Repo", url: "https://github.com/example/new-repo", order: 0 }];
    const routed = applyDataImport(state, { file, keys: ["0"], destination: { kind: "existing", groupId: "search" } });
    const added = routed.state.sites.find(site => site.name === "Repo")!;
    expect(routed.state.groups.find(group => group.id === added.groupId)?.workspace).toBe("github");
  });
  it("rejects an entire collection if any nested package is invalid", () => {
    const bundle = { format: "site-hub-groups-export", exportVersion: 1, groups: [{ workspace: "main", payload: sharedFile().groups[0].payload }, { workspace: "main", payload: {} }] };
    expect(() => parseTransferFile(JSON.stringify(bundle))).toThrow();
    expect(() => parseTransferFile("null")).toThrow();
    expect(() => applyDataImport(createDefaultState(), { file: sharedFile(), keys: [], destination: { kind: "new" } })).toThrow("至少选择");
  });
  it("preserves the workspace of an empty single-group export and reads it in legacy format", () => {
    const state = createDefaultState();
    const group = state.groups.find(item => item.workspace === "github")!;
    state.sites = state.sites.filter(site => site.groupId !== group.id);
    const exported = createSelectedGroupsExport(state, [group.id]);
    const file = parseTransferFile(JSON.stringify(exported));
    expect(file.groups[0].workspace).toBe("github");
    expect(file.groups[0].payload.format).toBe("site-hub-group-export");
  });

  it("round-trips a full backup and restores the original mixed order and site ownership", () => {
    const source = hierarchySource();
    const file = parseTransferFile(serializeExport(source));
    const imported = applyDataImport(createDefaultState(), { file, keys: [], destination: { kind: "replace" } });
    expect(imported).toMatchObject({ added: 3, skipped: 0, created: 0 });
    expect(imported.state.groups).toEqual(source.groups);
    expect(imported.state.sites).toEqual(source.sites);
    expect(entries(imported.state, "design")).toEqual(["A", "灵感", "B", "空目录"]);
    expect(getSitesInGroup(imported.state.sites, "inspiration")).toMatchObject([{ name: "C", note: "C note" }]);
  });

  it("exports a parent and selected child once and recreates mixed order with fresh group and site IDs", () => {
    const source = hierarchySource();
    const target = addGroupToState(createDefaultState(), "灵感", "folder", "inspiration", undefined, undefined, "main", "design");
    const before = JSON.stringify(target);
    const portable = createSelectedGroupsExport(source, ["design", "inspiration"]);
    expect(portable).toMatchObject({ exportVersion: 2, entryOrder: [
      { kind: "site", index: 0 }, { kind: "folder", index: 0 }, { kind: "site", index: 1 }, { kind: "folder", index: 1 },
    ] });
    expect(JSON.stringify(portable)).not.toContain('"parentId"');
    expect(JSON.stringify(portable)).not.toContain('"id"');
    const file = parseTransferFile(JSON.stringify(portable));
    expect(file.groups.map(group => group.label)).toEqual(["设计", "设计 / 灵感", "设计 / 空目录"]);
    expect(getTransferGroupCounts(file.groups[0].payload)).toEqual({ groups: 3, sites: 3 });
    const imported = applyDataImport(target, { file, keys: file.groups.map(group => group.key), destination: { kind: "new" } });
    expect(imported).toMatchObject({ added: 3, skipped: 0, created: 3 });
    const root = imported.state.groups.find(group => group.name === "设计 (2)")!;
    const child = imported.state.groups.find(group => group.name === "灵感 (2)")!;
    expect(child).toMatchObject({ parentId: root.id, workspace: "main" });
    expect(child.id).not.toBe("inspiration");
    expect(entries(imported.state, root.id)).toEqual(["A", "灵感 (2)", "B", "空目录"]);
    expect(getSitesInGroup(imported.state.sites, child.id)).toMatchObject([{ name: "C", note: "C note", clickCount: 0 }]);
    expect(JSON.stringify(target)).toBe(before);
  });

  it("imports an independently selected child or child-only package as a root", () => {
    const source = hierarchySource();
    const packages = [
      { file: parseTransferFile(serializeExport(source)), key: "inspiration" },
      { file: parseTransferFile(JSON.stringify(createSelectedGroupsExport(source, ["design"]))), key: "0/0" },
      { file: parseTransferFile(JSON.stringify(createSelectedGroupsExport(source, ["inspiration"]))), key: "0" },
    ];
    for (const { file, key } of packages) {
      const imported = applyDataImport(createDefaultState(), { file, keys: [key], destination: { kind: "new" } });
      const root = imported.state.groups.find(group => group.name === "灵感")!;
      expect(imported).toMatchObject({ added: 1, skipped: 0, created: 1 });
      expect(root.parentId).toBeUndefined();
      expect(getSitesInGroup(imported.state.sites, root.id).map(site => site.name)).toEqual(["C"]);
    }
  });

  it("appends imported entries to an existing root without overwriting its mixed sequence", () => {
    const source = hierarchySource();
    const target = addGroupToState(createDefaultState(), "原有目录", "folder", "existing-folder", undefined, undefined, "main", "design");
    const direct = getSitesInGroup(target.sites, "design");
    const arranged = commitGroupEntriesToState(target, "design", [`site:${direct[0].id}`, "folder:existing-folder", `site:${direct[1].id}`]);
    const file = parseTransferFile(JSON.stringify(createSelectedGroupsExport(source, ["design"])));
    const imported = applyDataImport(arranged, { file, keys: ["0"], destination: { kind: "existing", groupId: "design" } });
    expect(imported).toMatchObject({ added: 3, skipped: 0, created: 2 });
    expect(entries(imported.state, "design")).toEqual(["Figma", "原有目录", "Dribbble", "A", "灵感", "B", "空目录"]);
  });

  it("flattens a parent package into an existing protected group or child without losing links", () => {
    const source = hierarchySource();
    const file = parseTransferFile(JSON.stringify(createSelectedGroupsExport(source, ["design"])));
    const target = addGroupToState(createDefaultState(), "接收目录", "folder", "destination-child", undefined, undefined, "main", "design");
    const protectedId = target.groups.find(group => group.isProtected && group.workspace === "main")!.id;
    for (const groupId of [protectedId, "destination-child"]) {
      const imported = applyDataImport(target, { file, keys: ["0"], destination: { kind: "existing", groupId } });
      expect(imported).toMatchObject({ added: 3, skipped: 0, created: 0 });
      expect(getSitesInGroup(imported.state.sites, groupId).slice(-3).map(site => site.name)).toEqual(["A", "C", "B"]);
      expect(imported.state.groups).toEqual(target.groups);
    }
  });

  it("applies GitHub routing to every level and skips incompatible targets with clean mixed references", () => {
    const source = hierarchySource();
    const portable = createGroupExportPayload(source, "design");
    portable.sites[0].url = "https://github.com/example/unique-root";
    if (portable.exportVersion !== 2) throw new Error("Expected hierarchical package");
    portable.children[0].sites[0].url = "https://github.com/example/unique-child";
    const file = parseTransferFile(JSON.stringify(portable));
    const main = applyDataImport(createDefaultState(), { file, keys: ["0"], destination: { kind: "new" } });
    const root = main.state.groups.find(group => group.name === "设计 (2)")!;
    expect(main).toMatchObject({ added: 3, skipped: 0, created: 3 });
    expect(main.state.sites.filter(site => ["A", "C"].includes(site.name)).map(site => site.groupId)).toEqual(["github-other", "github-other"]);
    expect(entries(main.state, root.id)).toEqual(["灵感", "B", "空目录"]);

    const github = applyDataImport(createDefaultState(), { file, keys: ["0"], destination: { kind: "new", workspace: "github" } });
    const githubRoot = github.state.groups.find(group => group.workspace === "github" && group.name === "设计")!;
    expect(github).toMatchObject({ added: 2, skipped: 1, created: 3 });
    expect(entries(github.state, githubRoot.id)).toEqual(["A", "灵感", "空目录"]);
    const child = github.state.groups.find(group => group.parentId === githubRoot.id && group.name === "灵感")!;
    expect(child).toMatchObject({ workspace: "github" });
    expect(child.githubImportSource).toBeUndefined();
    expect(getSitesInGroup(github.state.sites, child.id).map(site => site.name)).toEqual(["C"]);
  });
});
