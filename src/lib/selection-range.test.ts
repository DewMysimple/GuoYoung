import { describe, expect, it } from "vitest";
import { getInclusiveSelectionRange, toggleRangeSelection } from "./selection-range";

describe("getInclusiveSelectionRange", () => {
  it("selects the inclusive range in either direction", () => {
    const ids = ["one", "two", "three", "four"] as const;

    expect(getInclusiveSelectionRange(ids, "two", "four")).toEqual([
      "two",
      "three",
      "four",
    ]);
    expect(getInclusiveSelectionRange(ids, "four", "two")).toEqual([
      "two",
      "three",
      "four",
    ]);
  });

  it("falls back to the target when the anchor is stale", () => {
    expect(getInclusiveSelectionRange(["one", "two"], "removed", "two")).toEqual([
      "two",
    ]);
  });
});

describe("toggleRangeSelection", () => {
  it("adds reverse ranges, retains the anchor and preserves the input set", () => {
    const selected = new Set(["four"]);
    const result = toggleRangeSelection(selected, ["one", "two", "three", "four"], "four", "two", true);
    expect([...result.ids]).toEqual(["four", "two", "three"]);
    expect(result.anchorId).toBe("four");
    expect([...selected]).toEqual(["four"]);
  });

  it("toggles the target and replaces a missing or stale anchor", () => {
    for (const anchor of [null, "removed"]) {
      const result = toggleRangeSelection(new Set(["two"]), ["one", "two"], anchor, "two", true);
      expect([...result.ids]).toEqual([]);
      expect(result.anchorId).toBe("two");
    }
  });
});
