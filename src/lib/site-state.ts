import type {
  CategoryIcon,
  GithubImportSource,
  SiteCollectionState,
  SiteFormValues,
  SiteGroup,
  SiteItem,
  SiteWorkspace,
  TrashRetentionDays,
} from "../types";
import type {
  GithubOwnerProfile,
  GithubRepositorySummary,
} from "./github-repository-api";
import { GITHUB_OTHER_GROUP_ID, OTHER_GROUP_ID } from "../data/defaults";
import type { GroupExportPayload } from "./data-transfer";
import {
  getGithubOtherGroupId,
  getGroupWorkspace,
  normalizeWorkspaceGroupOrder,
  isGithubHomeUrl,
  isGithubUrl,
} from "./github-workspace";
import { comparableSiteUrl, normalizeUrl, reindexSites } from "./site-utils";
import { normalizeSiteNote } from "./site-notes";
import {
  canParentGroup,
  getChildGroups,
  getGroupSubtreeIds,
  normalizeCollectionHierarchy,
} from "./group-hierarchy";

export type SavedSiteValues = SiteFormValues & {
  url: string;
  customIconUrl?: string;
};

export interface GroupImportResult {
  state: SiteCollectionState;
  added: number;
  skipped: number;
}

export interface GithubRepositoryImportResult {
  state: SiteCollectionState;
  group?: SiteGroup;
  added: number;
  addedRepositories: GithubRepositorySummary[];
  skipped: number;
  skippedActive: number;
  skippedDeleted: number;
}

export interface GithubRepositoryImportDetail {
  owner: GithubOwnerProfile;
  addedRepositories: GithubRepositorySummary[];
  skipped: number;
  skippedActive: number;
  skippedDeleted: number;
}

export interface GithubRepositoryBatchImport {
  owner: GithubOwnerProfile;
  repositories: GithubRepositorySummary[];
}

export interface GithubRepositoryBatchImportResult {
  state: SiteCollectionState;
  refreshedOwners: number;
  added: number;
  skipped: number;
  skippedActive: number;
  skippedDeleted: number;
  details: GithubRepositoryImportDetail[];
}

export type GithubRepositoryStatus = "new" | "active" | "deleted";

export function getGithubRepositoryStatuses(
  state: SiteCollectionState,
  repositories: GithubRepositorySummary[],
): Map<number, GithubRepositoryStatus> {
  const active = new Set(state.sites.map((site) => comparableSiteUrl(site.url)));
  const deleted = new Set(state.deletedSites.map((entry) => comparableSiteUrl(entry.site.url)));
  return new Map(repositories.map((repository) => {
    let key: string;
    try {
      key = comparableSiteUrl(normalizeUrl(repository.htmlUrl));
    } catch {
      return [repository.id, "deleted"];
    }
    return [repository.id, active.has(key) ? "active" : deleted.has(key) ? "deleted" : "new"];
  }));
}

function githubSourceForOwner(
  owner: GithubOwnerProfile,
  lastFetchedAt: string,
): GithubImportSource {
  return {
    login: owner.login,
    profileUrl: owner.profileUrl,
    entityType: owner.entityType,
    lastFetchedAt,
  };
}

function githubGroupNameMatches(group: SiteGroup, login: string): boolean {
  return (
    getGroupWorkspace(group) === "github" &&
    group.name.trim().toLocaleLowerCase("en-US") === login.toLocaleLowerCase("en-US")
  );
}

function nextGithubGroupName(state: SiteCollectionState, login: string): string {
  const names = new Set(
    state.groups
      .filter((group) => getGroupWorkspace(group) === "github")
      .map((group) => group.name.trim().toLocaleLowerCase("en-US")),
  );
  if (!names.has(login.toLocaleLowerCase("en-US"))) return login;
  let suffix = 2;
  while (names.has(`${login}-${suffix}`.toLocaleLowerCase("en-US"))) suffix += 1;
  return `${login}-${suffix}`;
}

function findGithubImportGroup(
  state: SiteCollectionState,
  owner: GithubOwnerProfile,
): SiteGroup | undefined {
  const sourceGroup = state.groups.find(
    (group) =>
      getGroupWorkspace(group) === "github" &&
      !group.parentId &&
      !group.isProtected &&
      group.githubImportSource?.login.toLocaleLowerCase("en-US") ===
        owner.login.toLocaleLowerCase("en-US"),
  );
  if (sourceGroup) return sourceGroup;
  return state.groups.find((group) =>
    githubGroupNameMatches(group, owner.login) && !group.parentId && !group.isProtected &&
    !group.githubImportSource && !state.groups.some((child) => child.parentId === group.id));
}

