import { describe, expect, it } from "vitest";
import { createDefaultState, STATE_VERSION } from "../data/defaults";
import type { CollectionEntryId, SiteCollectionState, SiteGroup, SiteWorkspace } from "../types";
import type { ChromiumExtensionApi } from "./browser-runtime";
import { ensureGithubWorkspace, getWorkspaceGroups } from "./github-workspace";
import {
  commitGroupEntriesToState,
  folderEntryId,
  getGroupEntries,
  getGroupPath,
  getGroupSiteCounts,
  getRootGroups,
  normalizeCollectionHierarchy,
  siteEntryId,
} from "./group-hierarchy";
import {
  addGroupToState,
  addSiteToState,
  deleteGroupFromState,
  deleteGroupsFromState,
  importGithubRepositoriesToState,
  moveSitesToGroupInState,
  restoreTrashedSiteFromState,
  trashSiteFromState,
  updateGroupInState,
} from "./site-state";
import { getSitesInGroup, reorderSites } from "./site-utils";
import { createSiteHubStore } from "./state-store";
import { parseStoredState, STORAGE_KEY } from "./storage";

const now = "2026-11-06T00:00:00.000Z";
const folderX = folderEntryId("folder-x");
const folderY = folderEntryId("folder-y");
const siteA = siteEntryId("site-a");
const siteB = siteEntryId("site-b");
const groupById = (state: SiteCollectionState, id: string) => state.groups.find((group) => group.id === id)!;

function withSite(state: SiteCollectionState, id: string, groupId: string, url = `https://${id}.example.test/`) {
  return addSiteToState(state, { name: id, groupId, url, customIconUrl: "", iconSource: "auto" }, id, now);
}

function withGroup(state: SiteCollectionState, id: string, parentId?: string, workspace: SiteWorkspace = "main") {
  return addGroupToState(state, id, "folder", id, now, undefined, workspace, parentId);
}

function withFolders() {
  let state: SiteCollectionState = { ...createDefaultState(), sites: [], trashRetentionDays: null };
  state = withSite(state, "site-a", "design");
  state = withSite(state, "site-b", "design");
  state = withGroup(state, "folder-x", "design");
  state = withGroup(state, "folder-y", "design");
  return state;
}

function entryIds(state: SiteCollectionState, id = "design", sortMode: "manual" | "name-asc" = "manual") {
  const sites = getSitesInGroup(state.sites, id);
  if (sortMode === "name-asc") sites.sort((a, b) => a.name.localeCompare(b.name));
  return getGroupEntries(groupById(state, id), state.groups, sites, sortMode).map((entry) => entry.id);
}

