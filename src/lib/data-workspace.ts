import type { SiteCollectionState, SiteWorkspace } from "../types";
import { createGroupExportPayload, parseGroupImportFile, parseImportFile, type GroupExportPayload } from "./data-transfer";
import { getGroupWorkspace, isGithubHomeUrl, isGithubUrl, normalizeWorkspaceGroupOrder, routeGithubSitesInState } from "./github-workspace";
import { mergeGroupImportIntoState } from "./site-state";

export interface TransferGroup {
  key: string;
  workspace: SiteWorkspace;
  payload: GroupExportPayload;
}
export interface TransferFile {
  groups: TransferGroup[];
  backup?: SiteCollectionState;
}
export type ImportDestination = { kind: "new"; name?: string; workspace?: SiteWorkspace }
  | { kind: "existing"; groupId: string } | { kind: "replace" };
export interface ImportRequest { file: TransferFile; keys: string[]; destination: ImportDestination }

export function collectionTransferGroups(state: SiteCollectionState): TransferGroup[] {
  return state.groups.slice().sort((a, b) => a.order - b.order).map(group => ({
    key: group.id, workspace: getGroupWorkspace(group), payload: createGroupExportPayload(state, group.id),
  }));
}

export function parseTransferFile(text: string): TransferFile {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error("文件不是有效的 JSON 格式"); }
  if (raw?.format === "site-hub-group-export") {
    const payload = parseGroupImportFile(text);
    const workspace = raw.workspace === "main" || raw.workspace === "github" ? raw.workspace
      : payload.sites.length > 0 && payload.sites.every(site => isGithubUrl(site.url) && !isGithubHomeUrl(site.url)) ? "github" : "main";
    return { groups: [{ key: "0", workspace, payload }] };
  }
  if (raw?.format === "site-hub-groups-export") {
    if (raw.exportVersion !== 1 || !Array.isArray(raw.groups) || !raw.groups.length) throw new Error("分组集合格式或版本不受支持");
    return { groups: raw.groups.map((entry: { workspace?: unknown; payload?: unknown }, index: number) => {
      if (!entry || (entry.workspace !== "main" && entry.workspace !== "github")) throw new Error("分组工作区无效");
      return { key: String(index), workspace: entry.workspace, payload: parseGroupImportFile(JSON.stringify(entry.payload)) };
    }) };
  }
  const backup = parseImportFile(text);
  return { backup, groups: collectionTransferGroups(backup) };
}

export function createSelectedGroupsExport(state: SiteCollectionState, ids: string[]) {
  const groups = collectionTransferGroups(state).filter(group => ids.includes(group.key));
  if (!groups.length) throw new Error("请至少选择一个分组");
  if (groups.length === 1) return { ...groups[0].payload, workspace: groups[0].workspace };
  return { format: "site-hub-groups-export", exportVersion: 1, exportedAt: new Date().toISOString(),
    groups: groups.map(({ workspace, payload }) => ({ workspace, payload })) };
}

/** One transaction, shared by preview and commit. Never mutates the supplied snapshot. */
export function applyDataImport(state: SiteCollectionState, request: ImportRequest) {
  const { file, keys, destination } = request;
  if (destination.kind === "replace") {
    if (!file.backup) throw new Error("只有整库备份可以替换全局数据");
    const next = routeGithubSitesInState(file.backup).state;
    return { state: { ...next, searchHistory: state.searchHistory, deletedSites: state.deletedSites, trashRetentionDays: state.trashRetentionDays }, added: next.sites.length, skipped: 0, created: 0 };
  }
  const selected = file.groups.filter(group => keys.includes(group.key));
  if (!selected.length) throw new Error("请至少选择一个来源分组");
  if (destination.kind === "existing" && !state.groups.some(group => group.id === destination.groupId)) throw new Error("目标分组已不存在，请重新选择");
  let next = state;
  let added = 0, skipped = 0, created = 0;
  for (const source of selected) {
    let targetId: string;
    if (destination.kind === "existing") targetId = destination.groupId;
    else {
      const workspace = destination.workspace ?? source.workspace;
      const base = (selected.length === 1 ? destination.name?.trim() : undefined) || source.payload.group.name;
      let name = base, suffix = 2;
      while (next.groups.some(group => getGroupWorkspace(group) === workspace && group.name === name)) name = `${base} (${suffix++})`;
      targetId = crypto.randomUUID();
      next = { ...next, groups: normalizeWorkspaceGroupOrder([...next.groups, {
        id: targetId, name, icon: source.payload.group.icon, workspace, order: next.groups.length, isProtected: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }]) };
      created++;
    }
    const result = mergeGroupImportIntoState(next, targetId, source.payload);
    next = result.state;
    added += result.added;
    skipped += result.skipped;
  }
  return { state: next, added, skipped, created };
}
