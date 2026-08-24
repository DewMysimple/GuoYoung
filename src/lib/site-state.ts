import type {
  CategoryIcon,
  SiteCollectionState,
  SiteFormValues,
  SiteGroup,
  SiteItem,
  TrashRetentionDays,
} from "../types";
import { OTHER_GROUP_ID } from "../data/defaults";
import type { GroupExportPayload } from "./data-transfer";
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

function normalizeGroupOrder(groups: SiteGroup[]): SiteGroup[] {
  return [
    ...groups
      .filter((group) => !group.isProtected)
      .sort((a, b) => a.order - b.order),
    ...groups
      .filter((group) => group.isProtected)
      .sort((a, b) => a.order - b.order),
  ].map((group, order) => ({ ...group, order }));
}

export function addSiteToState(
  state: SiteCollectionState,
  values: SavedSiteValues,
  id: string = crypto.randomUUID(),
  now = new Date().toISOString(),
): SiteCollectionState {
  const site: SiteItem = {
    id,
    name: values.name.trim(),
    url: values.url,
    groupId: values.groupId,
    customIconUrl: values.customIconUrl || undefined,
    iconSource: values.iconSource,
    order: state.sites.filter((item) => item.groupId === values.groupId).length,
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
    state.sites.map((site) => {
      try {
        return normalizeUrl(site.url).toLocaleLowerCase("en-US");
      } catch {
        return site.url.trim().toLocaleLowerCase("en-US");
      }
    }),
  );
  const targetCount = state.sites.filter(
    (site) => site.groupId === targetGroupId,
  ).length;
  let order = targetCount;
  let nextGlobalOrder = state.sites.length;
  let added = 0;
  let skipped = 0;
  const imported: SiteItem[] = [];

  for (const entry of payload.sites.slice().sort((a, b) => a.order - b.order)) {
    const key = entry.url.toLocaleLowerCase("en-US");
    if (existingUrls.has(key)) {
      skipped += 1;
      continue;
    }
    existingUrls.add(key);
    imported.push({
      id: crypto.randomUUID(),
      name: entry.name.trim(),
      url: entry.url,
      groupId: targetGroupId,
      ...(entry.customIconUrl ? { customIconUrl: entry.customIconUrl } : {}),
      ...(entry.iconSource ? { iconSource: entry.iconSource } : {}),
      order: order++,
      globalOrder: nextGlobalOrder++,
      clickCount: 0,
      createdAt: now,
      updatedAt: now,
    });
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
  const moved = target.groupId !== values.groupId;
  const sites = state.sites.map((site) =>
    site.id === id
      ? {
          ...site,
          name: values.name.trim(),
          url: values.url,
          groupId: values.groupId,
          customIconUrl: values.customIconUrl || undefined,
          iconSource: values.iconSource,
          updatedAt: now,
          order: moved
            ? state.sites.filter(
                (candidate) => candidate.groupId === values.groupId,
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
): SiteCollectionState {
  const ordinaryGroups = state.groups
    .filter((item) => !item.isProtected)
    .sort((a, b) => a.order - b.order);
  const insertionIndex = beforeGroupId
    ? ordinaryGroups.findIndex((item) => item.id === beforeGroupId)
    : -1;
  const group: SiteGroup = {
    id,
    name: name.trim(),
    icon,
    isProtected: false,
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
  const targetGroupId = state.groups.some(
    (group) => group.id === record.originalGroupId,
  )
    ? record.originalGroupId
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
  const target = url.toLocaleLowerCase("en-US");
  return sites.find(
    (site) =>
      site.id !== ignoreId &&
      site.url.toLocaleLowerCase("en-US") === target,
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