export function importGithubRepositoriesToState(
  state: SiteCollectionState,
  owner: GithubOwnerProfile,
  repositories: GithubRepositorySummary[],
  selectedRepositoryIds: Set<number> | undefined = undefined,
  now = new Date().toISOString(),
): GithubRepositoryImportResult {
  const selected = repositories.filter(
    (repository) =>
      !selectedRepositoryIds || selectedRepositoryIds.has(repository.id),
  );
  const existingUrls = new Set(
    state.sites
      .map((site) => comparableSiteUrl(site.url))
      .concat(
        state.deletedSites.map((entry) => comparableSiteUrl(entry.site.url)),
      ),
  );
  const activeUrls = new Set(
    state.sites.map((site) => comparableSiteUrl(site.url)),
  );
  const deletedUrls = new Set(
    state.deletedSites.map((entry) => comparableSiteUrl(entry.site.url)),
  );
  let skippedActive = 0;
  let skippedDeleted = 0;
  let skipped = 0;
  const candidates = selected.filter((repository) => {
    let key: string;
    try {
      const normalizedUrl = normalizeUrl(repository.htmlUrl);
      if (
        !repository.name.trim() ||
        !isGithubUrl(normalizedUrl) ||
        isGithubHomeUrl(normalizedUrl)
      ) {
        skipped += 1;
        return false;
      }
      key = comparableSiteUrl(normalizedUrl);
    } catch {
      skipped += 1;
      return false;
    }
    if (existingUrls.has(key)) {
      skipped += 1;
      if (activeUrls.has(key)) skippedActive += 1;
      else if (deletedUrls.has(key)) skippedDeleted += 1;
      return false;
    }
    existingUrls.add(key);
    return true;
  });

  const existingGroup = findGithubImportGroup(state, owner);
  if (!existingGroup && candidates.length === 0) {
    return {
      state,
      added: 0,
      addedRepositories: [],
      skipped,
      skippedActive,
      skippedDeleted,
    };
  }

  let nextState = state;
  let targetGroup = existingGroup;
  if (!targetGroup) {
    const groupName = nextGithubGroupName(state, owner.login);
    const id = crypto.randomUUID();
    nextState = addGroupToState(
      state,
      groupName,
      "user-circle",
      id,
      now,
      undefined,
      "github",
    );
    targetGroup = nextState.groups.find((group) => group.id === id);
  }
  if (!targetGroup) {
    return {
      state,
      added: 0,
      addedRepositories: [],
      skipped,
      skippedActive,
      skippedDeleted,
    };
  }

  const source = githubSourceForOwner(owner, now);
  const groups = nextState.groups.map((group) =>
    group.id === targetGroup!.id
      ? { ...group, githubImportSource: source, updatedAt: now }
      : group,
  );
  const order = nextState.sites.filter((site) => site.groupId === targetGroup!.id).length;
  const imported = candidates.map((repository, index) => ({
    id: crypto.randomUUID(),
    name: repository.name.trim(),
    url: normalizeUrl(repository.htmlUrl),
    groupId: targetGroup!.id,
    iconSource: "auto" as const,
    order: order + index,
    globalOrder: nextState.sites.length + index,
    clickCount: 0,
    createdAt: now,
    updatedAt: now,
  }));
  const finalState = normalizeCollectionHierarchy({
    ...nextState,
    groups,
    sites: reindexSites([...nextState.sites.map((site) => ({ ...site })), ...imported]),
  });
  return {
    state: finalState,
    group: finalState.groups.find((group) => group.id === targetGroup!.id),
    added: imported.length,
    addedRepositories: candidates,
    skipped,
    skippedActive,
    skippedDeleted,
  };
}

export function importGithubRepositoryBatchToState(
  state: SiteCollectionState,
  imports: GithubRepositoryBatchImport[],
  now = new Date().toISOString(),
): GithubRepositoryBatchImportResult {
  let nextState = state;
  let added = 0;
  let skipped = 0;
  let skippedActive = 0;
  let skippedDeleted = 0;
  const details: GithubRepositoryImportDetail[] = [];

  for (const input of imports) {
    const result = importGithubRepositoriesToState(
      nextState,
      input.owner,
      input.repositories,
      undefined,
      now,
    );
    nextState = result.state;
    added += result.added;
    skipped += result.skipped;
    skippedActive += result.skippedActive;
    skippedDeleted += result.skippedDeleted;
    details.push({
      owner: input.owner,
      addedRepositories: result.addedRepositories,
      skipped: result.skipped,
      skippedActive: result.skippedActive,
      skippedDeleted: result.skippedDeleted,
    });
  }

  return {
    state: nextState,
    refreshedOwners: imports.length,
    added,
    skipped,
    skippedActive,
    skippedDeleted,
    details,
  };
}

