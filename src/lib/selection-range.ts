/** Shift adds a range while retaining its anchor; a normal click toggles one id. */
export function toggleRangeSelection<T extends string>(
  selected: ReadonlySet<T>,
  orderedIds: readonly T[],
  anchorId: T | null,
  targetId: T,
  shiftKey: boolean,
): { ids: Set<T>; anchorId: T } {
  const hasRange = shiftKey && anchorId !== null && orderedIds.includes(anchorId);
  const ids = new Set(selected);
  if (hasRange) {
    for (const id of getInclusiveSelectionRange(orderedIds, anchorId, targetId)) {
      ids.add(id);
    }
  } else if (ids.has(targetId)) {
    ids.delete(targetId);
  } else {
    ids.add(targetId);
  }
  return { ids, anchorId: hasRange ? anchorId : targetId };
}

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
