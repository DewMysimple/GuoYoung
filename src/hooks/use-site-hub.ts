import { useCallback, useEffect, useRef, useState } from "react";
import { createDefaultState } from "../data/defaults";
import {
  createSiteHubStore,
  type SiteHubStore,
  type StorageMode,
} from "../lib/state-store";
import {
  reindexSites,
  reorderGroups as reorderGroupItems,
  reorderGroupBlock,
  reorderSites,
  reorderSitesGlobally,
} from "../lib/site-utils";
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
  type GroupImportResult,
} from "../lib/site-state";
import {
  migrateGithubSitesInState,
  undoGithubMigrationInState,
} from "../lib/github-workspace";
import type { GroupExportPayload } from "../lib/data-transfer";
import { addSearchHistory, removeSearchHistory } from "../lib/search-history";
import type {
  AppearanceSettings,
  BrandSettings,
  CategoryIcon,
  SiteCollectionState,
  SiteFormValues,
  SiteItem,
  SiteDisplayMode,
  SiteWorkspace,
  ThemePreference,
  TrashRetentionDays,
  WallpaperSettings,
} from "../types";

interface SiteHubApi {
  state: SiteCollectionState;
  isLoading: boolean;
  recovered: boolean;
  storageMode: StorageMode;
  addSite: (values: SiteFormValues & { url: string; customIconUrl?: string }) => void;
  updateSite: (
    id: string,
    values: SiteFormValues & { url: string; customIconUrl?: string },
  ) => void;
  recordSiteClick: (id: string) => void;
  deleteSite: (id: string) => void;
  restoreSite: (id: string) => void;
  restoreAllSites: () => void;
  permanentlyDeleteSite: (id: string) => void;
  emptyTrash: () => void;
  setTrashRetentionDays: (days: TrashRetentionDays) => void;
  reorder: (
    activeId: string,
    overId: string,
    scope: "all" | "group",
    workspaceGroupIds?: Set<string>,
  ) => void;
  commitSites: (sites: SiteItem[]) => void;
  addGroup: (
    name: string,
    icon: CategoryIcon,
    beforeGroupId?: string,
    workspace?: SiteWorkspace,
  ) => string;
  updateGroup: (id: string, name: string, icon: CategoryIcon) => void;
  reorderGroups: (activeId: string, beforeGroupId: string | null) => void;
  reorderGroupBlock: (activeIds: string[], beforeGroupId: string | null) => void;
  deleteGroup: (id: string) => void;
  importGroup: (
    targetGroupId: string,
    payload: GroupExportPayload,
  ) => GroupImportResult;
  migrateGithubSites: () => ReturnType<typeof migrateGithubSitesInState>;
  undoGithubMigration: () => ReturnType<typeof undoGithubMigrationInState>;
  reset: () => void;
  replaceState: (state: SiteCollectionState) => void;
  setThemePreference: (preference: ThemePreference) => void;
  saveSettings: (
    themePreference: ThemePreference,
    brand: BrandSettings,
    appearance: AppearanceSettings,
    wallpaper: WallpaperSettings,
  ) => void;
  recordSearch: (query: string) => Promise<void>;
  deleteSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  setDisplayMode: (mode: SiteDisplayMode) => void;
}