function resolveSiteGroupId(
  state: SiteCollectionState,
  groupId: string,
  url: string,
): string {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) throw new Error("所选分组不存在");
  const workspace = getGroupWorkspace(group);
  if (workspace === "github") {
    if (!isGithubUrl(url)) {
      throw new Error("GitHub 页面只允许添加 github.com 及其子域名");
    }
    if (isGithubHomeUrl(url)) {
      throw new Error("GitHub 官方主页请通过顶部入口管理");
    }
    return group.id;
  }
  return isGithubUrl(url) && !isGithubHomeUrl(url)
    ? getGithubOtherGroupId(state)
    : group.id;
}

export function addSiteToState(
  state: SiteCollectionState,
  values: SavedSiteValues,
  id: string = crypto.randomUUID(),
  now = new Date().toISOString(),
): SiteCollectionState {
  const groupId = resolveSiteGroupId(state, values.groupId, values.url);
  const site: SiteItem = {
    id,
    name: values.name.trim(),
    note: normalizeSiteNote(values.note),
    url: values.url,
    groupId,
    customIconUrl: values.customIconUrl || undefined,
    iconSource: values.iconSource,
    order: state.sites.filter((item) => item.groupId === groupId).length,
    globalOrder: state.sites.length,
    clickCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  return normalizeCollectionHierarchy({ ...state, sites: [...state.sites, site] });
}

export function mergeGroupImportIntoState(
  state: SiteCollectionState,
  targetGroupId: string,
  payload: Pick<GroupExportPayload, "sites">,
  now = new Date().toISOString(),
): GroupImportResult {
  if (!state.groups.some((group) => group.id === targetGroupId)) {
    return { state, added: 0, skipped: payload.sites.length };
  }

  const existingUrls = new Set(
    state.sites.map((site) => comparableSiteUrl(site.url)),
  );
  const targetGroup = state.groups.find((group) => group.id === targetGroupId);
  if (!targetGroup) return { state, added: 0, skipped: payload.sites.length };
  const targetWorkspace = getGroupWorkspace(targetGroup);
  const orders = new Map<string, number>();
  state.groups.forEach((group) => {
    orders.set(
      group.id,
      state.sites.filter((site) => site.groupId === group.id).length,
    );
  });
  let nextGlobalOrder = state.sites.length;
  let added = 0;
  let skipped = 0;
  const imported: SiteItem[] = [];

  for (const entry of payload.sites.slice().sort((a, b) => a.order - b.order)) {
    const isGithubEntry = isGithubUrl(entry.url);
    if (
      targetWorkspace === "github" &&
      (!isGithubEntry || isGithubHomeUrl(entry.url))
    ) {
      skipped += 1;
      continue;
    }
    const groupId =
      targetWorkspace === "main" && isGithubEntry && !isGithubHomeUrl(entry.url)
        ? getGithubOtherGroupId(state)
        : targetGroupId;
    const key = comparableSiteUrl(entry.url);
    if (existingUrls.has(key)) {
      skipped += 1;
      continue;
    }
    existingUrls.add(key);
    imported.push({
      id: crypto.randomUUID(),
      name: entry.name.trim(),
      note: normalizeSiteNote(entry.note),
      url: entry.url,
      groupId,
      ...(entry.customIconUrl ? { customIconUrl: entry.customIconUrl } : {}),
      ...(entry.iconSource ? { iconSource: entry.iconSource } : {}),
      order: orders.get(groupId) ?? 0,
      globalOrder: nextGlobalOrder++,
      clickCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    orders.set(groupId, (orders.get(groupId) ?? 0) + 1);
    added += 1;
  }

  if (!imported.length) return { state, added, skipped };
  return {
    state: normalizeCollectionHierarchy({
      ...state,
      sites: reindexSites([
        ...state.sites.map((site) => ({ ...site })),
        ...imported,
      ]),
    }),
    added,
    skipped,
  };
}

export function updateSiteInState(
  state: SiteCollectionState,
  id: string,
  values: SavedSiteValues,
  now = new Date().toISOString(),
): SiteCollectionState {
  const target = state.sites.find((site) => site.id === id);
  if (!target) return state;
  const groupId = resolveSiteGroupId(state, values.groupId, values.url);
  const moved = target.groupId !== groupId;
  const sites = state.sites.map((site) =>
    site.id === id
      ? {
          ...site,
          name: values.name.trim(),
          note: values.note === undefined ? site.note : normalizeSiteNote(values.note),
          url: values.url,
          groupId,
          customIconUrl: values.customIconUrl || undefined,
          iconSource: values.iconSource,
          updatedAt: now,
          order: moved
            ? state.sites.filter(
                (candidate) => candidate.groupId === groupId,
              ).length
            : site.order,
        }
      : { ...site },
  );
  return normalizeCollectionHierarchy({ ...state, sites: reindexSites(sites) });
}

export function canMoveSiteToGroup(site: Pick<SiteItem, "url">, group: SiteGroup): boolean {
  const github = isGithubUrl(site.url) && !isGithubHomeUrl(site.url);
  return getGroupWorkspace(group) === (github ? "github" : "main");
}

export function moveSitesToGroupInState(
  state: SiteCollectionState,
  ids: readonly string[],
  targetGroupId: string,
  now = new Date().toISOString(),
): SiteCollectionState {
  const target = state.groups.find((group) => group.id === targetGroupId);
  if (!target) return state;
  const byId = new Map(state.sites.map((site) => [site.id, site]));
  const selected = [...new Set(ids)].map((id) => byId.get(id));
  // A target change or mixed, incompatible selection must not move a subset.
  if (selected.some((site) => !site || !canMoveSiteToGroup(site, target))) return state;
  const moved = selected.filter((site): site is SiteItem => Boolean(site && site.groupId !== targetGroupId));
  if (!moved.length) return state;
  const destination = state.sites.filter((site) => site.groupId === targetGroupId).sort((a, b) => a.order - b.order);
  const movedIds = new Set(moved.map((site) => site.id));
  const affected = new Map<string, SiteItem>();
  const sourceIds = new Set(moved.map((site) => site.groupId));
  for (const sourceId of sourceIds) {
    state.sites.filter((site) => site.groupId === sourceId && !movedIds.has(site.id))
      .sort((a, b) => a.order - b.order)
      .forEach((site, order) => affected.set(site.id, { ...site, order }));
  }
  [...destination, ...moved.map((site) => ({ ...site, groupId: targetGroupId, updatedAt: now }))]
    .forEach((site, order) => affected.set(site.id, { ...site, order }));
  return normalizeCollectionHierarchy({
    ...state,
    sites: state.sites.map((site) => affected.get(site.id) ?? site),
  });
}

export function addGroupToState(
  state: SiteCollectionState,
  name: string,
  icon: CategoryIcon,
  id: string = crypto.randomUUID(),
  now = new Date().toISOString(),
  beforeGroupId?: string,
  workspace: SiteWorkspace = "main",
  parentId?: string,
): SiteCollectionState {
  if (!name.trim() || state.groups.some((group) => group.id === id)) return state;
  if (parentId !== undefined && !canParentGroup(state.groups.find((group) => group.id === parentId), workspace)) {
    return state;
  }
  const ordinaryGroups = state.groups
    .filter(
      (item) =>
        !item.isProtected && getGroupWorkspace(item) === workspace && item.parentId === parentId,
    )
    .sort((a, b) => a.order - b.order);
  const insertionIndex = beforeGroupId
    ? ordinaryGroups.findIndex((item) => item.id === beforeGroupId)
    : -1;
  const group: SiteGroup = {
    id,
    name: name.trim(),
    icon,
    isProtected: false,
    workspace,
    order: insertionIndex >= 0 ? insertionIndex - 0.5 : ordinaryGroups.length,
    createdAt: now,
    updatedAt: now,
    ...(parentId === undefined ? {} : { parentId }),
  };
  return normalizeCollectionHierarchy({
    ...state,
    groups: normalizeWorkspaceGroupOrder([...state.groups, group]),
  });
}

export function updateGroupInState(
  state: SiteCollectionState,
  id: string,
  name: string,
  icon: CategoryIcon,
  parentId?: string | null,
  now = new Date().toISOString(),
): SiteCollectionState {
  const group = state.groups.find((candidate) => candidate.id === id);
  const trimmed = name.trim();
  if (!group || group.isProtected || !trimmed) return state;

  const nextParentId = parentId === undefined ? group.parentId : parentId ?? undefined;
  const reparenting = nextParentId !== group.parentId;
  const workspace = getGroupWorkspace(group);
  if (reparenting && nextParentId !== undefined && (
    nextParentId === id || group.githubImportSource || getChildGroups(state.groups, id).length ||
    !canParentGroup(state.groups.find((candidate) => candidate.id === nextParentId), workspace)
  )) return state;

  const next: SiteGroup = { ...group, name: trimmed, icon, updatedAt: now };
  if (reparenting) {
    if (nextParentId === undefined) delete next.parentId;
    else next.parentId = nextParentId;
    next.order = state.groups.filter((candidate) => getGroupWorkspace(candidate) === workspace &&
      candidate.parentId === nextParentId && !candidate.isProtected).length;
  }
  const groups = state.groups.map((candidate) => candidate.id === id ? next : candidate);
  return normalizeCollectionHierarchy({ ...state, groups: reparenting ? normalizeWorkspaceGroupOrder(groups) : groups });
}

export type GroupDeletionMode = "trash" | "keep";

export function deleteGroupFromState(
  state: SiteCollectionState,
  id: string,
  now = new Date().toISOString(),
  mode: GroupDeletionMode = "trash",
): SiteCollectionState {
  if (mode === "trash") return deleteGroupsFromState(state, [id], now);

  const group = state.groups.find((candidate) => candidate.id === id);
  if (!group || group.isProtected) return state;
  const workspace = getGroupWorkspace(group);
  const fallback = state.groups.find((candidate) => candidate.id === group.parentId &&
    getGroupWorkspace(candidate) === workspace) ?? getWorkspaceOtherGroup(state, workspace);
  const directSites = state.sites.filter((site) => site.groupId === id).sort((a, b) => a.order - b.order);
  if (directSites.length && !fallback) return state;

  const destinationStart = state.sites.filter((site) => site.groupId === fallback?.id).length;
  const siteOrder = new Map(directSites.map((site, index) => [site.id, destinationStart + index]));
  const rootStart = state.groups.filter((candidate) => !candidate.parentId && !candidate.isProtected &&
    getGroupWorkspace(candidate) === workspace).length;
  const promotedOrder = new Map(getChildGroups(state.groups, id).map((child, index) => [child.id, rootStart + index]));
  const groups = state.groups.filter((candidate) => candidate.id !== id).map((candidate) => {
    const order = promotedOrder.get(candidate.id);
    if (order === undefined) return candidate;
    const { parentId: _parent, ...promoted } = candidate;
    return { ...promoted, order, updatedAt: now };
  });
  const sites = state.sites.map((site) => {
    const order = siteOrder.get(site.id);
    return order === undefined || !fallback ? site : { ...site, groupId: fallback.id, order, updatedAt: now };
  });
  return normalizeCollectionHierarchy({ ...state, groups: normalizeWorkspaceGroupOrder(groups), sites });
}

function getWorkspaceOtherGroup(state: SiteCollectionState, workspace: SiteWorkspace): SiteGroup | undefined {
  const fallbackId = workspace === "github" ? GITHUB_OTHER_GROUP_ID : OTHER_GROUP_ID;
  return state.groups.find((group) => group.id === fallbackId && getGroupWorkspace(group) === workspace) ??
    state.groups.find((group) => group.isProtected && getGroupWorkspace(group) === workspace);
}

export function deleteGroupsFromState(state: SiteCollectionState, ids: readonly string[], now = new Date().toISOString()): SiteCollectionState {
  const requested = new Set(ids);
  const requestedGroups = state.groups.filter((group) => requested.has(group.id) && !group.isProtected);
  const expanded = getGroupSubtreeIds(state.groups, requestedGroups.map((group) => group.id));
  const targets = new Map(state.groups.filter((group) => expanded.has(group.id) && !group.isProtected)
    .map((group) => [group.id, group]));
  if (!targets.size) return state;
  const removedSites = state.sites.filter(site => targets.has(site.groupId));
  const removedIds = new Set(removedSites.map((site) => site.id));
  const deletedSites = [
    ...state.deletedSites.filter((record) => !removedIds.has(record.site.id)),
    ...removedSites.map((site) => ({
      site: { ...site },
      deletedAt: now,
      originalGroupId: site.groupId,
      originalGroupName: targets.get(site.groupId)!.name,
      originalWorkspace: getGroupWorkspace(targets.get(site.groupId)!),
    })),
  ];

  return normalizeCollectionHierarchy({
    ...state,
    groups: normalizeWorkspaceGroupOrder(
      state.groups.filter((group) => !targets.has(group.id)),
    ),
    sites: reindexSites(
      state.sites
        .filter((site) => !targets.has(site.groupId))
        .map((site) => ({ ...site })),
    ),
    deletedSites,
  });
}

export function trashSiteFromState(
  state: SiteCollectionState,
  id: string,
  now = new Date().toISOString(),
): SiteCollectionState {
  const site = state.sites.find((item) => item.id === id);
  if (!site) return state;
  const group = state.groups.find((item) => item.id === site.groupId);
  return normalizeCollectionHierarchy({
    ...state,
    sites: reindexSites(
      state.sites.filter((item) => item.id !== id).map((item) => ({ ...item })),
    ),
    deletedSites: [
      ...state.deletedSites.filter((record) => record.site.id !== id),
      {
        site: { ...site },
        deletedAt: now,
        originalGroupId: site.groupId,
        originalGroupName: group?.name ?? "未知分组",
        originalWorkspace: group ? getGroupWorkspace(group) : "main",
      },
    ],
  });
}

export function restoreTrashedSiteFromState(
  state: SiteCollectionState,
  id: string,
  now = new Date().toISOString(),
): SiteCollectionState {
  const record = state.deletedSites.find((item) => item.site.id === id);
  if (!record || state.sites.some((site) => site.id === id)) return state;
  const originalWorkspace = record.originalWorkspace ?? "main";
  const targetGroup = state.groups.find(
    (group) =>
      group.id === record.originalGroupId &&
      getGroupWorkspace(group) === originalWorkspace,
  ) ?? getWorkspaceOtherGroup(state, originalWorkspace);
  if (!targetGroup) return state;
  const targetGroupId = targetGroup.id;
  const restored: SiteItem = {
    ...record.site,
    groupId: targetGroupId,
    order: state.sites.filter((site) => site.groupId === targetGroupId).length,
    globalOrder: state.sites.length,
    updatedAt: now,
  };
  return normalizeCollectionHierarchy({
    ...state,
    sites: reindexSites([...state.sites.map((site) => ({ ...site })), restored]),
    deletedSites: state.deletedSites.filter((item) => item.site.id !== id),
  });
}

export function restoreAllTrashedSitesFromState(
  state: SiteCollectionState,
  now = new Date().toISOString(),
): SiteCollectionState {
  return state.deletedSites.reduce(
    (current, record) =>
      restoreTrashedSiteFromState(current, record.site.id, now),
    state,
  );
}

export function permanentlyDeleteTrashedSiteFromState(
  state: SiteCollectionState,
  id: string,
): SiteCollectionState {
  if (!state.deletedSites.some((item) => item.site.id === id)) return state;
  return {
    ...state,
    deletedSites: state.deletedSites.filter((item) => item.site.id !== id),
  };
}

export function purgeExpiredTrashFromState(
  state: SiteCollectionState,
  now = Date.now(),
): SiteCollectionState {
  if (state.trashRetentionDays === null || state.deletedSites.length === 0) {
    return state;
  }
  const cutoff = now - state.trashRetentionDays * 24 * 60 * 60 * 1000;
  const deletedSites = state.deletedSites.filter(
    (item) => Date.parse(item.deletedAt) > cutoff,
  );
  return deletedSites.length === state.deletedSites.length
    ? state
    : { ...state, deletedSites };
}

export function setTrashRetentionInState(
  state: SiteCollectionState,
  trashRetentionDays: TrashRetentionDays,
  now = Date.now(),
): SiteCollectionState {
  return purgeExpiredTrashFromState(
    { ...state, trashRetentionDays },
    now,
  );
}

export function findSiteByUrl(
  sites: SiteItem[],
  url: string,
  ignoreId?: string,
): SiteItem | undefined {
  const target = comparableSiteUrl(url);
  return sites.find(
    (site) =>
      site.id !== ignoreId &&
      comparableSiteUrl(site.url) === target,
  );
}

export function findGroupByName(
  groups: SiteGroup[],
  name: string,
): SiteGroup | undefined {
  const target = name.trim().toLocaleLowerCase("zh-CN");
  return groups.find(
    (group) => group.name.trim().toLocaleLowerCase("zh-CN") === target,
  );
}
