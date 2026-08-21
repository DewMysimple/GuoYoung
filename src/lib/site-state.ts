import type {
  CategoryIcon,
  GroupDeletionStrategy,
  SiteCollectionState,
  SiteFormValues,
  SiteGroup,
  SiteItem,
} from "../types";
import { OTHER_GROUP_ID } from "../data/defaults";
import { reindexSites } from "./site-utils";

export type SavedSiteValues = SiteFormValues & {
  url: string;
  customIconUrl?: string;
};

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
    createdAt: now,
    updatedAt: now,
  };
  return { ...state, sites: [...state.sites, site] };
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
  strategy: GroupDeletionStrategy,
  now = new Date().toISOString(),
): SiteCollectionState {
  const target = state.groups.find((group) => group.id === id);
  if (!target || target.isProtected) return state;

  const other = state.groups.find(
    (group) => group.id === OTHER_GROUP_ID && group.isProtected,
  );
  if (strategy === "move-to-other" && !other) return state;

  let otherOrder = state.sites.filter(
    (site) => site.groupId === OTHER_GROUP_ID,
  ).length;
  const sites =
    strategy === "delete-sites"
      ? state.sites
          .filter((site) => site.groupId !== id)
          .map((site) => ({ ...site }))
      : state.sites.map((site) =>
          site.groupId === id
            ? {
                ...site,
                groupId: OTHER_GROUP_ID,
                order: otherOrder++,
                updatedAt: now,
              }
            : { ...site },
        );

  return {
    ...state,
    groups: normalizeGroupOrder(
      state.groups.filter((group) => group.id !== id),
    ),
    sites: reindexSites(sites),
  };
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
