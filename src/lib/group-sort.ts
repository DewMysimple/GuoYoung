export type GroupSortAxis = "horizontal" | "vertical";

export interface GroupSortRect {
  groupId: string;
  start: number;
  end: number;
  crossStart: number;
  crossEnd: number;
}

export interface GroupSortIntent {
  axis: GroupSortAxis;
  activeGroupId: string;
  beforeGroupId: string | null;
}

interface ResolveGroupSortIntentOptions {
  axis: GroupSortAxis;
  activeGroupId: string;
  pointerPrimary: number;
  pointerCross: number;
  orderedRects: GroupSortRect[];
  crossAxisTolerance?: number;
}

export function groupSortIntentFromTargetIndex(
  axis: GroupSortAxis,
  activeGroupId: string,
  orderedGroupIds: string[],
  targetIndex: number,
): GroupSortIntent | null {
  const activeIndex = orderedGroupIds.indexOf(activeGroupId);
  if (
    activeIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= orderedGroupIds.length ||
    targetIndex === activeIndex
  ) {
    return null;
  }

  const remainingGroupIds = orderedGroupIds.filter(
    (groupId) => groupId !== activeGroupId,
  );
  return {
    axis,
    activeGroupId,
    beforeGroupId: remainingGroupIds[targetIndex] ?? null,
  };
}

export function resolveGroupSortIntent({
  axis,
  activeGroupId,
  pointerPrimary,
  pointerCross,
  orderedRects,
  crossAxisTolerance = 18,
}: ResolveGroupSortIntentOptions): GroupSortIntent | null {
  const activeIndex = orderedRects.findIndex(
    (rect) => rect.groupId === activeGroupId,
  );
  if (activeIndex < 0 || orderedRects.length < 2) return null;

  const crossStart = Math.min(...orderedRects.map((rect) => rect.crossStart));
  const crossEnd = Math.max(...orderedRects.map((rect) => rect.crossEnd));
  if (
    pointerCross < crossStart - crossAxisTolerance ||
    pointerCross > crossEnd + crossAxisTolerance
  ) {
    return null;
  }

  let targetIndex = activeIndex;

  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    if (pointerPrimary <= orderedRects[index].end) targetIndex = index;
  }

  for (let index = activeIndex + 1; index < orderedRects.length; index += 1) {
    if (pointerPrimary >= orderedRects[index].start) targetIndex = index;
  }

  return groupSortIntentFromTargetIndex(
    axis,
    activeGroupId,
    orderedRects.map((rect) => rect.groupId),
    targetIndex,
  );
}
