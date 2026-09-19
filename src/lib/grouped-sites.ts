import type { SiteGroup, SiteItem, SiteSortMode } from "../types";

/** Build section order once for both rendering and Shift selection. */
export function getGroupedSiteSections(
  groups: readonly SiteGroup[],
  visibleSites: readonly SiteItem[],
  sortMode: SiteSortMode,
  isSearching: boolean,
) {
  const byGroup = new Map<string, SiteItem[]>();
  for (const site of visibleSites) {
    const sites = byGroup.get(site.groupId);
    if (sites) sites.push(site);
    else byGroup.set(site.groupId, [site]);
  }
  return groups.flatMap((group) => {
    const sites = byGroup.get(group.id) ?? [];
    if (isSearching && sites.length === 0) return [];
    // Name/date sorts keep the incoming display order; grouped manual/heat
    // use group order for ties instead of the flat view's globalOrder.
    if (sortMode === "manual") sites.sort((a, b) => a.order - b.order);
    if (sortMode === "heat") sites.sort((a, b) => b.clickCount - a.clickCount || a.order - b.order);
    return [{ group, sites }];
  });
}
