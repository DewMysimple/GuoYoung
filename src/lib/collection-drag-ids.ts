export const groupZoneDropId = (groupId: string) => `group-zone:${groupId}`;
export const groupSortTabId = (groupId: string) => `group-sort-tab:${groupId}`;
export const groupSortRowId = (groupId: string) => `group-sort-row:${groupId}`;

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
