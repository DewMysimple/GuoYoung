import { describe, expect, it } from "vitest";
import { createDefaultState, GITHUB_OTHER_GROUP_ID, OTHER_GROUP_ID } from "../data/defaults";
import {
  ensureGithubWorkspace,
  isGithubHomeUrl,
  isGithubUrl,
  moveGithubHomeToMainInState,
  migrateGithubSitesInState,
  routeGithubSitesInState,
  undoGithubMigrationInState,
} from "./github-workspace";

describe("GitHub workspace", () => {
  it("recognizes GitHub hosts without matching lookalike domains", () => {
    expect(isGithubUrl("https://github.com/openai/openai" )).toBe(true);
    expect(isGithubUrl("https://www.github.com" )).toBe(true);
    expect(isGithubUrl("https://gist.github.com/user/123" )).toBe(true);
    expect(isGithubUrl("https://docs.github.com/en" )).toBe(true);
    expect(isGithubUrl("https://github.io/project" )).toBe(false);
    expect(isGithubUrl("https://notgithub.com" )).toBe(false);
    expect(isGithubUrl("https://github.com.evil.example" )).toBe(false);
    expect(isGithubUrl("not a URL" )).toBe(false);
  });

  it("recognizes only the GitHub root as the shared official homepage", () => {
    expect(isGithubHomeUrl("https://github.com")).toBe(true);
    expect(isGithubHomeUrl("https://www.github.com/")).toBe(true);
    expect(isGithubHomeUrl("https://github.com/openai/openai")).toBe(false);
    expect(isGithubHomeUrl("https://github.com.evil.example/")).toBe(false);
    expect(isGithubHomeUrl("https://github.io/")).toBe(false);
  });

  function migrationFixture() {
    const state = createDefaultState();
    return {
      ...state,
      sites: state.sites.map((site) =>
        site.id === "github"
          ? { ...site, url: "https://github.com/DewMysimple/GuoYoung" }
          : site,
      ),
    };
  }

  it("adds the protected GitHub groups and migrates existing links once", () => {
    const initial = migrationFixture();
    const first = migrateGithubSitesInState(
      initial,
      "2026-08-27T00:00:00.000Z",
    );

    expect(first.movedCount).toBe(1);
    expect(first.state.groups.filter((group) => group.workspace === "github"))
      .toHaveLength(4);
    expect(first.state.sites.filter((site) => isGithubUrl(site.url))).toHaveLength(1);
    expect(first.state.sites.find((site) => site.id === "github")?.groupId).toBe(
      GITHUB_OTHER_GROUP_ID,
    );
    expect(first.state.githubMigration).toMatchObject({
      status: "completed",
      entries: [
        expect.objectContaining({
          siteId: "github",
          fromGroupId: "develop",
          targetGroupId: GITHUB_OTHER_GROUP_ID,
        }),
      ],
    });

    const repeated = migrateGithubSitesInState(first.state);
    expect(repeated.movedCount).toBe(0);
    expect(repeated.state).toEqual(first.state);
  });

  it("routes imported or newly added main-workspace links without duplicating them", () => {
    const initial = createDefaultState();
    const routed = routeGithubSitesInState(
      {
        ...initial,
        sites: [
          ...initial.sites,
          {
            ...initial.sites[0],
            id: "gist",
            name: "Gist",
            url: "https://gist.github.com/example/1",
            groupId: "design",
            order: 2,
            globalOrder: initial.sites.length,
          },
        ],
      },
      "2026-08-27T00:00:00.000Z",
    );

    expect(routed.movedCount).toBe(1);
    expect(routed.state.sites.filter((site) => site.groupId === GITHUB_OTHER_GROUP_ID))
      .toHaveLength(1);
    expect(routed.state.sites).toHaveLength(initial.sites.length + 1);
  });

  it("undoes only links that are still in the migration target", () => {
    const initial = migrationFixture();
    const migrated = migrateGithubSitesInState(
      initial,
      "2026-08-27T00:00:00.000Z",
    ).state;
    const manuallyMoved = {
      ...migrated,
      sites: migrated.sites.map((site) =>
        site.id === "github" ? { ...site, groupId: "github-tools" } : site,
      ),
    };

    const undone = undoGithubMigrationInState(
      manuallyMoved,
      "2026-08-27T01:00:00.000Z",
    );

    expect(undone.restoredCount).toBe(0);
    expect(undone.skippedCount).toBe(1);
    expect(undone.state.sites.find((site) => site.id === "github")?.groupId).toBe(
      "github-tools",
    );
    expect(undone.state.githubMigration?.status).toBe("undone");
  });

  it("does not restore links edited after migration", () => {
    const migrated = migrateGithubSitesInState(
      migrationFixture(),
      "2026-08-27T00:00:00.000Z",
    ).state;
    const edited = {
      ...migrated,
      sites: migrated.sites.map((site) =>
        site.id === "github" ? { ...site, name: "My GitHub" } : site,
      ),
    };

    const undone = undoGithubMigrationInState(
      edited,
      "2026-08-27T01:00:00.000Z",
    );

    expect(undone.restoredCount).toBe(0);
    expect(undone.skippedCount).toBe(1);
    expect(undone.state.sites.find((site) => site.id === "github")?.name).toBe(
      "My GitHub",
    );
  });

  it("falls back to the main Other group when the original group was removed", () => {
    const initial = migrationFixture();
    const migrated = migrateGithubSitesInState(initial).state;
    const withoutSource = {
      ...migrated,
      groups: migrated.groups.filter((group) => group.id !== "develop"),
    };

    const undone = undoGithubMigrationInState(withoutSource);
    expect(undone.restoredCount).toBe(1);
    expect(undone.state.sites.find((site) => site.id === "github")?.groupId).toBe(
      OTHER_GROUP_ID,
    );
  });

  it("keeps workspace repair idempotent", () => {
    const state = createDefaultState();
    const repaired = ensureGithubWorkspace({
      ...state,
      groups: state.groups.filter((group) => group.workspace === "main"),
    });
    const repairedAgain = ensureGithubWorkspace(repaired);
    expect(repaired.groups).toHaveLength(10);
    expect(repairedAgain.groups).toEqual(repaired.groups);
  });

  it("keeps the shared official homepage in its original group during migration", () => {
    const initial = createDefaultState();
    const migrated = migrateGithubSitesInState(initial).state;
    expect(migrated.sites.find((site) => site.id === "github")?.groupId).toBe("develop");
    expect(migrated.githubMigration?.entries).toEqual([]);
  });

  it("moves an old GitHub-workspace homepage back to the protected main group", () => {
    const initial = createDefaultState();
    const oldLocation = {
      ...initial,
      sites: initial.sites.map((site) =>
        site.id === "github" ? { ...site, groupId: GITHUB_OTHER_GROUP_ID } : site,
      ),
    };
    const moved = moveGithubHomeToMainInState(oldLocation, "github");
    expect(moved.sites.find((site) => site.id === "github")?.groupId).toBe(OTHER_GROUP_ID);
  });
});
