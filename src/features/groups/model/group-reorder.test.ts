import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GROUPS } from "../../../data/defaults";
import type { SiteGroup } from "../../../types";
import { reorderGroupBlock, reorderGroups } from "./group-reorder";

const refreshedAt = "2026-11-01T00:23:45.678Z";
const originalTime = "2020-01-01T00:00:00.000Z";
function group(id: string, order: number, isProtected = false): SiteGroup {
  return { id, name: id, icon: "folder", workspace: "main", order,
    isProtected, createdAt: originalTime, updatedAt: originalTime };
}
function unsortedGroups() {
  return [group("protected-b", 8, true), group("c", 4), group("a", 1),
    group("protected-a", 3, true), group("b", 2)];
}

afterEach(() => { vi.useRealTimers(); });

describe("group reorder model", () => {
  // These four scenarios moved from the legacy site-utils suite.
  it("reorders ordinary groups while keeping the protected group last", () => {
    const reordered = reorderGroups(DEFAULT_GROUPS, "design", "search");
    expect(reordered[0].id).toBe("design");
    expect(reordered.at(-1)?.id).toBe("other");
    expect(reordered.at(-1)?.isProtected).toBe(true);
  });

  it("moves an ordinary group to the end before protected groups", () => {
    const reordered = reorderGroups(DEFAULT_GROUPS, "search", null);
    expect(reordered.at(-2)?.id).toBe("search");
    expect(reordered.at(-1)?.id).toBe("other");
  });

  it("moves non-contiguous selected groups as one stable block", () => {
    const reordered = reorderGroupBlock(DEFAULT_GROUPS, ["search", "design"], "media");
    expect(reordered.map((group) => group.id)).toEqual([
      "develop", "search", "design", "media", "learn", "other",
    ]);
  });

  it("ignores protected groups in a block and keeps Other last", () => {
    const reordered = reorderGroupBlock(DEFAULT_GROUPS, ["other", "search"], null);
    expect(reordered.at(-2)?.id).toBe("search");
    expect(reordered.at(-1)?.id).toBe("other");
  });

  it.each([
    ["c", "a", ["c", "a", "b", "protected-a", "protected-b"]],
    ["a", "c", ["b", "a", "c", "protected-a", "protected-b"]],
    ["a", null, ["b", "c", "a", "protected-a", "protected-b"]],
  ] as const)("moves %s before %s, normalizes orders and only timestamps the moved group", (active, before, ids) => {
    vi.useFakeTimers(); vi.setSystemTime(refreshedAt);
    const input = unsortedGroups();
    const original = structuredClone(input);
    const output = reorderGroups(input, active, before);
    expect(output.map(g => g.id)).toEqual(ids);
    expect(output.map(g => g.order)).toEqual([0, 1, 2, 3, 4]);
    expect(output.find(g => g.id === active)?.updatedAt).toBe(refreshedAt);
    expect(output.filter(g => g.id !== active).every(g => g.updatedAt === originalTime)).toBe(true);
    expect(output.every(g => g.createdAt === originalTime)).toBe(true);
    expect(input).toEqual(original);
    expect(output).not.toBe(input);
    expect(output.every(g => !input.includes(g))).toBe(true);
  });

  it("ignores duplicate, unknown and protected active IDs while keeping a stable block", () => {
    vi.useFakeTimers(); vi.setSystemTime(refreshedAt);
    const output = reorderGroupBlock(unsortedGroups(), ["c", "a", "a", "missing", "protected-a"], "b");
    expect(output.map(g => g.id)).toEqual(["a", "c", "b", "protected-a", "protected-b"]);
    expect(output.filter(g => g.updatedAt === refreshedAt).map(g => g.id)).toEqual(["a", "c"]);
  });

  it.each([
    [[], null], [["missing"], null], [["protected-a"], "a"],
    [["a"], "missing"], [["a"], "protected-a"], [["a"], "a"],
    [["a", "b", "c"], "b"],
  ] as [string[], string | null][])("normalizes an invalid move %j before %s without refreshing timestamps", (activeIds, before) => {
    vi.useFakeTimers(); vi.setSystemTime(refreshedAt);
    const input = unsortedGroups();
    const original = structuredClone(input);
    const output = reorderGroupBlock(input, activeIds, before);
    expect(output.map(g => g.id)).toEqual(["a", "b", "c", "protected-a", "protected-b"]);
    expect(output.map(g => g.order)).toEqual([0, 1, 2, 3, 4]);
    expect(output.every(g => g.updatedAt === originalTime)).toBe(true);
    expect(input).toEqual(original);
    expect(output).not.toBe(input);
    expect(output.every(g => !input.includes(g))).toBe(true);
  });

  it("preserves the original relative order when ordinary and protected orders tie", () => {
    const input = [group("b", 2), group("protected-b", 1, true), group("a", 2), group("protected-a", 1, true)];
    expect(reorderGroupBlock(input, [], null).map(g => g.id)).toEqual(["b", "a", "protected-b", "protected-a"]);
  });

  it("leaves workspace scoping to the caller", () => {
    const input = [group("a", 0), { ...group("b", 1), workspace: "github" as const }, group("other", 2, true)];
    expect(reorderGroups(input, "b", "a").map(g => g.id)).toEqual(["b", "a", "other"]);
  });

  it("reads the clock on each valid operation, including an unchanged final position", () => {
    vi.useFakeTimers(); vi.setSystemTime(refreshedAt);
    const first = reorderGroups([group("a", 0), group("b", 1)], "b", null);
    expect(first[1].updatedAt).toBe(refreshedAt);
    vi.setSystemTime("2026-11-02T00:23:45.678Z");
    expect(reorderGroups(first, "b", null)[1].updatedAt).toBe("2026-11-02T00:23:45.678Z");
  });

  it("returns a new empty array for empty input", () => {
    const input: SiteGroup[] = [];
    const output = reorderGroups(input, "missing", null);
    expect(output).toEqual([]);
    expect(output).not.toBe(input);
  });
});
