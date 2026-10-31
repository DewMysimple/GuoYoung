import { applyDataImport, type ImportRequest } from "../lib/data-workspace";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
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
} from "../lib/site-utils";
import {
  addGroupToState,
  addSiteToState,
  deleteGroupsFromState,
  permanentlyDeleteTrashedSiteFromState,
  purgeExpiredTrashFromState,
  restoreAllTrashedSitesFromState,
  restoreTrashedSiteFromState,
  setTrashRetentionInState,
  trashSiteFromState,
  updateSiteInState,
  mergeGroupImportIntoState,
  type GroupImportResult,
  importGithubRepositoryBatchToState,
  type GithubRepositoryBatchImport,
  type GithubRepositoryBatchImportResult,
  importGithubRepositoriesToState,
  type GithubRepositoryImportResult,
} from "../lib/site-state";
import {
  migrateGithubSitesInState,
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
  SiteSortMode,
  SiteWorkspace,
  TrashRetentionDays,
  WallpaperSettings,
} from "../types";
import type {
  GithubOwnerProfile,
  GithubRepositorySummary,
} from "../lib/github-repository-api";

export interface DataImportOperation {
  id: number;
  result: ReturnType<typeof applyDataImport>;
  status: "saving" | "saved" | "failed" | "superseded";
}

