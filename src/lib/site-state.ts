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
  isGithubHomeUrl,
  isGithubUrl,
} from "./github-workspace";
import { normalizeUrl, reindexSites } from "./site-utils";

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
}

export type GithubRepositoryStatus = "new" | "active" | "deleted";

export function getGithubRepositoryStatus(
  state: SiteCollectionState,
  repository: GithubRepositorySummary,
): GithubRepositoryStatus {
  let key: string;
  try {
    key = comparableSiteUrl(normalizeUrl(repository.htmlUrl));
  } catch {
    return "deleted";
  }
  if (state.sites.some((site) => comparableSiteUrl(site.url) === key)) {
    return "active";
  }
  if (
    state.deletedSites.some(
      (entry) => comparableSiteUrl(entry.site.url) === key,
    )
  ) {
    return "deleted";
  }
  return "new";
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
      group.githubImportSource?.login.toLocaleLowerCase("en-US") ===
        owner.login.toLocaleLowerCase("en-US"),
  );
  if (sourceGroup) return sourceGroup;
  return state.groups.find(
    (group) => githubGroupNameMatches(group, owner.login) && !group.githubImportSource,
  );
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
  if (!targetGroup) return { state, added: 0, skipped, skippedActive, skippedDeleted };

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
  const finalState = {
    ...nextState,
    groups,
    sites: reindexSites([...nextState.sites.map((site) => ({ ...site })), ...imported]),
  };
  return {
    state: finalState,
    group: finalState.groups.find((group) => group.id === targetGroup!.id),
    added: imported.length,
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
  }

  return {
    state: nextState,
    refreshedOwners: imports.length,
    added,
    skipped,
    skippedActive,
    skippedDeleted,
  };
}

function comparableSiteUrl(url: string): string {
  try {
    const normalized = normalizeUrl(url).toLocaleLowerCase("en-US");
    return isGithubHomeUrl(normalized) ? "https://github.com" : normalized;
  } catch {
    return url.trim().toLocaleLowerCase("en-US");
  }
}

function normalizeGroupOrder(groups: SiteGroup[]): SiteGroup[] {
  const next = groups.map((group) => ({ ...group }));
  for (const workspace of ["main", "github"] as const) {
    const scoped = next
      .filter((group) => getGroupWorkspace(group) === workspace)
      .sort((a, b) => {
        if (a.isProtected !== b.isProtected) return a.isProtected ? 1 : -1;
        return a.order - b.order;
      });
    scoped.forEach((group, order) => {
      group.order = order;
    });
  }
  return next;
}

function resolveSiteGroupId(
  state: SiteCollectionState,
  groupId: string,
  url: string,
): string {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return groupId;
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
  return { ...state, sites: [...state.sites, site] };
}

export function mergeGroupImportIntoState(
  state: SiteCollectionState,
  targetGroupId: string,
  payload: GroupExportPayload,
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
    state: {
      ...state,
      sites: reindexSites([
        ...state.sites.map((site) => ({ ...site })),
        ...imported,
      ]),
    },
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
  return { ...state, sites: reindexSites(sites) };
}

export function addGroupToState(
  state: SiteCollectionState,
  name: string,
  icon: CategoryIcon,
  id: string = crypto.randomUUID(),
  now = new Date().toISOString(),
  beforeGroupId?: string,
  workspace: SiteWorkspace = "main",
): SiteCollectionState {
  const ordinaryGroups = state.groups
    .filter(
      (item) =>
        !item.isProtected && getGroupWorkspace(item) === workspace,
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
  };
  return {
    ...state,
    groups: normalizeGroupOrder([...state.groups, group]),
  };
}

export function deleteGroupFromState(
  state: SiteCollectionState,
  id: string,
  now = new Date().toISOString(),
): SiteCollectionState {
  const target = state.groups.find((group) => group.id === id);
  if (!target || target.isProtected) return state;
  const removedSites = state.sites.filter((site) => site.groupId === id);
  const deletedSites = [
    ...state.deletedSites,
    ...removedSites.map((site) => ({
      site: { ...site },
      deletedAt: now,
      originalGroupId: target.id,
      originalGroupName: target.name,
      originalWorkspace: getGroupWorkspace(target),
    })),
  ];

  return {
    ...state,
    groups: normalizeGroupOrder(
      state.groups.filter((group) => group.id !== id),
    ),
    sites: reindexSites(
      state.sites
        .filter((site) => site.groupId !== id)
        .map((site) => ({ ...site })),
    ),
    deletedSites,
  };
}

export function trashSiteFromState(
  state: SiteCollectionState,
  id: string,
  now = new Date().toISOString(),
): SiteCollectionState {
  const site = state.sites.find((item) => item.id === id);
  if (!site) return state;
  const group = state.groups.find((item) => item.id === site.groupId);
  return {
    ...state,
    sites: reindexSites(
      state.sites.filter((item) => item.id !== id).map((item) => ({ ...item })),
    ),
    deletedSites: [
      ...state.deletedSites,
      {
        site: { ...site },
        deletedAt: now,
        originalGroupId: site.groupId,
        originalGroupName: group?.name ?? "未知分组",
        originalWorkspace: group ? getGroupWorkspace(group) : "main",
      },
    ],
  };
}

export function restoreTrashedSiteFromState(
  state: SiteCollectionState,
  id: string,
  now = new Date().toISOString(),
): SiteCollectionState {
  const record = state.deletedSites.find((item) => item.site.id === id);
  if (!record || state.sites.some((site) => site.id === id)) return state;
  const originalWorkspace = record.originalWorkspace ?? "main";
  const fallbackGroupId =
    originalWorkspace === "github" ? GITHUB_OTHER_GROUP_ID : OTHER_GROUP_ID;
  const targetGroupId = state.groups.some(
    (group) =>
      group.id === record.originalGroupId &&
      getGroupWorkspace(group) === originalWorkspace,
  )
    ? record.originalGroupId
    : state.groups.some((group) => group.id === fallbackGroupId)
      ? fallbackGroupId
      : OTHER_GROUP_ID;
  const restored: SiteItem = {
    ...record.site,
    groupId: targetGroupId,
    order: state.sites.filter((site) => site.groupId === targetGroupId).length,
    globalOrder: state.sites.length,
    updatedAt: now,
  };
  return {
    ...state,
    sites: reindexSites([...state.sites.map((site) => ({ ...site })), restored]),
    deletedSites: state.deletedSites.filter((item) => item.site.id !== id),
  };
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
