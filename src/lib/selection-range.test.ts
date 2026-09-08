import { describe, expect, it } from "vitest";
import { getInclusiveSelectionRange } from "./selection-range";

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
