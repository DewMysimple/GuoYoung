/**
 * Returns the inclusive range between two ids in the order currently shown
 * to the user. An unknown anchor is treated as a single-item selection so a
 * stale selection cannot accidentally select an unrelated block.
 */
export function getInclusiveSelectionRange<T extends string>(
  orderedIds: readonly T[],
  anchorId: T | null | undefined,
  targetId: T,
): T[] {
  if (!anchorId) return [targetId];
  const anchorIndex = orderedIds.indexOf(anchorId);
  const targetIndex = orderedIds.indexOf(targetId);
  if (anchorIndex < 0 || targetIndex < 0) return [targetId];
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return orderedIds.slice(start, end + 1);
}
