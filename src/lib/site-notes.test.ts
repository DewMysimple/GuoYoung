import { describe, expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import { parseStoredState, isSiteCollectionState } from "./storage";
import { addSiteToState, updateSiteInState, mergeGroupImportIntoState, trashSiteFromState, restoreTrashedSiteFromState } from "./site-state";
import { createGroupExportPayload, parseGroupImportFile, serializeExport, parseImportFile } from "./data-transfer";
import { getMinimumCardWidth } from "./layout";
import { collectionSearchScore } from "./collection-search";

describe("website notes", () => {
  it("migrates v27 by supplementing display preference and keeps all sites and valid notes", () => {
    const state = createDefaultState();
    state.sites[0].note = "项目设计资料\n第二行";
    const { showSiteNotes: _show, ...appearance } = state.appearance;
    const legacy = { ...state, version: 27, appearance };
    const loaded = parseStoredState(JSON.stringify(legacy));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state.version).toBe(28);
    expect(loaded.state.appearance.showSiteNotes).toBe(true);
    expect(loaded.state.sites).toEqual(state.sites);
    expect(loaded.state.groups).toEqual(state.groups);
    expect(isSiteCollectionState(loaded.state)).toBe(true);
    expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
  });

  it("keeps false preference and long valid text, normalizes malformed optional notes without losing collection", () => {
    const state = createDefaultState();
    state.appearance.showSiteNotes = false;
    state.sites[0].note = "资料".repeat(1500);
    const raw = { ...state, sites: [state.sites[0], { ...state.sites[1], note: { bad: true } }] };
    const loaded = parseStoredState(JSON.stringify(raw));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state.appearance.showSiteNotes).toBe(false);
    expect(loaded.state.sites[0].note).toBe(state.sites[0].note);
    expect(loaded.state.sites[1].note).toBeUndefined();
    expect(loaded.state.sites).toHaveLength(2);
  });

  it("adds and edits notes, preserves them for callers without a note field, and clears on explicit blank", () => {
    const state = createDefaultState();
    const values = { name: "Example", url: "https://example.com/notes", groupId: "design", iconSource: "auto" as const, customIconUrl: "", note: "  项目资料  " };
    const added = addSiteToState(state, values, "noted");
    expect(added.sites.at(-1)?.note).toBe("项目资料");
    const { note: _note, ...withoutNote } = values;
    const renamed = updateSiteInState(added, "noted", { ...withoutNote, name: "New name" });
    expect(renamed.sites.find(site => site.id === "noted")?.note).toBe("项目资料");
    const edited = updateSiteInState(renamed, "noted", { ...values, note: "新备注" });
    expect(edited.sites.find(site => site.id === "noted")?.note).toBe("新备注");
    const cleared = updateSiteInState(edited, "noted", { ...values, note: " " });
    expect(cleared.sites.find(site => site.id === "noted")?.note).toBeUndefined();
  });

  it("preserves notes through trash, restoration, whole backup and group export/import", () => {
    const state = createDefaultState();
    const site = state.sites[0];
    site.note = "私人资料说明";
    const trashed = trashSiteFromState(state, site.id);
    expect(trashed.deletedSites[0].site.note).toBe(site.note);
    expect(restoreTrashedSiteFromState(trashed, site.id).sites.find(item => item.id === site.id)?.note).toBe(site.note);
    expect(parseImportFile(serializeExport(state)).sites.find(item => item.id === site.id)?.note).toBe(site.note);
    const payload = parseGroupImportFile(JSON.stringify(createGroupExportPayload(state, site.groupId)));
    expect(payload.sites.find(item => item.url === site.url)?.note).toBe(site.note);
    const target = { ...createDefaultState(), sites: [] };
    expect(mergeGroupImportIntoState(target, "design", payload).state.sites.find(item => item.url === site.url)?.note).toBe(site.note);
  });

  it("allows finding a site by its note and reserves an extra row only in square grids with visible notes", () => {
    expect(collectionSearchScore("Example", "https://example.com", "工具", "项目文档", "项目文档入口")).toBeGreaterThan(0);
    const appearance = { ...createDefaultState().appearance, cardShape: "square" as const, fontScale: 130 };
    expect(getMinimumCardWidth(appearance, true)).toBeGreaterThan(getMinimumCardWidth(appearance));
    expect(getMinimumCardWidth({ ...appearance, showSiteNotes: false }, true)).toBe(getMinimumCardWidth(appearance));
  });
});
