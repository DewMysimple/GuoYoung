import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import { useCollectionSelection } from "./use-collection-selection";

afterEach(cleanup);
const defaults = createDefaultState();
const options = {
  sites: defaults.sites,
  groups: defaults.groups,
  orderedSiteIds: defaults.sites.map((site) => site.id),
  isGroupedView: true,
  isSearching: false,
};

describe("collection selection lifecycle", () => {
  it("prunes a group removed by an external storage update", () => {
    const { result, rerender } = renderHook(useCollectionSelection, { initialProps: options });
    act(() => result.current.toggleGroupSelection("search"));
    expect([...result.current.selectedGroupIds]).toEqual(["search"]);
    rerender({ ...options, groups: options.groups.filter((group) => group.id !== "search") });
    expect(result.current.selectedGroupIds.size).toBe(0);
    expect(result.current.selectionMode).toBe("groups");
  });

  it("preserves selected sources while drag preview changes the visible sites", () => {
    const { result, rerender } = renderHook(useCollectionSelection, { initialProps: options });
    act(() => result.current.toggleSiteSelection(defaults.sites[0]));
    rerender({ ...options, orderedSiteIds: ["figma"], isGroupedView: false });
    expect([...result.current.selectedSiteIds]).toEqual([defaults.sites[0].id]);
  });

  it("exits selection on search and does not resurrect it when search is cleared", () => {
    const { result, rerender } = renderHook(useCollectionSelection, { initialProps: options });
    act(() => result.current.toggleGroupSelection("search"));
    rerender({ ...options, isSearching: true, isGroupedView: false });
    expect(result.current.selectionMode).toBe("none");
    rerender(options);
    expect(result.current.selectedGroupIds.size).toBe(0);
  });

  it("uses reducer transitions for multiple selection events in one React batch", () => {
    const { result } = renderHook(useCollectionSelection, { initialProps: options });
    act(() => {
      result.current.toggleGroupSelection("search");
      result.current.toggleGroupSelection("design");
    });
    expect([...result.current.selectedGroupIds]).toEqual(["search", "design"]);
    expect(result.current.selectedSiteIds.size).toBe(0);
  });
});
