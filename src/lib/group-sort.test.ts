import { describe, expect, it } from "vitest";
import {
  groupSortIntentFromTargetIndex,
  resolveGroupSortIntent,
  type GroupSortRect,
} from "./group-sort";

const verticalRects: GroupSortRect[] = [
  { groupId: "search", start: 0, end: 180, crossStart: 20, crossEnd: 980 },
  { groupId: "video", start: 220, end: 520, crossStart: 20, crossEnd: 980 },
  { groupId: "design", start: 560, end: 900, crossStart: 20, crossEnd: 980 },
];

describe("group sort boundary intent", () => {
  it("responds as soon as an upward pointer reaches the previous bottom edge", () => {
    expect(
      resolveGroupSortIntent({
        axis: "vertical",
        activeGroupId: "video",
        pointerPrimary: 181,
        pointerCross: 200,
        orderedRects: verticalRects,
      }),
    ).toBeNull();
    expect(
      resolveGroupSortIntent({
        axis: "vertical",
        activeGroupId: "video",
        pointerPrimary: 180,
        pointerCross: 200,
        orderedRects: verticalRects,
      }),
    ).toMatchObject({ beforeGroupId: "search" });
  });

  it("responds as soon as a downward pointer reaches the next top edge", () => {
    expect(
      resolveGroupSortIntent({
        axis: "vertical",
        activeGroupId: "video",
        pointerPrimary: 559,
        pointerCross: 200,
        orderedRects: verticalRects,
      }),
    ).toBeNull();
    expect(
      resolveGroupSortIntent({
        axis: "vertical",
        activeGroupId: "video",
        pointerPrimary: 560,
        pointerCross: 200,
        orderedRects: verticalRects,
      }),
    ).toMatchObject({ beforeGroupId: null });
  });

  it("clears the prediction after reversing into the original slot", () => {
    expect(
      resolveGroupSortIntent({
        axis: "vertical",
        activeGroupId: "video",
        pointerPrimary: 400,
        pointerCross: 200,
        orderedRects: verticalRects,
      }),
    ).toBeNull();
  });

  it("rejects a pointer outside the sortable cross-axis corridor", () => {
    expect(
      resolveGroupSortIntent({
        axis: "vertical",
        activeGroupId: "video",
        pointerPrimary: 100,
        pointerCross: 1200,
        orderedRects: verticalRects,
      }),
    ).toBeNull();
  });

  it("uses the same insertion model for horizontal and keyboard sorting", () => {
    expect(
      groupSortIntentFromTargetIndex(
        "horizontal",
        "search",
        ["search", "video", "design"],
        2,
      ),
    ).toEqual({
      axis: "horizontal",
      activeGroupId: "search",
      beforeGroupId: null,
    });
  });
});