export function useSiteHub(): SiteHubApi {
  const storeRef = useRef<SiteHubStore | null>(null);
  if (!storeRef.current) storeRef.current = createSiteHubStore();
  const store = storeRef.current;
  const initial = store.initial;
  const [state, setState] = useState(
    () => initial?.state ?? createDefaultState(),
  );
  const [isLoading, setIsLoading] = useState(!initial);
  const [recovered, setRecovered] = useState(initial?.recovered ?? false);
  const stateRef = useRef(state);
  const hasLoaded = useRef(Boolean(initial));
  const skipInitialSave = useRef(initial?.recovered ?? false);
  const applyingExternalState = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (hasLoaded.current) return;
    let active = true;

    store
      .load()
      .then((loaded) => {
        if (!active) return;
        setState(loaded.state);
        setRecovered(loaded.recovered);
        skipInitialSave.current = loaded.recovered;
        hasLoaded.current = true;
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setState(createDefaultState());
        setRecovered(true);
        skipInitialSave.current = true;
        hasLoaded.current = true;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading || !store.subscribe) return;
    return store.subscribe((loaded) => {
      const incoming = JSON.stringify(loaded.state);
      if (incoming === JSON.stringify(stateRef.current)) return;
      applyingExternalState.current = true;
      stateRef.current = loaded.state;
      setState(loaded.state);
      setRecovered(loaded.recovered);
    });
  }, [isLoading, store]);

  useEffect(() => {
    if (!hasLoaded.current || isLoading) return;
    if (applyingExternalState.current) {
      applyingExternalState.current = false;
      return;
    }
    if (skipInitialSave.current) {
      skipInitialSave.current = false;
      return;
    }
    void store.save(state);
  }, [isLoading, state]);

  useEffect(() => {
    if (isLoading) return;
    const purge = () => {
      setState((current) => purgeExpiredTrashFromState(current));
    };
    purge();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") purge();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    if (state.trashRetentionDays === null || state.deletedSites.length === 0) {
      return () => {
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    }
    const retentionMs = state.trashRetentionDays * 24 * 60 * 60 * 1000;
    const nextExpiry = Math.min(
      ...state.deletedSites.map(
        (entry) => Date.parse(entry.deletedAt) + retentionMs,
      ),
    );
    const delay = Math.min(
      2_147_483_647,
      Math.max(0, nextExpiry - Date.now() + 100),
    );
    const timer = window.setTimeout(purge, delay);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isLoading, state.deletedSites, state.trashRetentionDays]);

  const addSite = useCallback<SiteHubApi["addSite"]>((values) => {
    setState((current) => {
      try {
        return addSiteToState(current, values);
      } catch {
        return current;
      }
    });
    setRecovered(false);
  }, []);

  const updateSite = useCallback<SiteHubApi["updateSite"]>((id, values) => {
    setState((current) => {
      try {
        return updateSiteInState(current, id, values);
      } catch {
        return current;
      }
    });
    setRecovered(false);
  }, []);

  const recordSiteClick = useCallback<SiteHubApi["recordSiteClick"]>((id) => {
    const current = stateRef.current;
    if (!current.sites.some((site) => site.id === id)) return;
    const next = {
      ...current,
      sites: current.sites.map((site) =>
        site.id === id ? { ...site, clickCount: site.clickCount + 1 } : site,
      ),
    };
    stateRef.current = next;
    setState(next);
    setRecovered(false);
  }, []);

  const deleteSite = useCallback((id: string) => {
    setState((current) => trashSiteFromState(current, id));
    setRecovered(false);
  }, []);

  const restoreSite = useCallback((id: string) => {
    setState((current) => restoreTrashedSiteFromState(current, id));
    setRecovered(false);
  }, []);

  const restoreAllSites = useCallback(() => {
    setState((current) => restoreAllTrashedSitesFromState(current));
    setRecovered(false);
  }, []);

  const permanentlyDeleteSite = useCallback((id: string) => {
    setState((current) => permanentlyDeleteTrashedSiteFromState(current, id));
    setRecovered(false);
  }, []);

  const emptyTrash = useCallback(() => {
    setState((current) =>
      current.deletedSites.length
        ? { ...current, deletedSites: [] }
        : current,
    );
    setRecovered(false);
  }, []);

  const setTrashRetentionDays = useCallback((days: TrashRetentionDays) => {
    setState((current) => setTrashRetentionInState(current, days));
    setRecovered(false);
  }, []);

  const reorder = useCallback<SiteHubApi["reorder"]>(
    (activeId, overId, scope, workspaceGroupIds) => {
      setState((current) => ({
        ...current,
        sites:
          scope === "all"
            ? reorderSitesGlobally(
                current.sites,
                activeId,
                overId,
                workspaceGroupIds,
              )
            : reorderSites(current.sites, activeId, overId),
      }));
      setRecovered(false);
    },
    [],
  );

  const commitSites = useCallback((sites: SiteItem[]) => {
    setState((current) => ({
      ...current,
      sites: reindexSites(sites.map((site) => ({ ...site }))),
    }));
    setRecovered(false);
  }, []);

  const addGroup = useCallback<SiteHubApi["addGroup"]>(
    (name, icon, beforeGroupId, workspace = "main") => {
      const id = crypto.randomUUID();
      setState((current) =>
        addGroupToState(
          current,
          name,
          icon,
          id,
          new Date().toISOString(),
          beforeGroupId,
          workspace,
        ),
      );
      setRecovered(false);
      return id;
    },
    [],
  );

  const updateGroup = useCallback<SiteHubApi["updateGroup"]>((id, name, icon) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === id && !group.isProtected
          ? {
              ...group,
              name: trimmed,
              icon,
              updatedAt: new Date().toISOString(),
            }
          : group,
      ),
    }));
    setRecovered(false);
  }, []);

  const reorderGroups = useCallback<SiteHubApi["reorderGroups"]>(
    (activeId, beforeGroupId) => {
      setState((current) => {
        const target = current.groups.find((group) => group.id === activeId);
        if (!target) return current;
        const scoped = current.groups.filter(
          (group) => group.workspace === target.workspace,
        );
        const reordered = reorderGroupItems(
          scoped,
          activeId,
          beforeGroupId,
        );
        const byId = new Map(reordered.map((group) => [group.id, group]));
        return {
          ...current,
          groups: current.groups.map((group) => byId.get(group.id) ?? group),
        };
      });
      setRecovered(false);
    },
    [],
  );

  const reorderGroupsBlock = useCallback<SiteHubApi["reorderGroupBlock"]>(
    (activeIds, beforeGroupId) => {
      setState((current) => {
        const workspace = current.groups.find((group) =>
          activeIds.includes(group.id),
        )?.workspace;
        if (!workspace) return current;
        const scoped = current.groups.filter(
          (group) => group.workspace === workspace,
        );
        const reordered = reorderGroupBlock(
          scoped,
          activeIds,
          beforeGroupId,
        );
        const byId = new Map(reordered.map((group) => [group.id, group]));
        return {
          ...current,
          groups: current.groups.map((group) => byId.get(group.id) ?? group),
        };
      });
      setRecovered(false);
    },
    [],
  );

  const deleteGroup = useCallback<SiteHubApi["deleteGroup"]>((id) => {
    setState((current) => deleteGroupFromState(current, id));
    setRecovered(false);
  }, []);

  const importGroup = useCallback<SiteHubApi["importGroup"]>(
    (targetGroupId, payload) => {
      const result = mergeGroupImportIntoState(
        stateRef.current,
        targetGroupId,
        payload,
      );
      stateRef.current = result.state;
      setState(result.state);
      setRecovered(false);
      return result;
    },
    [],
  );

  const migrateGithubSites = useCallback(() => {
    const result = migrateGithubSitesInState(stateRef.current);
    stateRef.current = result.state;
    setState(result.state);
    setRecovered(false);
    return result;
  }, []);

  const undoGithubMigration = useCallback(() => {
    const result = undoGithubMigrationInState(stateRef.current);
    stateRef.current = result.state;
    setState(result.state);
    setRecovered(false);
    return result;
  }, []);

  const reset = useCallback(() => {
    const defaults = createDefaultState();
    setState((current) => ({
      ...defaults,
      themePreference: current.themePreference,
      brand: current.brand,
      appearance: current.appearance,
      wallpaper: current.wallpaper,
      searchHistory: current.searchHistory,
      displayMode: current.displayMode,
      deletedSites: current.deletedSites,
      trashRetentionDays: current.trashRetentionDays,
    }));
    setRecovered(false);
  }, []);

  const replaceState = useCallback((nextState: SiteCollectionState) => {
    skipInitialSave.current = false;
    setState((current) => ({
      ...nextState,
      searchHistory: current.searchHistory,
      deletedSites: current.deletedSites,
      trashRetentionDays: current.trashRetentionDays,
    }));
    setRecovered(false);
  }, []);

  const setThemePreference = useCallback((themePreference: ThemePreference) => {
    setState((current) => ({ ...current, themePreference }));
    setRecovered(false);
  }, []);

  const saveSettings = useCallback<SiteHubApi["saveSettings"]>(
    (themePreference, brand, appearance, wallpaper) => {
      setState((current) => ({
        ...current,
        themePreference,
        brand,
        appearance,
        wallpaper,
      }));
      setRecovered(false);
    },
    [],
  );

  const recordSearch = useCallback<SiteHubApi["recordSearch"]>(
    async (rawQuery) => {
      const query = rawQuery.trim();
      if (!query) return;
      const next = {
        ...stateRef.current,
        searchHistory: addSearchHistory(stateRef.current.searchHistory, query),
      };
      stateRef.current = next;
      setState(next);
      await store.save(next);
    },
    [store],
  );

  const deleteSearchHistory = useCallback((query: string) => {
    setState((current) => ({
      ...current,
      searchHistory: removeSearchHistory(current.searchHistory, query),
    }));
  }, []);

  const clearSearchHistory = useCallback(() => {
    setState((current) => ({ ...current, searchHistory: [] }));
  }, []);

  const setDisplayMode = useCallback((displayMode: SiteDisplayMode) => {
    setState((current) => ({ ...current, displayMode }));
    setRecovered(false);
  }, []);

  return {
    state,
    isLoading,
    recovered,
    storageMode: store.mode,
    addSite,
    updateSite,
    recordSiteClick,
    deleteSite,
    restoreSite,
    restoreAllSites,
    permanentlyDeleteSite,
    emptyTrash,
    setTrashRetentionDays,
    reorder,
    commitSites,
    addGroup,
    updateGroup,
    reorderGroups,
    reorderGroupBlock: reorderGroupsBlock,
    deleteGroup,
    importGroup,
    migrateGithubSites,
    undoGithubMigration,
    reset,
    replaceState,
    setThemePreference,
    saveSettings,
    recordSearch,
    deleteSearchHistory,
    clearSearchHistory,
    setDisplayMode,
  };
}
