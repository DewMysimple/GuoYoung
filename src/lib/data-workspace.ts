import type { CollectionEntryId, SiteCollectionState, SiteWorkspace } from "../types";
import {
  createGroupExportPayload, normalizePortableOrder, parseGroupImportFile, parseImportFile,
  SITE_HUB_GROUP_EXPORT_FORMAT, SITE_HUB_GROUP_EXPORT_VERSION, SITE_HUB_HIERARCHICAL_GROUP_EXPORT_VERSION,
  type GroupExportPayload, type GroupExportSite, type PortableGroup,
} from "./data-transfer";
import { getGroupWorkspace, isGithubHomeUrl, isGithubUrl, routeGithubSitesInState } from "./github-workspace";
import { canParentGroup, commitGroupEntriesToState, folderEntryId, getGroupEntries, getGroupPath, getGroupsInTreeOrder, normalizeCollectionHierarchy, siteEntryId } from "./group-hierarchy";
import { addGroupToState, mergeGroupImportIntoState } from "./site-state";
import { comparableSiteUrl, getSitesInGroup } from "./site-utils";

export interface TransferGroup {
  key: string;
  parentKey?: string;
  label: string;
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
  const groups = getGroupsInTreeOrder(state.groups.slice().sort((a, b) => a.order - b.order));
  return groups.map(group => ({
    key: group.id, parentKey: group.parentId, label: getGroupPath(groups, group.id),
    workspace: getGroupWorkspace(group), payload: createGroupExportPayload(state, group.id),
  }));
}

function unpackTransferGroup(payload: GroupExportPayload, workspace: SiteWorkspace, key: string): TransferGroup[] {
  const root = { key, workspace, label: payload.group.name, payload };
  if (payload.exportVersion !== SITE_HUB_HIERARCHICAL_GROUP_EXPORT_VERSION) return [root];
  return [root, ...payload.children.map((child, index): TransferGroup => ({
    key: `${key}/${index}`,
    parentKey: key,
    workspace,
    label: `${payload.group.name} / ${child.group.name}`,
    payload: { ...child, format: SITE_HUB_GROUP_EXPORT_FORMAT, exportVersion: SITE_HUB_GROUP_EXPORT_VERSION, exportedAt: payload.exportedAt, workspace },
  }))];
}

export function getTransferGroupCounts(payload: GroupExportPayload) {
  const children = payload.exportVersion === SITE_HUB_HIERARCHICAL_GROUP_EXPORT_VERSION ? payload.children : [];
  return { groups: 1 + children.length, sites: payload.sites.length + children.reduce((sum, child) => sum + child.sites.length, 0) };
}

export function getTransferSelection(groups: TransferGroup[], ids: string[]): TransferGroup[] {
  const selected = new Set(ids);
  // A selected parent always carries its entire subtree. Exclude a separately
  // selected child so it is neither exported nor imported a second time.
  return groups.filter(group => selected.has(group.key) && !(group.parentKey && selected.has(group.parentKey)));
}

export function parseTransferFile(text: string): TransferFile {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error("文件不是有效的 JSON 格式"); }
  if (raw?.format === SITE_HUB_GROUP_EXPORT_FORMAT) {
    const payload = parseGroupImportFile(text);
    const sites = payload.exportVersion === SITE_HUB_HIERARCHICAL_GROUP_EXPORT_VERSION
      ? [...payload.sites, ...payload.children.flatMap(child => child.sites)] : payload.sites;
    const workspace = payload.workspace ?? (sites.length > 0 && sites.every(site => isGithubUrl(site.url) && !isGithubHomeUrl(site.url)) ? "github" : "main");
    return { groups: unpackTransferGroup(payload, workspace, "0") };
  }
  if (raw?.format === "site-hub-groups-export") {
    if (raw.exportVersion !== 1 || !Array.isArray(raw.groups) || !raw.groups.length) throw new Error("分组集合格式或版本不受支持");
    return { groups: raw.groups.flatMap((entry: { workspace?: unknown; payload?: unknown }, index: number) => {
      if (!entry || (entry.workspace !== "main" && entry.workspace !== "github")) throw new Error("分组工作区无效");
      return unpackTransferGroup(parseGroupImportFile(JSON.stringify(entry.payload)), entry.workspace, String(index));
    }) };
  }
  const backup = parseImportFile(text);
  return { backup, groups: collectionTransferGroups(backup) };
}

