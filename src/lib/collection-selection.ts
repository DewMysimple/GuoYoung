import { getInclusiveSelectionRange } from "./selection-range";

// A selection has one kind, one set and one anchor. Switching kinds cannot
// leave an invisible selection (or a Shift anchor) in the other kind.
export type CollectionSelection =
  | { mode: "none" }
  | {
      mode: "sites" | "groups";
      ids: ReadonlySet<string>;
      anchorId: string | null;
    };

export const EMPTY_SELECTION: CollectionSelection = { mode: "none" };
export const EMPTY_SELECTION_IDS: ReadonlySet<string> = new Set();

type SelectionAction =
  | { type: "clear" }
  | { type: "toggle-sites-mode" }
  | { type: "group-sites"; ids: readonly string[] }
  | {
      type: "toggle";
      mode: "sites" | "groups";
      id: string;
      orderedIds: readonly string[];
      shiftKey: boolean;
    }
  | { type: "enter-group"; id: string }
  | { type: "site-drag"; id: string }
  | { type: "group-drag"; id: string; vertical: boolean }
  | {
      type: "reconcile";
      siteIds: ReadonlySet<string>;
      groupIds: ReadonlySet<string>;
      allowGroups: boolean;
    };

export function collectionSelectionReducer(
  state: CollectionSelection,
  action: SelectionAction,
): CollectionSelection {
  switch (action.type) {
    case "clear":
      return EMPTY_SELECTION;
    case "toggle-sites-mode":
      return state.mode === "sites"
        ? EMPTY_SELECTION
        : { mode: "sites", ids: new Set(), anchorId: null };
    case "group-sites": {
      // First click arms selection; subsequent clicks select this group only.
      if (state.mode === "none") {
        return { mode: "sites", ids: new Set(), anchorId: null };
      }
      const ids = new Set(state.mode === "sites" ? state.ids : []);
      const allSelected = action.ids.length > 0 && action.ids.every((id) => ids.has(id));
      for (const id of action.ids) {
        if (allSelected) ids.delete(id);
        else ids.add(id);
      }
      return { mode: "sites", ids, anchorId: action.ids.at(-1) ?? null };
    }
    case "toggle": {
      if (!action.orderedIds.includes(action.id)) return state;
      const sameMode = state.mode === action.mode;
      const ids = new Set(sameMode ? state.ids : []);
      const anchorId = sameMode ? state.anchorId : null;
      const hasAnchor = anchorId !== null && action.orderedIds.includes(anchorId);
      if (action.shiftKey && hasAnchor) {
        getInclusiveSelectionRange(action.orderedIds, anchorId, action.id)
          .forEach((id) => ids.add(id));
      } else if (ids.has(action.id)) {
        ids.delete(action.id);
      } else {
        ids.add(action.id);
      }
      return {
        mode: action.mode,
        ids,
        anchorId: action.shiftKey && hasAnchor ? anchorId : action.id,
      };
    }
    case "enter-group":
      return state.mode === "none"
        ? { mode: "groups", ids: new Set([action.id]), anchorId: action.id }
        : state;
    case "site-drag":
      if (state.mode !== "sites") return state;
      if (state.ids.size === 0) return EMPTY_SELECTION;
      return state.ids.has(action.id)
        ? state
        : { mode: "sites", ids: new Set([action.id]), anchorId: action.id };
    case "group-drag":
      if (state.mode !== "groups" || state.ids.size === 0) return EMPTY_SELECTION;
      return action.vertical && !state.ids.has(action.id)
        ? { mode: "groups", ids: new Set(), anchorId: null }
        : state;
    case "reconcile": {
      if (state.mode === "none") return state;
      if (state.mode === "groups" && !action.allowGroups) return EMPTY_SELECTION;
      const validIds = state.mode === "sites" ? action.siteIds : action.groupIds;
      const ids = new Set([...state.ids].filter((id) => validIds.has(id)));
      const anchorId = state.anchorId && validIds.has(state.anchorId) ? state.anchorId : null;
      return ids.size === state.ids.size && anchorId === state.anchorId
        ? state
        : { ...state, ids, anchorId };
    }
  }
}
