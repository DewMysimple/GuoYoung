import type { CollectionEntryId, SiteCollectionState, SiteGroup, SiteItem, SiteSortMode, SiteWorkspace } from "../types";

export const siteEntryId = (id: string): CollectionEntryId => `site:${id}`;
export const folderEntryId = (id: string): CollectionEntryId => `folder:${id}`;

export type CollectionEntry =
  | { kind: "site"; id: CollectionEntryId; site: SiteItem }
  | { kind: "folder"; id: CollectionEntryId; group: SiteGroup };

export function canParentGroup(parent: SiteGroup | undefined, workspace: SiteWorkspace): parent is SiteGroup {
  return Boolean(parent && (parent.workspace ?? "main") === workspace &&
    parent.parentId == null && !parent.isProtected && !parent.githubImportSource);
}

export function getRootGroups(groups: readonly SiteGroup[]): SiteGroup[] {
  return groups.filter((group) => !group.parentId);
}

export function normalizeWorkspaceGroupOrder(groups: SiteGroup[]): SiteGroup[] {
  const scopes = new Map<string, SiteGroup[]>();
  const next = groups.map((group) => {
    const scope = group.parentId ? folderEntryId(group.parentId) : (group.workspace ?? "main");
    const siblings = scopes.get(scope) ?? [];
    const copy = { ...group };
    siblings.push(copy);
    scopes.set(scope, siblings);
    return copy;
  });
  for (const siblings of scopes.values()) {
    siblings.sort((a, b) => Number(a.isProtected) - Number(b.isProtected) || a.order - b.order);
    siblings.forEach((group, order) => { group.order = order; });
  }
  return next;
}

export function getChildGroups(groups: readonly SiteGroup[], parentId: string): SiteGroup[] {
  const children = groups.filter((group) => group.parentId === parentId);
  if (!children.length) return children;
  const manualOrder = groups.find((group) => group.id === parentId)?.entryOrder;
  const slots = new Map(Array.isArray(manualOrder) ? manualOrder.map((id, index) => [id, index]) : []);
  return children.sort((a, b) =>
    (slots.get(folderEntryId(a.id)) ?? Infinity) - (slots.get(folderEntryId(b.id)) ?? Infinity) ||
    a.order - b.order);
}

export function getGroupsInTreeOrder(groups: readonly SiteGroup[]): SiteGroup[] {
  return getRootGroups(groups).flatMap((group) => [group, ...getChildGroups(groups, group.id)]);
}

export function getGroupPath(groups: readonly SiteGroup[], groupId: string): string {
  const group = groups.find((candidate) => candidate.id === groupId);
  if (!group) return "";
  const parent = group.parentId && groups.find((candidate) => candidate.id === group.parentId);
  return parent ? `${parent.name} / ${group.name}` : group.name;
}

export function getGroupSubtreeIds(groups: readonly SiteGroup[], groupIds: readonly string[]): Set<string> {
  const requested = new Set(groupIds);
  return new Set(groups.filter((group) => requested.has(group.id) ||
    (group.parentId && requested.has(group.parentId))).map((group) => group.id));
}

export function getGroupSiteCounts(groups: readonly SiteGroup[], sites: readonly SiteItem[]): ReadonlyMap<string, number> {
  const siteIds = new Map(groups.map(group => [group.id, new Set<string>()]));
  for (const site of sites) siteIds.get(site.groupId)?.add(site.id);
  for (const group of groups) {
    if (!group.parentId) continue;
    const parent = siteIds.get(group.parentId);
    for (const id of siteIds.get(group.id)!) parent?.add(id);
  }
  return new Map(Array.from(siteIds, ([id, ids]) => [id, ids.size]));
}

function completeEntryOrder(
  order: unknown,
  siteIds: CollectionEntryId[],
  folderIds: CollectionEntryId[],
): CollectionEntryId[] {
  const remaining = new Set([...siteIds, ...folderIds]);
  const retained = Array.isArray(order)
    ? (order as CollectionEntryId[]).filter((id) => remaining.delete(id))
    : [];
  return [...retained, ...remaining];
}

export function getGroupEntries(
  group: SiteGroup,
  groups: readonly SiteGroup[],
  orderedDirectSites: readonly SiteItem[],
  sortMode: SiteSortMode,
): CollectionEntry[] {
  const sites = orderedDirectSites.map((site): CollectionEntry => ({ kind: "site", id: siteEntryId(site.id), site }));
  const folders = getChildGroups(groups, group.id)
    .map((child): CollectionEntry => ({ kind: "folder", id: folderEntryId(child.id), group: child }));
  if (sortMode !== "manual" || !folders.length) return [...folders, ...sites];
  const byId = new Map([...sites, ...folders].map((entry) => [entry.id, entry]));
  return completeEntryOrder(group.entryOrder, sites.map(({ id }) => id), folders.map(({ id }) => id))
    .map((id) => byId.get(id)!);
}

