import type { SiteGroup, SiteItem } from "../types";

export const groupZoneDropId = (groupId: string) => `group-zone:${groupId}`;
export const groupSortTabId = (groupId: string) => `group-sort-tab:${groupId}`;
export const groupSortRowId = (groupId: string) => `group-sort-row:${groupId}`;

export function createFolderDragIds(groups: readonly SiteGroup[], sites: readonly SiteItem[]) {
  const folders = groups.filter(group => group.parentId);
  const ids = new Map<string, string>();
  if (!folders.length) return ids;
  const siteIds = new Set(sites.map(site => site.id));
  for (const group of folders) {
    // Website drag IDs predate typed entries and imported IDs can be arbitrary.
    // JSON framing separates group IDs from the optional disambiguating suffix.
    const base = `collection-folder:${JSON.stringify(group.id)}`;
    let id = base;
    while (siteIds.has(id)) id += ":";
    ids.set(group.id, id);
  }
  return ids;
}

export function readGroupSortId(id: string): string | undefined {
  if (id.startsWith("group-sort-tab:")) {
    return id.slice("group-sort-tab:".length);
  }
  if (id.startsWith("group-sort-row:")) {
    return id.slice("group-sort-row:".length);
  }
  return undefined;
}

export function readDropGroupId(id: string): string | undefined {
  if (id.startsWith("group-tab:")) return id.slice("group-tab:".length);
  if (id.startsWith("group-zone:")) return id.slice("group-zone:".length);
  return undefined;
}
