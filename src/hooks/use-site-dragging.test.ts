import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { createDefaultState } from "../data/defaults";
import { useSiteDragging } from "./use-site-dragging";
import { useCollectionSelection } from "./use-collection-selection";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("cancels a frozen website drag when external data changes instead of overwriting the newer save", () => {
  const state = createDefaultState();
  const commitSites = vi.fn();
  const preview = vi.fn();
  const { result, rerender } = renderHook(({ sites }) => {
    const selection = useCollectionSelection({ sites, groups: state.groups, orderedSiteIds: [], isGroupedView: true, isSearching: false });
    return useSiteDragging({ sites, groups: state.groups, renderedSites: sites,
      workspaceGroupIds: new Set(state.groups.map(group => group.id)), activeGroupId: "all", isGroupedView: true,
      canReorderSites: true, dragDisabled: false, selection, setActiveGroupId: vi.fn(),
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
