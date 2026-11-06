import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { createDefaultState } from "../data/defaults";
import { folderEntryId, siteEntryId } from "../lib/group-hierarchy";
import { useSiteDragging } from "./use-site-dragging";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("cancels a frozen website drag when external data changes instead of overwriting the newer save", () => {
  const state = createDefaultState();
  const commitSites = vi.fn();
  const preview = vi.fn();
  const { result, rerender } = renderHook(({ sites }) => {
    return useSiteDragging({ sites, groups: state.groups, renderedSites: sites,
      workspaceGroupIds: new Set(state.groups.map(group => group.id)), activeGroupId: "all", isGroupedView: true,
      canReorderSites: true, dragDisabled: false, setActiveGroupId: vi.fn(),
      setDragSitesPreview: preview, commitSites, onStart: vi.fn(), armSiteClickSuppression: vi.fn() });
  }, { initialProps: { sites: state.sites } });
  const active = { id: "google" };
  act(() => result.current.handleDragStart({ active } as DragStartEvent));
  expect(result.current.activeDragId).toBe("google");
  rerender({ sites: [...state.sites, { ...state.sites[0], id: "external-new-site" }] });
  expect(result.current.activeDragId).toBeNull();
  expect(preview).toHaveBeenLastCalledWith(null);
  act(() => result.current.handleDragEnd({ active } as DragEndEvent));
  expect(commitSites).not.toHaveBeenCalled();
});

it("uses one mixed-order intent for folder and site drags without overwriting ordinary site transactions", () => {
  const state = createDefaultState();
  const parent = state.groups.find(group => group.id === "search")!;
  const folders = ["folder-x", "folder-y"].map((id, order) => ({
    ...parent, id, parentId: parent.id, name: id, order,
  }));
  parent.entryOrder = [siteEntryId("google"), folderEntryId("folder-x"),
    siteEntryId("bing"), folderEntryId("folder-y")];
  const sites = [...state.sites, { ...state.sites[0], id: 'collection-folder:"folder-x"', groupId: "develop" }];
  const groups = [...state.groups, ...folders];
  const commitGroupEntries = vi.fn();
  const commitSites = vi.fn();
  const { result } = renderHook(() => useSiteDragging({
    sites, groups, renderedSites: sites, workspaceGroupIds: new Set(groups.map(group => group.id)),
    activeGroupId: parent.id, isGroupedView: false, canReorderSites: true, dragDisabled: false,
    setActiveGroupId: vi.fn(), setDragSitesPreview: vi.fn(), commitSites, commitGroupEntries,
    onStart: vi.fn(), armSiteClickSuppression: vi.fn(),
  }));
  const folderId = result.current.folderDragIds.get("folder-x")!;
  expect(folderId).not.toBe('collection-folder:"folder-x"');

  const drag = (id: string, overId: string, cancel = false) => {
    const active = { id };
    act(() => result.current.handleDragStart({ active } as DragStartEvent));
    act(() => result.current.handleDragOver({ active, over: { id: overId } } as DragOverEvent));
    if (cancel) act(() => result.current.handleDragCancel());
    else act(() => result.current.handleDragEnd({ active } as DragEndEvent));
  };
  drag(folderId, "bing");
  expect(commitGroupEntries).toHaveBeenLastCalledWith(parent.id, [
    siteEntryId("google"), siteEntryId("bing"), folderEntryId("folder-x"), folderEntryId("folder-y"),
  ]);
  drag("bing", folderId);
  expect(commitGroupEntries).toHaveBeenLastCalledWith(parent.id, [
    siteEntryId("google"), siteEntryId("bing"), folderEntryId("folder-x"), folderEntryId("folder-y"),
  ]);

  drag(folderId, "github"); // A folder cannot move into a different grid.
  drag(folderId, "bing", true);
  expect(commitGroupEntries).toHaveBeenCalledTimes(2);
  expect(commitSites).not.toHaveBeenCalled();
});