// Existing site slots keep folders anchored when a legacy site transaction
// changes site.order. Newly arrived sites fill their relative site positions.
function reconcileSiteSlots(
  prior: CollectionEntryId[],
  siteIds: CollectionEntryId[],
  folderIds: CollectionEntryId[],
): CollectionEntryId[] {
  const retainedSites = new Set(prior);
  const entries = new Set([...siteIds, ...folderIds]);
  const order = prior.filter((id) => entries.delete(id));
  const next: CollectionEntryId[] = [];
  let cursor = 0;
  for (const id of order) {
    if (id.startsWith("folder:")) {
      next.push(id);
      continue;
    }
    while (cursor < siteIds.length) {
      const siteId = siteIds[cursor++];
      next.push(siteId);
      if (retainedSites.has(siteId)) break;
    }
  }
  next.push(...siteIds.slice(cursor), ...folderIds.filter((id) => entries.has(id)));
  return next;
}

/** Normalize untrusted references without touching any site's group or global order. */
export function normalizeCollectionHierarchy(
  state: SiteCollectionState,
  reconcileSites = false,
): SiteCollectionState {
  if (!state.groups.some((group) => group.parentId !== undefined || group.entryOrder !== undefined)) return state;

  const byId = new Map(state.groups.map((group) => [group.id, group]));
  const childrenByParent = new Map<string, SiteGroup[]>();
  let promotedAny = false;
  const groups = state.groups.map((group) => {
    if (group.parentId === undefined) return group;
    const parent = byId.get(group.parentId);
    if (typeof group.parentId === "string" && group.parentId !== group.id &&
      !group.isProtected && !group.githubImportSource && canParentGroup(parent, group.workspace ?? "main")) {
      const children = childrenByParent.get(parent.id) ?? [];
      children.push(group);
      childrenByParent.set(parent.id, children);
      return group;
    }
    promotedAny ||= group.parentId != null;
    const { parentId: _parent, ...promoted } = group;
    return promoted;
  });

  const sitesByGroup = new Map<string, SiteItem[]>();
  for (const site of state.sites) {
    if (!childrenByParent.has(site.groupId)) continue;
    const sites = sitesByGroup.get(site.groupId) ?? [];
    sites.push(site);
    sitesByGroup.set(site.groupId, sites);
  }
  const siteOrders = new Map<CollectionEntryId, number>();
  const repairedGroups = groups.map((group) => {
    const children = childrenByParent.get(group.id);
    if (!children?.length) {
      if (group.entryOrder === undefined) return group;
      const { entryOrder: _order, ...ordinaryGroup } = group;
      return ordinaryGroup;
    }
    const siteIds = (sitesByGroup.get(group.id) ?? []).sort((a, b) => a.order - b.order)
      .map((site) => siteEntryId(site.id));
    const folderIds = children.sort((a, b) => a.order - b.order).map((child) => folderEntryId(child.id));
    const entryOrder = reconcileSites && Array.isArray(group.entryOrder)
      ? reconcileSiteSlots(group.entryOrder, siteIds, folderIds)
      : completeEntryOrder(group.entryOrder, siteIds, folderIds);
    const orderedSites = entryOrder.filter((id) => id.startsWith("site:"));
    if (orderedSites.some((id, index) => id !== siteIds[index])) {
      orderedSites.forEach((id, order) => siteOrders.set(id, order));
    }
    if (Array.isArray(group.entryOrder) && group.entryOrder.length === entryOrder.length &&
      group.entryOrder.every((id, index) => id === entryOrder[index])) return group;
    return { ...group, entryOrder };
  });

  if (!siteOrders.size && repairedGroups.every((group, index) => group === state.groups[index])) return state;
  return {
    ...state,
    groups: promotedAny ? normalizeWorkspaceGroupOrder(repairedGroups) : repairedGroups,
    sites: siteOrders.size ? state.sites.map((site) => {
      const order = siteOrders.get(siteEntryId(site.id));
      return order === undefined || order === site.order ? site : { ...site, order };
    }) : state.sites,
  };
}

export function commitGroupEntriesToState(
  state: SiteCollectionState,
  groupId: string,
  entryOrder: readonly CollectionEntryId[],
): SiteCollectionState {
  const group = state.groups.find((candidate) => candidate.id === groupId);
  if (!group || !getChildGroups(state.groups, groupId).length) return state;
  const sites = state.sites.filter((site) => site.groupId === groupId).sort((a, b) => a.order - b.order);
  const current = getGroupEntries(group, state.groups, sites, "manual");
  const remaining = new Set(current.map((entry) => entry.id));
  if (entryOrder.length !== current.length || !entryOrder.every((id) => remaining.delete(id))) return state;
  if (entryOrder.every((id, index) => id === current[index].id)) return state;

  const siteOrders = new Map(
    entryOrder.filter((id) => id.startsWith("site:")).map((id, order) => [id, order]),
  );
  return {
    ...state,
    groups: state.groups.map((candidate) => candidate.id === groupId
      ? { ...candidate, entryOrder: [...entryOrder] }
      : candidate),
    sites: state.sites.map((site) => {
      const order = site.groupId === groupId ? siteOrders.get(siteEntryId(site.id)) : undefined;
      return order === undefined || order === site.order ? site : { ...site, order };
    }),
  };
}
