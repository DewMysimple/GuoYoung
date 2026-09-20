import { expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import { deleteGroupsFromState } from "./site-state";

it("deletes a deduplicated group batch in one immutable update, protecting Other and preserving trash metadata", () => {
  const state = createDefaultState();
  const before = structuredClone(state);
  const result = deleteGroupsFromState(state, ["search", "develop", "search", "other", "absent"], "2026-09-20T14:00:00Z");
  expect(state).toEqual(before);
  expect(result.groups.some(g => g.id === "other")).toBe(true);
  expect(result.groups.some(g => ["search", "develop"].includes(g.id))).toBe(false);
  const removed = before.sites.filter(s => ["search", "develop"].includes(s.groupId));
  expect(result.deletedSites.map(item => item.site.id)).toEqual(removed.map(site => site.id));
  for (const item of result.deletedSites) {
    expect(item.originalGroupName).toBe(before.groups.find(g => g.id === item.site.groupId)?.name);
    expect(item.deletedAt).toBe("2026-09-20T14:00:00Z");
  }
  expect(deleteGroupsFromState(result, ["search", "other"])).toBe(result);
});