export function createSelectedGroupsExport(state: SiteCollectionState, ids: string[]) {
  const groups = getTransferSelection(collectionTransferGroups(state), ids);
  if (!groups.length) throw new Error("请至少选择一个分组");
  if (groups.length === 1) return { ...groups[0].payload, workspace: groups[0].workspace };
  return { format: "site-hub-groups-export", exportVersion: 1, exportedAt: new Date().toISOString(),
    groups: groups.map(({ workspace, payload }) => ({ workspace, payload })) };
}

function createImportedGroup(state: SiteCollectionState, source: PortableGroup, workspace: SiteWorkspace, parentId?: string, base = source.group.name) {
  const names = new Set(state.groups.filter(group => getGroupWorkspace(group) === workspace).map(group => group.name));
  let name = base;
  for (let suffix = 2; names.has(name); suffix++) name = `${base} (${suffix})`;
  const id = crypto.randomUUID();
  return { id, state: addGroupToState(state, name, source.group.icon, id, undefined, undefined, workspace, parentId) };
}

export function importGroupPackage(state: SiteCollectionState, targetId: string, payload: GroupExportPayload) {
  const target = state.groups.find(group => group.id === targetId);
  if (!target) return { state, added: 0, skipped: getTransferGroupCounts(payload).sites, created: 0 };
  const workspace = getGroupWorkspace(target);
  if (payload.exportVersion !== SITE_HUB_HIERARCHICAL_GROUP_EXPORT_VERSION || !payload.children.length) {
    return { ...mergeGroupImportIntoState(state, targetId, payload), created: 0 };
  }

  const entryOrder = normalizePortableOrder(payload.entryOrder, payload.sites.length, payload.children.length);
  if (!canParentGroup(target, workspace)) {
    // A child or special target cannot contain folders. Append its portable
    // links to the selected group in the order the folder contents were shown.
    const sites = entryOrder.flatMap(({ kind, index }) => kind === "site" ? [payload.sites[index]] : payload.children[index].sites)
      .map((site, order): GroupExportSite => ({ ...site, order }));
    return { ...mergeGroupImportIntoState(state, targetId, { sites }), created: 0 };
  }

  const priorOrder = getGroupEntries(target, state.groups, getSitesInGroup(state.sites, targetId), "manual").map(entry => entry.id);
  const rootImport = mergeGroupImportIntoState(state, targetId, payload);
  let next = rootImport.state;
  let { added, skipped } = rootImport;
  // Existing URLs are skipped by the merge. Only newly created direct sites
  // belong in the appended sequence, including when GitHub routes links away.
  const previousIds = new Set(state.sites.map(site => site.id));
  const directIds = new Map(next.sites.filter(site => site.groupId === targetId && !previousIds.has(site.id))
    .map(site => [comparableSiteUrl(site.url), siteEntryId(site.id)]));
  const siteIds = payload.sites.map(site => directIds.get(comparableSiteUrl(site.url)));
  const folderIds: CollectionEntryId[] = [];
  for (const child of payload.children) {
    const created = createImportedGroup(next, child, workspace, targetId);
    folderIds.push(folderEntryId(created.id));
    const result = mergeGroupImportIntoState(created.state, created.id, child);
    next = result.state;
    added += result.added;
    skipped += result.skipped;
  }
  const appendedIds = new Set<CollectionEntryId>();
  for (const { kind, index } of entryOrder) {
    const id = kind === "site" ? siteIds[index] : folderIds[index];
    if (id) appendedIds.add(id);
  }
  next = commitGroupEntriesToState(next, targetId, [...priorOrder, ...appendedIds]);
  return { state: next, added, skipped, created: folderIds.length };
}

/** One transaction, shared by preview and commit. Never mutates the supplied snapshot. */
export function applyDataImport(state: SiteCollectionState, request: ImportRequest) {
  const { file, keys, destination } = request;
  if (destination.kind === "replace") {
    if (!file.backup) throw new Error("只有整库备份可以替换全局数据");
    const next = normalizeCollectionHierarchy(routeGithubSitesInState(file.backup).state);
    return { state: { ...next, searchHistory: state.searchHistory, deletedSites: state.deletedSites, trashRetentionDays: state.trashRetentionDays }, added: next.sites.length, skipped: 0, created: 0 };
  }
  const selected = getTransferSelection(file.groups, keys);
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
      const target = createImportedGroup(next, source.payload, workspace, undefined, base);
      targetId = target.id;
      next = target.state;
      created++;
    }
    const result = importGroupPackage(next, targetId, source.payload);
    next = result.state;
    added += result.added;
    skipped += result.skipped;
    created += result.created;
  }
  return { state: next, added, skipped, created };
}
