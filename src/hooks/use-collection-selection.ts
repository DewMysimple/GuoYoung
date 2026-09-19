import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
  collectionSelectionReducer,
  EMPTY_SELECTION,
  EMPTY_SELECTION_IDS,
} from "../lib/collection-selection";
import type { SiteGroup, SiteItem } from "../types";

interface CollectionSelectionOptions {
  sites: readonly SiteItem[];
  groups: readonly SiteGroup[];
  orderedSiteIds: readonly string[];
  isGroupedView: boolean;
  isSearching: boolean;
}

export function useCollectionSelection({
  sites, groups, orderedSiteIds, isGroupedView, isSearching,
}: CollectionSelectionOptions) {
  const [selection, dispatch] = useReducer(collectionSelectionReducer, EMPTY_SELECTION);
  const orderedGroupIds = useMemo(
    () => groups.filter((group) => !group.isProtected).map((group) => group.id),
    [groups],
  );
  const cancelSelection = useCallback(() => dispatch({ type: "clear" }), []);

  useEffect(() => {
    if (isSearching) {
      cancelSelection();
      return;
    }
    // Validate against persisted sites, never the temporary drag preview:
    // hover-switching groups must not drop the selected transfer sources.
    dispatch({
      type: "reconcile",
      siteIds: new Set(sites.map((site) => site.id)),
      groupIds: new Set(orderedGroupIds),
      allowGroups: isGroupedView,
    });
  }, [sites, orderedGroupIds, isGroupedView, isSearching, cancelSelection]);

  return {
    selectionMode: selection.mode,
    selectedSiteIds: selection.mode === "sites" ? selection.ids : EMPTY_SELECTION_IDS,
    selectedGroupIds: selection.mode === "groups" ? selection.ids : EMPTY_SELECTION_IDS,
    cancelSelection,
    toggleMultiSelectMode: () => dispatch({ type: "toggle-sites-mode" }),
    toggleSiteSelection: (site: SiteItem, shiftKey = false) => dispatch({
      type: "toggle", mode: "sites", id: site.id, orderedIds: orderedSiteIds, shiftKey,
    }),
    toggleGroupedSiteSelection: (ids: readonly string[]) => dispatch({ type: "group-sites", ids }),
    toggleGroupSelection: (id: string, shiftKey = false) => {
      if (isGroupedView) dispatch({
        type: "toggle", mode: "groups", id, orderedIds: orderedGroupIds, shiftKey,
      });
    },
    enterGroupSelectionFromDoubleClick: (id: string) => {
      if (isGroupedView && orderedGroupIds.includes(id)) dispatch({ type: "enter-group", id });
    },
    prepareSiteDrag: (id: string) => dispatch({ type: "site-drag", id }),
    prepareGroupDrag: (id: string, vertical: boolean) => dispatch({ type: "group-drag", id, vertical }),
  };
}
