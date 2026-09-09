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
  mergeGroupImportIntoState,
  findSiteByUrl,
  getGithubRepositoryStatus,
  importGithubRepositoryBatchToState,
  importGithubRepositoriesToState,
} from "./site-state";
import type {
  GithubOwnerProfile,
  GithubRepositorySummary,
} from "./github-repository-api";
import { createGroupExportPayload } from "./data-transfer";
import { getSitesInGroup } from "./site-utils";

describe("site state operations", () => {
  it("adds a site and preserves global order when moving an existing URL", () => {
    const initial = createDefaultState();
    const github = initial.sites.find((site) => site.id === "github")!;
    const moved = updateSiteInState(initial, github.id, {
      name: "GitHub 工作区",
      url: "https://github.com/DewMysimple/GuoYoung",
      groupId: "github-other",
      customIconUrl: "",
      iconSource: "auto",
    }, "2026-01-01T00:00:00.000Z");

    expect(moved.sites).toHaveLength(initial.sites.length);
    expect(moved.sites.find((site) => site.id === github.id)).toMatchObject({
      name: "GitHub 工作区",
      groupId: "github-other",
      globalOrder: github.globalOrder,
      createdAt: github.createdAt,
    });
    expect(
      getSitesInGroup(moved.sites, "github-other").at(-1)?.id,
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
    expect(withSite.version).toBe(14);
    expect(withSite.groups.find((group) => group.id === "database-group")?.name).toBe("数据库");
    expect(withSite.sites.find((site) => site.id === "postgres")?.groupId).toBe("database-group");
  });

  it("routes GitHub links added from the main workspace to GitHub Other", () => {
    const result = addSiteToState(
      createDefaultState(),
      {
        name: "GitHub Gist",
        url: "https://gist.github.com/example/1",
        groupId: "design",
        customIconUrl: "",
        iconSource: "auto",
      },
      "gist",
    );
    expect(result.sites.find((site) => site.id === "gist")?.groupId).toBe(
      "github-other",
    );
  });

  it("rejects non-GitHub links inside the GitHub workspace", () => {
    expect(() =>
      addSiteToState(createDefaultState(), {
        name: "Example",
        url: "https://example.com",
        groupId: "github-tools",
        customIconUrl: "",
        iconSource: "auto",
      }),
    ).toThrow("GitHub 页面只允许添加");
  });

  it("keeps the official GitHub homepage out of ordinary GitHub groups", () => {
    expect(() =>
      addSiteToState(createDefaultState(), {
        name: "GitHub",
        url: "https://github.com/",
        groupId: "github-other",
        customIconUrl: "",
        iconSource: "auto",
      }),
    ).toThrow("GitHub 官方主页请通过顶部入口管理");
  });

  it("treats github.com and www.github.com roots as one shared URL", () => {
    const state = createDefaultState();
    expect(findSiteByUrl(state.sites, "https://www.github.com/")?.id).toBe("github");
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
    const ordered = result.groups
      .filter((group) => group.workspace === "main")
      .slice()
      .sort((a, b) => a.order - b.order);
    expect(ordered.slice(0, 3).map((group) => group.id)).toEqual([
      "search",
      "middle",
      "develop",
    ]);
    expect(ordered.at(-1)?.id).toBe(OTHER_GROUP_ID);
    expect(result.version).toBe(14);
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

  it("appends a group package, skips global URL duplicates, and preserves the target group", () => {
    const initial = createDefaultState();
    const payload = createGroupExportPayload(initial, "design", "2026-08-24T00:00:00.000Z");
    payload.sites = [
      payload.sites[0],
      { ...payload.sites[0], name: "Figma duplicate" },
      {
        name: "Example",
        url: "https://example.com",
        iconSource: "auto",
        order: 2,
      },
      {
        name: "Google duplicate in another group",
        url: "https://www.google.com",
        order: 3,
      },
    ];
    const target = initial.groups.find((group) => group.id === "develop")!;
    const result = mergeGroupImportIntoState(
      initial,
      target.id,
      payload,
      "2026-08-24T12:00:00.000Z",
    );

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(3);
    expect(result.state.groups.find((group) => group.id === target.id)).toEqual(target);
    expect(getSitesInGroup(result.state.sites, target.id).at(-1)).toMatchObject({
      name: "Example",
      url: "https://example.com",
      groupId: target.id,
      createdAt: "2026-08-24T12:00:00.000Z",
    });
    expect(result.state.deletedSites).toEqual(initial.deletedSites);
  });

  it("allows importing websites into the protected Other group without changing its metadata", () => {
    const initial = createDefaultState();
    const payload = createGroupExportPayload(initial, "design");
    payload.sites = payload.sites.map((site, index) => ({
      ...site,
      url: `https://shared-${index}.example.com`,
    }));
    const result = mergeGroupImportIntoState(initial, OTHER_GROUP_ID, payload);
    expect(result.added).toBe(payload.sites.length);
    expect(result.state.groups.find((group) => group.id === OTHER_GROUP_ID)).toEqual(
      initial.groups.find((group) => group.id === OTHER_GROUP_ID),
    );
    expect(getSitesInGroup(result.state.sites, OTHER_GROUP_ID)).toHaveLength(
      initial.sites.filter((site) => site.groupId === OTHER_GROUP_ID).length +
        payload.sites.length,
    );
  });

  it("filters non-GitHub entries from a GitHub group package", () => {
    const initial = createDefaultState();
    const payload = createGroupExportPayload(initial, "design");
    payload.sites = [
      { ...payload.sites[0], url: "https://github.com/example/repo" },
      { ...payload.sites[0], url: "https://example.com" },
    ];
    const result = mergeGroupImportIntoState(initial, "github-tools", payload);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.state.sites.find((site) => site.url.includes("github.com/example"))?.groupId)
      .toBe("github-tools");
  });

  it("creates an author group, records its source, and skips active or deleted URLs", () => {
    const initial = createDefaultState();
    const withExisting = addSiteToState(
      initial,
      {
        name: "Already there",
        url: "https://github.com/acme/already-there",
        groupId: "github-other",
        customIconUrl: "",
        iconSource: "auto",
      },
      "existing-acme-repo",
    );
    const withDeletedCandidate = addSiteToState(
      withExisting,
      {
        name: "Deleted before",
        url: "https://github.com/acme/deleted-before",
        groupId: "github-other",
        customIconUrl: "",
        iconSource: "auto",
      },
      "deleted-acme-repo",
    );
    const deleted = trashSiteFromState(
      withDeletedCandidate,
      "deleted-acme-repo",
    );
    const owner: GithubOwnerProfile = {
      login: "acme",
      profileUrl: "https://github.com/acme",
      entityType: "organization",
    };
    const repositories: GithubRepositorySummary[] = [
      {
        id: 1,
        name: "new-repo",
        fullName: "acme/new-repo",
        htmlUrl: "https://github.com/acme/new-repo",
        fork: false,
        archived: false,
      },
      {
        id: 2,
        name: "already-there",
        fullName: "acme/already-there",
        htmlUrl: "https://github.com/acme/already-there",
        fork: false,
        archived: false,
      },
      {
        id: 3,
        name: "deleted-before",
        fullName: "acme/deleted-before",
        htmlUrl: "https://github.com/acme/deleted-before",
        fork: false,
        archived: false,
      },
    ];

    const result = importGithubRepositoriesToState(
      deleted,
      owner,
      repositories,
      undefined,
      "2026-08-27T01:00:00.000Z",
    );

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.skippedActive).toBe(1);
    expect(result.skippedDeleted).toBe(1);
    expect(result.group).toMatchObject({
      name: "acme",
      workspace: "github",
      githubImportSource: {
        login: "acme",
        entityType: "organization",
        lastFetchedAt: "2026-08-27T01:00:00.000Z",
      },
    });
    expect(
      result.state.sites.find((site) => site.url.includes("acme/new-repo")),
    ).toMatchObject({ name: "new-repo", groupId: result.group?.id });
  });

  it("reuses a matching source group and only appends missing repositories", () => {
    const initial = createDefaultState();
    const owner: GithubOwnerProfile = {
      login: "acme",
      profileUrl: "https://github.com/acme",
      entityType: "user",
    };
    const first = importGithubRepositoriesToState(initial, owner, [
      {
        id: 1,
        name: "one",
        fullName: "acme/one",
        htmlUrl: "https://github.com/acme/one",
        fork: false,
        archived: false,
      },
    ]);
    const imported = first.state.sites.find((site) => site.name === "one")!;
    const customized = {
      ...first.state,
      sites: first.state.sites.map((site) =>
        site.id === imported.id ? { ...site, name: "手动命名" } : site,
      ),
    };
    const second = importGithubRepositoriesToState(customized, owner, [
      {
        id: 1,
        name: "one from API",
        fullName: "acme/one",
        htmlUrl: "https://github.com/acme/one",
        fork: false,
        archived: false,
      },
      {
        id: 2,
        name: "two",
        fullName: "acme/two",
        htmlUrl: "https://github.com/acme/two",
        fork: true,
        archived: true,
      },
    ]);

    expect(second.group?.id).toBe(first.group?.id);
    expect(second.added).toBe(1);
    expect(second.skippedActive).toBe(1);
    expect(second.state.sites.find((site) => site.id === imported.id)?.name).toBe(
      "手动命名",
    );
    expect(second.state.groups.filter((group) => group.name === "acme")).toHaveLength(1);
    expect(getGithubRepositoryStatus(second.state, {
      id: 2,
      name: "two",
      fullName: "acme/two",
      htmlUrl: "https://github.com/acme/two",
      fork: true,
      archived: true,
    })).toBe("active");
  });

  it("refreshes multiple GitHub author groups in one state update", () => {
    const initial = createDefaultState();
    const acme: GithubOwnerProfile = {
      login: "acme",
      profileUrl: "https://github.com/acme",
      entityType: "organization",
    };
    const octo: GithubOwnerProfile = {
      login: "octo",
      profileUrl: "https://github.com/octo",
      entityType: "user",
    };
    const first = importGithubRepositoriesToState(initial, acme, [
      {
        id: 1,
        name: "one",
        fullName: "acme/one",
        htmlUrl: "https://github.com/acme/one",
        fork: false,
        archived: false,
      },
    ]);
    const second = importGithubRepositoriesToState(first.state, octo, [
      {
        id: 2,
        name: "two",
        fullName: "octo/two",
        htmlUrl: "https://github.com/octo/two",
        fork: false,
        archived: false,
      },
    ]);

    const refreshed = importGithubRepositoryBatchToState(
      second.state,
      [
        {
          owner: acme,
          repositories: [
            {
              id: 1,
              name: "one",
              fullName: "acme/one",
              htmlUrl: "https://github.com/acme/one",
              fork: false,
              archived: false,
            },
            {
              id: 3,
              name: "three",
              fullName: "acme/three",
              htmlUrl: "https://github.com/acme/three",
              fork: false,
              archived: false,
            },
          ],
        },
        {
          owner: octo,
          repositories: [
            {
              id: 2,
              name: "two",
              fullName: "octo/two",
              htmlUrl: "https://github.com/octo/two",
              fork: false,
              archived: false,
            },
            {
              id: 4,
              name: "four",
              fullName: "octo/four",
              htmlUrl: "https://github.com/octo/four",
              fork: false,
              archived: false,
            },
          ],
        },
      ],
      "2026-09-09T10:00:00.000Z",
    );

    expect(refreshed.refreshedOwners).toBe(2);
    expect(refreshed.added).toBe(2);
    expect(refreshed.skippedActive).toBe(2);
    expect(refreshed.state.sites.map((site) => site.name)).toEqual(
      expect.arrayContaining(["one", "three", "two", "four"]),
    );
    expect(
      refreshed.state.groups
        .filter((group) => group.githubImportSource)
        .map((group) => group.githubImportSource?.lastFetchedAt),
    ).toEqual(["2026-09-09T10:00:00.000Z", "2026-09-09T10:00:00.000Z"]);
  });

  it("creates a suffixed author group when a same-name group belongs to another source", () => {
    const initial = createDefaultState();
    const groupState = addGroupToState(
      initial,
      "acme",
      "user-circle",
      "acme-existing",
      "2026-08-27T01:00:00.000Z",
      undefined,
      "github",
    );
    const state = {
      ...groupState,
      groups: groupState.groups.map((group) =>
        group.id === "acme-existing"
          ? {
              ...group,
              githubImportSource: {
                login: "other",
                profileUrl: "https://github.com/other",
                entityType: "user" as const,
              },
            }
          : group,
      ),
    };
    const result = importGithubRepositoriesToState(
      state,
      {
        login: "acme",
        profileUrl: "https://github.com/acme",
        entityType: "user",
      },
      [{
        id: 1,
        name: "repo",
        fullName: "acme/repo",
        htmlUrl: "https://github.com/acme/repo",
        fork: false,
        archived: false,
      }],
    );
    expect(result.group?.name).toBe("acme-2");
  });
});
