import {
  DEFAULT_GITHUB_GROUPS,
  GITHUB_OTHER_GROUP_ID,
  OTHER_GROUP_ID,
} from "../data/defaults";
import type {
  GithubMigrationEntry,
  SiteCollectionState,
  SiteGroup,
  SiteWorkspace,
} from "../types";
import { reindexSites } from "./site-utils";

export const GITHUB_WORKSPACE_LABEL = "GitHub";

export function getGroupWorkspace(group: Pick<SiteGroup, "workspace">): SiteWorkspace {
  return group.workspace ?? "main";
}

export function isGithubUrl(input: string): boolean {
  try {
    const hostname = new URL(input).hostname.toLocaleLowerCase("en-US");
    return hostname === "github.com" || hostname.endsWith(".github.com");
  } catch {
    return false;
  }
}

export function getWorkspaceGroups(
  groups: SiteGroup[],
  workspace: SiteWorkspace,
): SiteGroup[] {
  return groups
    .filter((group) => getGroupWorkspace(group) === workspace)
    .sort((first, second) => first.order - second.order);
}

export function getGithubOtherGroupId(state: SiteCollectionState): string {
  return state.groups.some((group) => group.id === GITHUB_OTHER_GROUP_ID)
    ? GITHUB_OTHER_GROUP_ID
    : state.groups.find(
          (group) =>
            getGroupWorkspace(group) === "github" && group.isProtected,
        )?.id ?? GITHUB_OTHER_GROUP_ID;
}

function normalizeWorkspaceGroupOrder(groups: SiteGroup[]): SiteGroup[] {
  const next = groups.map((group) => ({ ...group }));
  for (const workspace of ["main", "github"] as const) {
    const scoped = next
      .filter((group) => getGroupWorkspace(group) === workspace)
      .sort((first, second) => {
        if (first.isProtected !== second.isProtected) {
          return first.isProtected ? 1 : -1;
        }
        return first.order - second.order;
      });
    scoped.forEach((group, order) => {
      group.order = order;
    });
  }
  return next;
}

export function ensureGithubWorkspace(
  state: SiteCollectionState,
): SiteCollectionState {
  const existing = new Map(state.groups.map((group) => [group.id, group]));
  const groups = state.groups.map((group) => ({
    ...group,
    workspace: group.workspace ?? "main",
  }));
  for (const defaultGroup of DEFAULT_GITHUB_GROUPS) {
    if (!existing.has(defaultGroup.id)) groups.push({ ...defaultGroup });
  }
  const githubOther = groups.find((group) => group.id === GITHUB_OTHER_GROUP_ID);
  if (githubOther) {
    githubOther.workspace = "github";
    githubOther.isProtected = true;
  }
  return {
    ...state,
    groups: normalizeWorkspaceGroupOrder(groups),
  };
}

export interface GithubMigrationResult {
  state: SiteCollectionState;
  movedCount: number;
}

export function migrateGithubSitesInState(
  input: SiteCollectionState,
  now = new Date().toISOString(),
): GithubMigrationResult {
  const state = ensureGithubWorkspace(input);
  if (state.githubMigration) return { state, movedCount: 0 };

  const targetGroupId = getGithubOtherGroupId(state);
  let targetOrder = state.sites.filter(
    (site) => site.groupId === targetGroupId,
  ).length;
  const groupsById = new Map(state.groups.map((group) => [group.id, group]));
  const entries: GithubMigrationEntry[] = [];
  const sites = state.sites.map((site) => {
    const sourceGroup = groupsById.get(site.groupId);
    if (
      !isGithubUrl(site.url) ||
      !sourceGroup ||
      getGroupWorkspace(sourceGroup) !== "main"
    ) {
      return { ...site };
    }
    entries.push({
      siteId: site.id,
      originalName: site.name,
      originalUrl: site.url,
      fromGroupId: site.groupId,
      fromGroupName: sourceGroup.name,
      fromOrder: site.order,
      fromGlobalOrder: site.globalOrder,
      targetGroupId,
    });
    return {
      ...site,
      groupId: targetGroupId,
      order: targetOrder++,
      updatedAt: now,
    };
  });

  return {
    state: {
      ...state,
      sites: reindexSites(sites),
      githubMigration: {
        status: "completed",
        completedAt: now,
        entries,
      },
    },
    movedCount: entries.length,
  };
}

export function routeGithubSitesInState(
  input: SiteCollectionState,
  now = new Date().toISOString(),
): GithubMigrationResult {
  const state = ensureGithubWorkspace(input);
  const targetGroupId = getGithubOtherGroupId(state);
  let targetOrder = state.sites.filter(
    (site) => site.groupId === targetGroupId,
  ).length;
  const groupById = new Map(state.groups.map((group) => [group.id, group]));
  let movedCount = 0;
  const sites = state.sites.map((site) => {
    const group = groupById.get(site.groupId);
    if (!isGithubUrl(site.url) || !group || getGroupWorkspace(group) !== "main") {
      return { ...site };
    }
    movedCount += 1;
    return {
      ...site,
      groupId: targetGroupId,
      order: targetOrder++,
      updatedAt: now,
    };
  });
  return { state: { ...state, sites: reindexSites(sites) }, movedCount };
}

export interface GithubMigrationUndoResult {
  state: SiteCollectionState;
  restoredCount: number;
  skippedCount: number;
}

export function undoGithubMigrationInState(
  input: SiteCollectionState,
  now = new Date().toISOString(),
): GithubMigrationUndoResult {
  const record = input.githubMigration;
  if (!record || record.status !== "completed") {
    return { state: input, restoredCount: 0, skippedCount: 0 };
  }

  const groupsById = new Map(input.groups.map((group) => [group.id, group]));
  const entriesBySiteId = new Map(record.entries.map((entry) => [entry.siteId, entry]));
  let restoredCount = 0;
  let skippedCount = 0;
  const sites = input.sites.map((site) => {
    const entry = entriesBySiteId.get(site.id);
    if (!entry) return { ...site };
    if (
      site.groupId !== entry.targetGroupId ||
      site.name !== entry.originalName ||
      site.url !== entry.originalUrl
    ) {
      skippedCount += 1;
      return { ...site };
    }
    const sourceGroup = groupsById.get(entry.fromGroupId);
    const targetGroupId =
      sourceGroup && getGroupWorkspace(sourceGroup) === "main"
        ? sourceGroup.id
        : OTHER_GROUP_ID;
    restoredCount += 1;
    return {
      ...site,
      groupId: targetGroupId,
      order: entry.fromOrder,
      globalOrder: entry.fromGlobalOrder,
      updatedAt: now,
    };
  });

  return {
    state: {
      ...input,
      sites: reindexSites(sites),
      githubMigration: {
        ...record,
        status: "undone",
        undoneAt: now,
      },
    },
    restoredCount,
    skippedCount,
  };
}
