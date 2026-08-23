import { describe, expect, it } from "vitest";
import { createDefaultState, OTHER_GROUP_ID } from "../data/defaults";
import {
  addGroupToState,
  addSiteToState,
  deleteGroupFromState,
  permanentlyDeleteTrashedSiteFromState,
  purgeExpiredTrashFromState,
  restoreAllTrashedSitesFromState,
  restoreTrashedSiteFromState,
  setTrashRetentionInState,
  trashSiteFromState,
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
    expect(withSite.version).toBe(9);
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
    expect(result.version).toBe(9);
  });

  it("deletes a group and moves its sites to trash", () => {
    const initial = createDefaultState();
    const sourceSites = initial.sites.filter((site) => site.groupId === "learning");
    const result = deleteGroupFromState(
      initial,
      "learning",
      "2026-08-09T12:30:00.000Z",
    );

    expect(result.groups.some((group) => group.id === "learning")).toBe(false);
    expect(result.sites).toHaveLength(initial.sites.length - sourceSites.length);
    expect(
      result.deletedSites.map((entry) => ({
        id: entry.site.id,
        groupId: entry.originalGroupId,
        deletedAt: entry.deletedAt,
      })),
    ).toEqual(
      sourceSites.map((site) => ({
        id: site.id,
        groupId: "learning",
        deletedAt: "2026-08-09T12:30:00.000Z",
      })),
    );
    expect(result.sites.map((site) => site.globalOrder).sort((a, b) => a - b)).toEqual(
      result.sites.map((_, index) => index),
    );
  });

  it("does not delete the protected Other group", () => {
    const initial = createDefaultState();
    expect(
      deleteGroupFromState(initial, OTHER_GROUP_ID),
    ).toBe(initial);
  });

  it("restores a deleted site to its original group and appends it", () => {
    const initial = createDefaultState();
    const trashed = trashSiteFromState(initial, "github", "2026-08-01T00:00:00.000Z");
    const restored = restoreTrashedSiteFromState(trashed, "github");

    expect(restored.deletedSites).toHaveLength(0);
    expect(getSitesInGroup(restored.sites, "develop").at(-1)?.id).toBe("github");
  });

  it("restores to Other when the original group no longer exists", () => {
    const initial = createDefaultState();
    const trashed = trashSiteFromState(initial, "github", "2026-08-01T00:00:00.000Z");
    const withoutDevelop = {
      ...trashed,
      groups: trashed.groups.filter((group) => group.id !== "develop"),
    };
    const restored = restoreTrashedSiteFromState(withoutDevelop, "github");

    expect(restored.sites.find((site) => site.id === "github")?.groupId).toBe(
      OTHER_GROUP_ID,
    );
  });

  it("restores all links and supports permanent deletion", () => {
    const first = trashSiteFromState(createDefaultState(), "google");
    const second = trashSiteFromState(first, "github");
    const permanentlyDeleted = permanentlyDeleteTrashedSiteFromState(second, "google");
    expect(permanentlyDeleted.deletedSites.map((entry) => entry.site.id)).toEqual([
      "github",
    ]);
    expect(restoreAllTrashedSitesFromState(permanentlyDeleted).deletedSites).toEqual([]);
  });

  it("purges expired links while allowing never-expire retention", () => {
    const trashed = trashSiteFromState(
      createDefaultState(),
      "google",
      "2026-07-01T00:00:00.000Z",
    );
    const expired = purgeExpiredTrashFromState(
      trashed,
      Date.parse("2026-08-23T00:00:00.000Z"),
    );
    expect(expired.deletedSites).toHaveLength(0);

    const never = setTrashRetentionInState(trashed, null);
    expect(
      purgeExpiredTrashFromState(never, Date.parse("2027-08-23T00:00:00.000Z")),
    ).toBe(never);
  });
});
