import { describe, expect, it } from "vitest";
import {
  collectionSelectionReducer as reduce,
  EMPTY_SELECTION,
  type CollectionSelection,
} from "./collection-selection";

const siteOrder = ["a", "b", "c", "d"];
const groupOrder = ["first", "second", "third"];
function toggle(state: CollectionSelection, id: string, mode: "sites" | "groups" = "sites", shiftKey = false) {
  return reduce(state, { type: "toggle", id, mode, shiftKey,
    orderedIds: mode === "sites" ? siteOrder : groupOrder });
}
function ids(state: CollectionSelection) {
  return state.mode === "none" ? [] : [...state.ids];
}

describe("collection selection transitions", () => {
  it("arms sites first, then toggles only the requested group's sites", () => {
    let state = reduce(EMPTY_SELECTION, { type: "group-sites", ids: ["a", "b"] });
    expect(state.mode).toBe("sites");
    expect(ids(state)).toEqual([]);
    state = reduce(state, { type: "group-sites", ids: ["a", "b"] });
    state = reduce(state, { type: "group-sites", ids: ["c", "d"] });
    state = reduce(state, { type: "group-sites", ids: ["a", "b"] });
    expect(ids(state)).toEqual(["c", "d"]);
  });

  it("switches kind atomically and never carries a Shift anchor across kinds", () => {
    const sites = toggle(EMPTY_SELECTION, "a");
    const groups = toggle(sites, "second", "groups", true);
    expect(groups).toEqual({ mode: "groups", ids: new Set(["second"]), anchorId: "second" });
    expect(toggle(groups, "d", "sites", true)).toEqual({
      mode: "sites", ids: new Set(["d"]), anchorId: "d",
    });
    expect(ids(sites)).toEqual(["a"]);
  });

  it("switches from groups to all sites of a section in one click", () => {
    const groups = toggle(EMPTY_SELECTION, "first", "groups");
    expect(ids(reduce(groups, { type: "group-sites", ids: ["c", "d"] }))).toEqual(["c", "d"]);
  });

  it.each(["sites", "groups"] as const)("keeps %s mode after deselecting its last item", (mode) => {
    const id = mode === "sites" ? "a" : "first";
    const state = toggle(toggle(EMPTY_SELECTION, id, mode), id, mode);
    expect(state.mode).toBe(mode);
    expect(ids(state)).toEqual([]);
  });

  it("adds inclusive ranges using current visual order and retains the original anchor", () => {
    const state = toggle(EMPTY_SELECTION, "b");
    const selected = reduce(state, { type: "toggle", mode: "sites", id: "c", shiftKey: true,
      orderedIds: ["b", "d", "a", "c"] });
    expect(ids(selected)).toEqual(["b", "d", "a", "c"]);
    expect(selected.mode !== "none" && selected.anchorId).toBe("b");
    expect(ids(state)).toEqual(["b"]);
  });

  it("ignores protected or absent group targets and selects ranges of ordinary groups", () => {
    const state = toggle(EMPTY_SELECTION, "first", "groups");
    expect(toggle(state, "other", "groups")).toBe(state);
    expect(ids(toggle(state, "third", "groups", true))).toEqual(groupOrder);
  });

  it("enters from a double click only when no selection mode is active", () => {
    const state = reduce(EMPTY_SELECTION, { type: "enter-group", id: "first" });
    expect(ids(state)).toEqual(["first"]);
    expect(reduce(state, { type: "enter-group", id: "second" })).toBe(state);
  });

  it("preserves selected drag sources and replaces them when an unselected site is dragged", () => {
    const state = toggle(toggle(EMPTY_SELECTION, "a"), "c");
    expect(reduce(state, { type: "site-drag", id: "a" })).toBe(state);
    expect(ids(reduce(state, { type: "site-drag", id: "b" }))).toEqual(["b"]);
    const armed = reduce(EMPTY_SELECTION, { type: "toggle-sites-mode" });
    expect(reduce(armed, { type: "site-drag", id: "a" })).toEqual(EMPTY_SELECTION);
  });

  it("keeps a selected group block and clears it when dragging an unselected row", () => {
    const state = toggle(toggle(EMPTY_SELECTION, "first", "groups"), "third", "groups");
    expect(reduce(state, { type: "group-drag", id: "first", vertical: true })).toBe(state);
    expect(ids(reduce(state, { type: "group-drag", id: "second", vertical: true }))).toEqual([]);
  });

  it.each(["sites", "groups"] as const)("removes deleted %s and their stale range anchor", (mode) => {
    const target = mode === "sites" ? "b" : "second";
    const state = toggle(EMPTY_SELECTION, target, mode);
    const next = reduce(state, { type: "reconcile", siteIds: new Set(["a", "c", "d"]),
      groupIds: new Set(["first", "third"]), allowGroups: true });
    expect(next).toEqual({ mode, ids: new Set(), anchorId: null });
    expect(ids(toggle(next, mode === "sites" ? "d" : "third", mode, true)))
      .toEqual([mode === "sites" ? "d" : "third"]);
  });

  it("clears group selection outside grouped view but keeps valid site selections", () => {
    const action = { type: "reconcile" as const, siteIds: new Set(siteOrder),
      groupIds: new Set(groupOrder), allowGroups: false };
    expect(reduce(toggle(EMPTY_SELECTION, "first", "groups"), action)).toBe(EMPTY_SELECTION);
    const sites = toggle(EMPTY_SELECTION, "a");
    expect(reduce(sites, action)).toBe(sites);
  });

  it("clears both the set and anchor before selection is armed again", () => {
    const state = reduce(toggle(EMPTY_SELECTION, "a"), { type: "clear" });
    const armed = reduce(state, { type: "toggle-sites-mode" });
    expect(ids(toggle(armed, "d", "sites", true))).toEqual(["d"]);
  });
});
