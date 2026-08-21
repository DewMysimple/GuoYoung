import { describe, expect, it } from "vitest";
import { createDefaultState, OTHER_GROUP_ID } from "../data/defaults";
import {
  addGroupToState,
  addSiteToState,
  deleteGroupFromState,
  updateSiteInState,
} from "./site-state";
import { getSitesInGroup } from "./site-utils";

describe("site state operations", () => {
  it("adds a site and preserves global order when moving an existing URL", () => {
    const initial = createDefaultState();
    const github = initial.sites.find((site) => site.id === "github")!;
    const moved = updateSiteInState(initial, github.id, {
      name: "GitHub 工作区",
      url: github.url,
      groupId: "design",
      customIconUrl: "",
      iconSource: "auto",
    }, "2026-01-01T00:00:00.000Z");

    expect(moved.sites).toHaveLength(initial.sites.length);
    expect(moved.sites.find((site) => site.id === github.id)).toMatchObject({
      name: "GitHub 工作区",
      groupId: "design",
      globalOrder: github.globalOrder,
      createdAt: github.createdAt,
    });
    expect(
      getSitesInGroup(moved.sites, "design").at(-1)?.id,
    ).toBe("github");
  });

  it("adds groups and sites without changing the state version", () => {
    const withGroup = addGroupToState(
      createDefaultState(),
      "数据库",
      "database",
      "database-group",
    );
    const withSite = addSiteToState(withGroup, {
      name: "Postgres",
      url: "https://postgresql.org",
      groupId: "database-group",
      customIconUrl: "",
      iconSource: "auto",
    }, "postgres");
    expect(withSite.version).toBe(8);
    expect(withSite.groups.find((group) => group.id === "database-group")?.name).toBe("数据库");
    expect(withSite.sites.find((site) => site.id === "postgres")?.groupId).toBe("database-group");
  });

  it("inserts a group before an existing group without moving Other", () => {
    const result = addGroupToState(
      createDefaultState(),
      "中间分组",
      "folder",
      "middle",
      "2026-08-16T00:00:00.000Z",
      "develop",
    );
    const ordered = result.groups.slice().sort((a, b) => a.order - b.order);
    expect(ordered.slice(0, 3).map((group) => group.id)).toEqual([
      "search",
      "middle",
      "develop",
    ]);
    expect(ordered.at(-1)?.id).toBe(OTHER_GROUP_ID);
    expect(result.version).toBe(8);
  });

  it("deletes a group and appends its sites to Other", () => {
    const initial = createDefaultState();
    const sourceSites = initial.sites.filter((site) => site.groupId === "learning");
    const result = deleteGroupFromState(
      initial,
      "learning",
      "move-to-other",
      "2026-08-09T12:30:00.000Z",
    );

    expect(result.groups.some((group) => group.id === "learning")).toBe(false);
    expect(result.sites).toHaveLength(initial.sites.length);
    expect(
      result.sites
        .filter((site) => sourceSites.some((source) => source.id === site.id))
        .map((site) => ({ groupId: site.groupId, updatedAt: site.updatedAt })),
    ).toEqual(
      sourceSites.map(() => ({
        groupId: OTHER_GROUP_ID,
        updatedAt: "2026-08-09T12:30:00.000Z",
      })),
    );
    expect(getSitesInGroup(result.sites, OTHER_GROUP_ID).map((site) => site.order)).toEqual(
      sourceSites.map((_, index) => index),
    );
  });

  it("deletes a group together with all of its sites and reindexes the remainder", () => {
    const initial = createDefaultState();
    const removedIds = new Set(
      initial.sites
        .filter((site) => site.groupId === "learning")
        .map((site) => site.id),
    );
    const result = deleteGroupFromState(
      initial,
      "learning",
      "delete-sites",
    );

    expect(result.groups.some((group) => group.id === "learning")).toBe(false);
    expect(result.sites.some((site) => removedIds.has(site.id))).toBe(false);
    expect(result.sites.map((site) => site.globalOrder).sort((a, b) => a - b)).toEqual(
      result.sites.map((_, index) => index),
    );
  });

  it("does not delete the protected Other group", () => {
    const initial = createDefaultState();
    expect(
      deleteGroupFromState(initial, OTHER_GROUP_ID, "delete-sites"),
    ).toBe(initial);
  });
});
