import { describe, expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import { getGroupedSiteSections } from "./grouped-sites";

const defaults = createDefaultState();
const groups = defaults.groups.filter((group) => ["search", "design", "other"].includes(group.id));
const sites = [
  { ...defaults.sites[0], id: "later", groupId: "search", order: 2, globalOrder: 0, clickCount: 3 },
  { ...defaults.sites[0], id: "design", groupId: "design", order: 0, globalOrder: 1, clickCount: 8 },
  { ...defaults.sites[0], id: "earlier", groupId: "search", order: 0, globalOrder: 2, clickCount: 3 },
];

describe("grouped site sections", () => {
  it("keeps empty sections and uses group manual order without mutating flat input", () => {
    const before = structuredClone(sites);
    const sections = getGroupedSiteSections(groups, sites, "manual", false);
    expect(sections.map(({ group }) => group.id)).toEqual(["search", "design", "other"]);
    expect(sections.map(({ sites }) => sites.map((site) => site.id)))
      .toEqual([["earlier", "later"], ["design"], []]);
    expect(sites).toEqual(before);
  });

  it("breaks equal heat ties by group order instead of global order", () => {
    expect(getGroupedSiteSections(groups, sites, "heat", false)[0].sites.map((site) => site.id))
      .toEqual(["earlier", "later"]);
  });

  it.each(["name-asc", "name-desc", "newest", "oldest"] as const)("preserves precomputed %s order within each section", (mode) => {
    expect(getGroupedSiteSections(groups, sites, mode, false)[0].sites.map((site) => site.id))
      .toEqual(["later", "earlier"]);
  });

  it("omits empty search sections and ignores sites from other workspaces", () => {
    const input = [...sites, { ...sites[0], id: "external", groupId: "github-repos" }];
    expect(getGroupedSiteSections(groups, input, "manual", true).map(({ group }) => group.id))
      .toEqual(["search", "design"]);
  });
});