interface SaveTask {
  state: SiteCollectionState;
  sequence: number;
  importId?: number;
  status: "pending" | "saved" | "failed";
  result: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface SiteHubApi {
  state: SiteCollectionState;
  isLoading: boolean;
  recovered: boolean;
  storageError: string | null;
  retrySave: () => Promise<boolean>;
  dataImport: DataImportOperation | null;
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
  deleteGroups: (ids: string[]) => void;
  importData: (request: ImportRequest) => DataImportOperation;
  importGroup: (
    targetGroupId: string,
    payload: GroupExportPayload,
  ) => GroupImportResult;
  importGithubRepositories: (
    owner: GithubOwnerProfile,
    repositories: GithubRepositorySummary[],
    selectedRepositoryIds?: Set<number>,
  ) => GithubRepositoryImportResult;
  importGithubRepositoryBatch: (
    imports: GithubRepositoryBatchImport[],
  ) => GithubRepositoryBatchImportResult;
  migrateGithubSites: () => ReturnType<typeof migrateGithubSitesInState>;
  reset: () => void;
  replaceState: (state: SiteCollectionState) => void;
  saveSettings: (
    brand: BrandSettings,
    appearance: AppearanceSettings,
    wallpaper: WallpaperSettings,
  ) => void;
  recordSearch: (query: string) => Promise<void>;
  deleteSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  setDisplayMode: (mode: SiteDisplayMode, workspace?: SiteWorkspace) => void;
  setSortMode: (mode: SiteSortMode, workspace?: SiteWorkspace) => void;
}

export function useSiteHub(preparedStore?: SiteHubStore): SiteHubApi {
  const storeRef = useRef<SiteHubStore | null>(null);
  if (!storeRef.current) storeRef.current = preparedStore ?? createSiteHubStore();
  const store = storeRef.current;
  const initial = store.initial;
  const [state, setRenderedState] = useState(
    () => initial?.state ?? createDefaultState(),
  );
  const [isLoading, setIsLoading] = useState(!initial);
  const [recovered, setRecovered] = useState(initial?.recovered ?? false);
  const stateRef = useRef(state);
  const hasLoaded = useRef(Boolean(initial));
  const [dataImport, setRenderedDataImport] = useState<DataImportOperation | null>(null);
  const dataImportRef = useRef<DataImportOperation | null>(null);
  const importSequence = useRef(0);
  const importLineage = useRef<{ sites: string[]; groups: string[] } | null>(null);
  const importSaveSequence = useRef(0);
  const setDataImport = useCallback((operation: DataImportOperation) => {
    dataImportRef.current = operation;
    setRenderedDataImport(operation);
  }, []);
  const supersedeDataImport = useCallback(() => {
    const operation = dataImportRef.current;
    if (operation && (operation.status === "saving" || operation.status === "failed")) {
      setDataImport({ ...operation, status: "superseded" });
    }
    importLineage.current = null;
  }, [setDataImport]);
  // Mutations and result-returning imports share the same current value,
  // including multiple commands issued before React commits a render.
  const setState = useCallback((update: SetStateAction<SiteCollectionState>) => {
    const next = typeof update === "function" ? update(stateRef.current) : update;
    const lineage = importLineage.current;
    if (lineage && (lineage.sites.some(id => !next.sites.some(site => site.id === id))
      || lineage.groups.some(id => !next.groups.some(group => group.id === id)))) {
      supersedeDataImport();
    }
    stateRef.current = next;
    setRenderedState(next);
  }, [supersedeDataImport]);
  const skipSaveState = useRef<SiteCollectionState | null>(
    initial?.recovered ? state : null,
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const saves = useRef(new WeakMap<SiteCollectionState, SaveTask>());
  const saveQueue = useRef<SaveTask[]>([]);
  const saving = useRef(false);
  const saveSequence = useRef(0);
  // Keep only expected notifications for actual value changes. Same-value
  // writes emit no event; changed writes remain identifiable even when their
  // onChanged notification arrives after many later edits or acknowledgements.
  const knownPersisted = useRef(store.getPersistedValue ? store.getPersistedValue() : initial ? JSON.stringify(initial.state) : null);
  const ownWrites = useRef(new Map<string, number[]>());
  const saveSnapshot = useCallback((next: SiteCollectionState, retry = false) => {
    const existing = saves.current.get(next);
    if (existing && (!retry || existing.status !== "failed")) return existing.result;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<void>((accept, decline) => { resolve = accept; reject = decline; });
    const operation = dataImportRef.current;
    const importId = operation && importLineage.current
      && (operation.status === "saving" || operation.status === "failed") ? operation.id : undefined;
    const task: SaveTask = { state: next, sequence: ++saveSequence.current, importId, status: "pending", result, resolve, reject };
    if (importId !== undefined && operation) {
      importSaveSequence.current = task.sequence;
      setDataImport({ ...operation, status: "saving" });
    }
    saves.current.set(next, task);
    saveQueue.current.push(task);
    const drain = () => {
      if (saving.current) return;
      const current = saveQueue.current.shift();
      if (!current) return;
      saving.current = true;
      const serialized = JSON.stringify(current.state);
      if (store.subscribe && serialized !== knownPersisted.current) {
        ownWrites.current.set(serialized, [...(ownWrites.current.get(serialized) ?? []), current.sequence]);
      }
      const finishImport = (status: "saved" | "failed") => {
        const active = dataImportRef.current;
        if (active && active.id === current.importId && importLineage.current
          && current.sequence === importSaveSequence.current
          && (active.status === "saving" || active.status === "failed")) {
          setDataImport({ ...active, status });
        }
      };
      let pending: Promise<void>;
      try { pending = store.save(current.state); }
      catch (error) { pending = Promise.reject(error); }
      void pending.then(() => {
        current.status = "saved";
        knownPersisted.current = serialized;
        if (stateRef.current === current.state && current.sequence === saveSequence.current) setStorageError(null);
        finishImport("saved");
        current.resolve();
      }, (error: unknown) => {
        current.status = "failed";
        const remaining = ownWrites.current.get(serialized)?.filter(sequence => sequence !== current.sequence);
        if (remaining?.length) ownWrites.current.set(serialized, remaining);
        else ownWrites.current.delete(serialized);
        if (stateRef.current === current.state && current.sequence === saveSequence.current) setStorageError("更改尚未保存，请重试保存。");
        finishImport("failed");
        current.reject(error);
      }).finally(() => { saving.current = false; drain(); });
    };
    drain();
    return result;
  }, [store, setDataImport]);
  const retrySave = useCallback(() => {
    return saveSnapshot(stateRef.current, true).then(() => true, () => false);
  }, [saveSnapshot]);

  useEffect(() => {
    if (hasLoaded.current) return;
    let active = true;

    store
      .load()
      .then((loaded) => {
        if (!active) return;
        knownPersisted.current = store.getPersistedValue ? store.getPersistedValue() : JSON.stringify(loaded.state);
        setState(loaded.state);
        setRecovered(loaded.recovered);
        skipSaveState.current = loaded.recovered ? loaded.state : null;
        hasLoaded.current = true;
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        const defaults = createDefaultState();
        setState(defaults);
        setRecovered(true);
        skipSaveState.current = defaults;
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
      const persistedValue = store.getPersistedValue ? store.getPersistedValue() : incoming;
      const ownWrite = persistedValue === null ? undefined : ownWrites.current.get(persistedValue);
      if (ownWrite?.length) {
        ownWrite.shift();
        if (!ownWrite.length && persistedValue !== null) ownWrites.current.delete(persistedValue);
        return;
      }
      knownPersisted.current = persistedValue;
      if (incoming === JSON.stringify(stateRef.current)) return;
      supersedeDataImport();
      // An incoming replacement invalidates snapshots which have not started.
      // An already-running adapter write cannot be cancelled; follow it with
      // the replacement so it cannot remain the final on-disk state here.
      const cancelled = saveQueue.current.splice(0);
      for (const task of cancelled) {
        task.status = "failed";
        task.reject(new Error("待保存内容已被外部更新替换。"));
      }
      skipSaveState.current = loaded.state;
      setState(loaded.state);
      setRecovered(loaded.recovered);
      setStorageError(null);
      if (saving.current) void saveSnapshot(loaded.state).catch(() => undefined);
    });
  }, [isLoading, store, saveSnapshot, supersedeDataImport]);

  useEffect(() => {
    if (!hasLoaded.current || isLoading) return;
    if (state === skipSaveState.current || state !== stateRef.current) return;
    void saveSnapshot(state).catch(() => undefined);
  }, [isLoading, state, saveSnapshot]);

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

  const deleteGroups = useCallback<SiteHubApi["deleteGroups"]>((ids) => {
    setState(current => deleteGroupsFromState(current, ids));
    setRecovered(false);
  }, []);

  const deleteGroup = useCallback<SiteHubApi["deleteGroup"]>((id) => {
    deleteGroups([id]);
  }, [deleteGroups]);

  const importData = useCallback((request: ImportRequest) => {
    const before = stateRef.current;
    const applied = applyDataImport(before, request);
    // Even a no-op import owns its acknowledgement rather than reusing an
    // unrelated previously saved operation for the same object reference.
    const result = applied.state === before ? { ...applied, state: { ...applied.state } } : applied;
    supersedeDataImport();
    setState(result.state);
    importLineage.current = {
      sites: result.state.sites.filter(site => request.destination.kind === "replace" || !before.sites.some(previous => previous.id === site.id)).map(site => site.id),
      groups: result.state.groups.filter(group => request.destination.kind === "replace" || !before.groups.some(previous => previous.id === group.id)).map(group => group.id),
    };
    const operation: DataImportOperation = { id: ++importSequence.current, result, status: "saving" };
    setDataImport(operation);
    setRecovered(false);
    void saveSnapshot(result.state).catch(() => undefined);
    return operation;
  }, [saveSnapshot, setDataImport, setState, supersedeDataImport]);

  const importGroup = useCallback<SiteHubApi["importGroup"]>(
    (targetGroupId, payload) => {
      const result = mergeGroupImportIntoState(
        stateRef.current,
        targetGroupId,
        payload,
      );
      setState(result.state);
      setRecovered(false);
      return result;
    },
    [],
  );

  const importGithubRepositories = useCallback<
    SiteHubApi["importGithubRepositories"]
  >((owner, repositories, selectedRepositoryIds) => {
    const result = importGithubRepositoriesToState(
      stateRef.current,
      owner,
      repositories,
      selectedRepositoryIds,
    );
    setState(result.state);
    setRecovered(false);
    return result;
  }, []);

  const importGithubRepositoryBatch = useCallback<
    SiteHubApi["importGithubRepositoryBatch"]
  >((imports) => {
    const result = importGithubRepositoryBatchToState(stateRef.current, imports);
    setState(result.state);
    setRecovered(false);
    return result;
  }, []);

  const migrateGithubSites = useCallback(() => {
    const result = migrateGithubSitesInState(stateRef.current);
    setState(result.state);
    setRecovered(false);
    return result;
  }, []);

  const reset = useCallback(() => {
    supersedeDataImport();
    const defaults = createDefaultState();
    setState((current) => ({
      ...defaults,
      brand: current.brand,
      appearance: current.appearance,
      wallpaper: current.wallpaper,
      searchHistory: current.searchHistory,
      displayMode: current.displayMode,
      displayModeByWorkspace: current.displayModeByWorkspace,
      sortMode: current.sortMode,
      sortModeByWorkspace: current.sortModeByWorkspace,
      deletedSites: current.deletedSites,
      trashRetentionDays: current.trashRetentionDays,
    }));
    setRecovered(false);
  }, []);

  const replaceState = useCallback((nextState: SiteCollectionState) => {
    supersedeDataImport();
    skipSaveState.current = null;
    setState((current) => ({
      ...nextState,
      searchHistory: current.searchHistory,
      deletedSites: current.deletedSites,
      trashRetentionDays: current.trashRetentionDays,
    }));
    setRecovered(false);
  }, []);

  const saveSettings = useCallback<SiteHubApi["saveSettings"]>(
    (brand, appearance, wallpaper) => {
      setState((current) => ({
        ...current,
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
      setState(next);
      await saveSnapshot(next);
    },
    [saveSnapshot],
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

  const setDisplayMode = useCallback(
    (displayMode: SiteDisplayMode, workspace: SiteWorkspace = "main") => {
      setState((current) => ({
        ...current,
        displayMode,
        displayModeByWorkspace: {
          ...current.displayModeByWorkspace,
          [workspace]: displayMode,
        },
      }));
      setRecovered(false);
    },
    [],
  );

  const setSortMode = useCallback(
    (sortMode: SiteSortMode, workspace: SiteWorkspace = "main") => {
      setState((current) => ({
        ...current,
        sortMode,
        sortModeByWorkspace: {
          ...current.sortModeByWorkspace,
          [workspace]: sortMode,
        },
      }));
      setRecovered(false);
    },
    [],
  );

  return {
    state,
    isLoading,
    recovered,
    storageError,
    retrySave,
    dataImport,
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
    commitSites,
    addGroup,
    updateGroup,
    reorderGroups,
    reorderGroupBlock: reorderGroupsBlock,
    deleteGroup,
    deleteGroups,
    importData,
    importGroup,
    importGithubRepositories,
    importGithubRepositoryBatch,
    migrateGithubSites,
    reset,
    replaceState,
    saveSettings,
    recordSearch,
    deleteSearchHistory,
    clearSearchHistory,
    setDisplayMode,
    setSortMode,
  };
}