describe("two-level group hierarchy", () => {
  it("keeps valid legacy collection, preferences and trash identical on migration and reread", () => {
    const defaults = { ...createDefaultState(), trashRetentionDays: null };
    const legacy = {
      ...trashSiteFromState(defaults, "google", now),
      version: 28,
      sortMode: "name-desc",
      sortModeByWorkspace: { main: "name-desc", github: "heat" },
      wallpaper: { ...defaults.wallpaper, source: "url", url: "https://wallpaper.example.test/sky.png" },
    };
    legacy.sites = legacy.sites.map((site) => site.id === "figma"
      ? { ...site, note: "设计备注", clickCount: 17, order: 23, globalOrder: 49 }
      : site);
    const loaded = parseStoredState(JSON.stringify(legacy));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state).toEqual({ ...legacy, version: STATE_VERSION });
    expect(getRootGroups(loaded.state.groups)).toEqual(loaded.state.groups);
    expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
  });

  it("promotes malformed relations without dropping sites and cleans mixed order in one pass", () => {
    const state = withSite(withFolders(), "site-inside", "folder-x");
    const root = groupById(state, "design");
    const rawGroup = (id: string, parentId: string, workspace: SiteWorkspace = "main"): SiteGroup =>
      ({ ...root, id, name: id, parentId, workspace, order: 200 });
    const malformed = {
      ...state,
      groups: state.groups.map((group) => {
        if (group.id === "design") return { ...group, entryOrder: [folderY, siteB, "unknown", siteB, 9, folderX] };
        if (group.id === "other") return { ...group, parentId: "design" };
        return group;
      }).concat([
        rawGroup("missing", "absent"),
        rawGroup("self", "self"),
        rawGroup("cycle-1", "cycle-2"),
        rawGroup("cycle-2", "cycle-1"),
        rawGroup("grandchild", "folder-x"),
        rawGroup("cross-workspace", "design", "github"),
        rawGroup("protected-parent", "github-other", "github"),
      ]),
    };
    const loaded = parseStoredState(JSON.stringify(malformed));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state.groups.filter((group) => group.parentId).map((group) => group.id))
      .toEqual(["folder-x", "folder-y"]);
    expect(entryIds(loaded.state)).toEqual([folderY, siteB, folderX, siteA]);
    expect(getSitesInGroup(loaded.state.sites, "design").map((site) => site.id)).toEqual(["site-b", "site-a"]);
    expect(loaded.state.sites.map(({ id, groupId, globalOrder }) => [id, groupId, globalOrder]))
      .toEqual(state.sites.map(({ id, groupId, globalOrder }) => [id, groupId, globalOrder]));
    for (const workspace of ["main", "github"]) {
      expect(getRootGroups(loaded.state.groups).filter((group) => group.workspace === workspace)
        .sort((a, b) => a.order - b.order).at(-1)?.isProtected).toBe(true);
    }
    expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
  });

  it("keeps a promoted Other namesake and its contents on subsequent reads", () => {
    const state = createDefaultState();
    const rootIds = getWorkspaceGroups(state.groups, "main").map((group) => group.id);
    state.groups.push({
      ...groupById(state, "other"),
      id: "orphan-other",
      order: 99,
      isProtected: false,
    });
    const malformed = withSite(state, "orphan-link", "orphan-other");
    groupById(malformed, "orphan-other").parentId = "missing";
    const first = parseStoredState(JSON.stringify(malformed));
    const second = parseStoredState(JSON.stringify(first.state));
    expect(first.recovered).toBe(false);
    expect(second.recovered).toBe(false);
    expect(second.state).toEqual(first.state);
    expect(groupById(second.state, "orphan-other")).toMatchObject({ isProtected: false, name: "其他" });
    expect(getSitesInGroup(second.state.sites, "orphan-other").map((site) => site.id)).toEqual(["orphan-link"]);
    for (const snapshot of [second.state, ensureGithubWorkspace(second.state)]) {
      const ordered = getWorkspaceGroups(snapshot.groups, "main").map((group) => group.id);
      expect(ordered.filter((id) => id !== "orphan-other")).toEqual(rootIds);
      expect(ordered.slice(-2)).toEqual(["orphan-other", "other"]);
    }
  });

  it("preserves manual interleaving, per-group site order and independent global order", () => {
    const state = withFolders();
    expect(entryIds(state)).toEqual([siteA, siteB, folderX, folderY]);
    const invalid = commitGroupEntriesToState(state, "design", [siteA, siteB, folderX, folderX]);
    expect(invalid).toBe(state);
    const mixed = commitGroupEntriesToState(state, "design", [siteB, folderY, siteA, folderX]);
    expect(entryIds(mixed)).toEqual([siteB, folderY, siteA, folderX]);
    expect(entryIds(mixed, "design", "name-asc")).toEqual([folderY, folderX, siteA, siteB]);
    expect(getSitesInGroup(mixed.sites, "design").map((site) => site.id)).toEqual(["site-b", "site-a"]);
    expect(mixed.sites.map((site) => site.globalOrder)).toEqual(state.sites.map((site) => site.globalOrder));
    expect(parseStoredState(JSON.stringify(mixed)).state).toEqual(mixed);

    const legacyReorder = normalizeCollectionHierarchy({
      ...mixed, sites: reorderSites(mixed.sites, "site-b", "site-a"),
    }, true);
    expect(entryIds(legacyReorder)).toEqual([siteA, folderY, siteB, folderX]);
    let moved = moveSitesToGroupInState(legacyReorder, ["site-b", "site-b"], "folder-x", now);
    expect(entryIds(moved)).toEqual([siteA, folderY, folderX]);
    expect(entryIds(moved, "folder-x")).toEqual([siteB]);
    const counts = getGroupSiteCounts(moved.groups, moved.sites);
    expect(counts.get("design")).toBe(2);
    expect(counts.get("folder-y")).toBe(0);
    moved = moveSitesToGroupInState(moved, ["site-b"], "design", now);
    expect(entryIds(moved)).toEqual([siteA, folderY, folderX, siteB]);
    expect(moveSitesToGroupInState(moved, ["site-a"], "github-other", now)).toBe(moved);
    expect(moveSitesToGroupInState(moved, ["site-a", "missing"], "folder-x", now)).toBe(moved);
  });

  it("keeps the intended site slot when a legacy drag crosses into a parent containing folders", () => {
    const source = withSite(withFolders(), "site-new", "develop");
    const mixed = commitGroupEntriesToState(source, "design", [siteA, folderX, siteB, folderY]);
    const next = normalizeCollectionHierarchy({
      ...mixed, sites: reorderSites(mixed.sites, "site-new", "site-b"),
    }, true);
    expect(entryIds(next)).toEqual([siteA, folderX, siteEntryId("site-new"), siteB, folderY]);
    expect(getSitesInGroup(next.sites, "develop")).toEqual([]);
  });

  it("reparents and promotes folders while forbidding illegal parent changes", () => {
    const state = withSite(withFolders(), "site-inside", "folder-x");
    expect(withGroup(state, "under-protected", "other")).toBe(state);
    expect(withGroup(state, "grandchild", "folder-x")).toBe(state);
    expect(withGroup(state, "wrong-workspace", "design", "github")).toBe(state);
    expect(updateGroupInState(state, "other", "保护组", "folder", "design", now)).toBe(state);
    expect(updateGroupInState(state, "design", "设计", "folder", "develop", now)).toBe(state);
    expect(updateGroupInState(state, "folder-x", "子组", "folder", "folder-x", now)).toBe(state);
    expect(updateGroupInState(state, "folder-x", "子组", "folder", "github-tools", now)).toBe(state);

    const next = updateGroupInState(state, "folder-x", "子组", "folder", "develop", now);
    expect(getGroupPath(next.groups, "folder-x")).toBe(`${groupById(next, "develop").name} / 子组`);
    expect(entryIds(next)).toEqual([siteA, siteB, folderY]);
    expect(entryIds(next, "develop")).toEqual([folderX]);
    const promoted = updateGroupInState(next, "folder-x", "子组", "folder", null, now);
    expect(getGroupPath(promoted.groups, "folder-x")).toBe("子组");
    expect(groupById(promoted, "develop").entryOrder).toBeUndefined();
    expect(getSitesInGroup(promoted.sites, "folder-x").map((site) => site.id)).toEqual(["site-inside"]);
  });

  it("supports keep, subtree trash, original-group restore and deduplication", () => {
    const state = withSite(withFolders(), "site-inside", "folder-x");
    const deletedSite = trashSiteFromState(state, "site-inside", now);
    expect(restoreTrashedSiteFromState(deletedSite, "site-inside", now).sites.find((site) => site.id === "site-inside")?.groupId)
      .toBe("folder-x");
    const keepChild = deleteGroupFromState(state, "folder-x", now, "keep");
    expect(keepChild.deletedSites).toEqual([]);
    expect(entryIds(keepChild)).toEqual([siteA, siteB, folderY, siteEntryId("site-inside")]);
    const dissolve = deleteGroupFromState(state, "design", now, "keep");
    expect(dissolve.deletedSites).toEqual([]);
    expect(getSitesInGroup(dissolve.sites, "other").map((site) => site.id)).toEqual(["site-a", "site-b"]);
    expect(groupById(dissolve, "folder-x").parentId).toBeUndefined();
    expect(getSitesInGroup(dissolve.sites, "folder-x")).toHaveLength(1);

    const duplicateTrash = { ...state, deletedSites: deletedSite.deletedSites };
    const trash = deleteGroupsFromState(duplicateTrash, ["design", "folder-x", "folder-y", "other", "unknown"], now);
    expect(trash.sites).toEqual([]);
    expect(trash.groups.some((group) => group.id === "other")).toBe(true);
    expect(trash.groups.some((group) => ["design", "folder-x", "folder-y"].includes(group.id))).toBe(false);
    expect(trash.deletedSites.map((record) => record.site.id)).toEqual(["site-a", "site-b", "site-inside"]);
    expect(restoreTrashedSiteFromState(trash, "site-inside", now).sites[0]?.groupId).toBe("other");
  });

  it("reserves GitHub source binding for eligible roots and keeps GitHub recycle fallback in its workspace", () => {
    const owner = { login: "acme", entityType: "user" as const, profileUrl: "https://github.com/acme" };
    let state: SiteCollectionState = { ...createDefaultState(), sites: [], trashRetentionDays: null };
    state = withGroup(state, "acme", "github-tools", "github");
    state = withSite(state, "repo-inside", "acme", "https://github.com/acme/inside");
    const repositories = [{
      id: 9, name: "repo", htmlUrl: "https://github.com/acme/repo", fullName: "acme/repo",
      fork: false, archived: false,
    }];
    const imported = importGithubRepositoriesToState(state, owner, repositories);
    expect(imported.group?.name).toBe("acme-2");
    expect(imported.group?.parentId).toBeUndefined();
    expect(groupById(imported.state, "acme").githubImportSource).toBeUndefined();
    expect(withGroup(imported.state, "under-bound", imported.group!.id, "github")).toBe(imported.state);
    const trash = deleteGroupFromState(imported.state, "acme", now);
    expect(restoreTrashedSiteFromState(trash, "repo-inside", now).sites.find((site) => site.id === "repo-inside")?.groupId)
      .toBe("github-other");
  });

  it.each(["web", "extension"] as const)("round-trips hierarchy through a fresh %s store", async (mode) => {
    const mixed: CollectionEntryId[] = [siteA, folderX, siteB, folderY];
    const state = withSite(commitGroupEntriesToState(withFolders(), "design", mixed), "site-inside", "folder-x");
    let raw: string | undefined;
    const api: ChromiumExtensionApi = mode === "extension" ? {
      runtime: { id: "hierarchy-test" },
      storage: { local: {
        get: async () => ({ [STORAGE_KEY]: raw }),
        set: async (values) => { raw = values[STORAGE_KEY] as string; },
      } },
    } : {};
    try {
      await createSiteHubStore(api, localStorage).save(state);
      const refreshed = await createSiteHubStore(api, localStorage).load();
      expect(refreshed.recovered).toBe(false);
      expect(entryIds(refreshed.state)).toEqual(mixed);
      expect(getSitesInGroup(refreshed.state.sites, "folder-x").map((site) => site.id)).toEqual(["site-inside"]);
    } finally {
      localStorage.removeItem(STORAGE_KEY);
    }
  });
});
