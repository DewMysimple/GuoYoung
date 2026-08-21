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
  reorderSites,
  reorderSitesGlobally,
} from "../lib/site-utils";
import {
  addGroupToState,
  addSiteToState,
  deleteGroupFromState,
  updateSiteInState,
} from "../lib/site-state";
import { addSearchHistory, removeSearchHistory } from "../lib/search-history";
import type {
  AppearanceSettings,
  BrandSettings,
  CategoryIcon,
  GroupDeletionStrategy,
  SiteCollectionState,
  SiteFormValues,
  SiteItem,
  SiteDisplayMode,
  ThemePreference,
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
  deleteSite: (id: string) => void;
  reorder: (
    activeId: string,
    overId: string,
    scope: "all" | "group",
  ) => void;
  commitSites: (sites: SiteItem[]) => void;
  addGroup: (name: string, icon: CategoryIcon, beforeGroupId?: string) => string;
  updateGroup: (id: string, name: string, icon: CategoryIcon) => void;
  reorderGroups: (activeId: string, beforeGroupId: string | null) => void;
  deleteGroup: (id: string, strategy: GroupDeletionStrategy) => void;
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

  const addSite = useCallback<SiteHubApi["addSite"]>((values) => {
    setState((current) => addSiteToState(current, values));
    setRecovered(false);
  }, []);

  const updateSite = useCallback<SiteHubApi["updateSite"]>((id, values) => {
    setState((current) => updateSiteInState(current, id, values));
    setRecovered(false);
  }, []);

  const deleteSite = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      sites: reindexSites(
        current.sites
          .filter((site) => site.id !== id)
          .map((site) => ({ ...site })),
      ),
    }));
    setRecovered(false);
  }, []);

  const reorder = useCallback<SiteHubApi["reorder"]>(
    (activeId, overId, scope) => {
      setState((current) => ({
        ...current,
        sites:
          scope === "all"
            ? reorderSitesGlobally(current.sites, activeId, overId)
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

  const addGroup = useCallback<SiteHubApi["addGroup"]>((name, icon, beforeGroupId) => {
    const id = crypto.randomUUID();
    setState((current) =>
      addGroupToState(
        current,
        name,
        icon,
        id,
        new Date().toISOString(),
        beforeGroupId,
      ),
    );
    setRecovered(false);
    return id;
  }, []);

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
      setState((current) => ({
        ...current,
        groups: reorderGroupItems(current.groups, activeId, beforeGroupId),
      }));
      setRecovered(false);
    },
    [],
  );

  const deleteGroup = useCallback<SiteHubApi["deleteGroup"]>((id, strategy) => {
    setState((current) => deleteGroupFromState(current, id, strategy));
    setRecovered(false);
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
    }));
    setRecovered(false);
  }, []);

  const replaceState = useCallback((nextState: SiteCollectionState) => {
    skipInitialSave.current = false;
    setState((current) => ({
      ...nextState,
      searchHistory: current.searchHistory,
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
    deleteSite,
    reorder,
    commitSites,
    addGroup,
    updateGroup,
    reorderGroups,
    deleteGroup,
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
