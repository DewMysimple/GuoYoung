import { describe, expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import { createGroupExportPayload, serializeExport } from "./data-transfer";
import { applyDataImport, createSelectedGroupsExport, parseTransferFile } from "./data-workspace";

function sharedFile() {
  const payload = createGroupExportPayload(createDefaultState(), "design");
  payload.sites = [{ name: "New", url: "https://shared.example/", order: 0 }, { name: "Duplicate", url: "https://www.google.com/", order: 1 }];
  return parseTransferFile(JSON.stringify(payload));
}
describe("data workspace transactions", () => {
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
});
