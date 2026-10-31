import type { SiteGroup } from "../../../types";

export function reorderGroups(
  groups: SiteGroup[],
  activeId: string,
  beforeGroupId: string | null,
): SiteGroup[] {
  return reorderGroupBlock(groups, [activeId], beforeGroupId);
}

export function reorderGroupBlock(
  groups: SiteGroup[],
  activeIds: string[],
  beforeGroupId: string | null,
): SiteGroup[] {
  const protectedGroups = groups
    .filter((group) => group.isProtected)
    .sort((a, b) => a.order - b.order);
  const ordinaryGroups = groups
    .filter((group) => !group.isProtected)
    .sort((a, b) => a.order - b.order);
  const activeSet = new Set(activeIds);
  const moved = ordinaryGroups.filter((group) => activeSet.has(group.id));
  if (moved.length === 0) {
    return [...ordinaryGroups, ...protectedGroups].map((group, order) => ({
      ...group,
      order,
    }));
  }
  const remaining = ordinaryGroups.filter((group) => !activeSet.has(group.id));
  const to =
    beforeGroupId === null
      ? remaining.length
      : remaining.findIndex((group) => group.id === beforeGroupId);
  if (to < 0) {
    return [...ordinaryGroups, ...protectedGroups].map((group, order) => ({
      ...group,
      order,
    }));
  }
  const now = new Date().toISOString();
  remaining.splice(
    to,
    0,
    ...moved.map((group) => ({ ...group, updatedAt: now })),
  );
  return [...remaining, ...protectedGroups].map((group, order) => ({
    ...group,
    order,
  }));
}
