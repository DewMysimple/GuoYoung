import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { createSiteHubStore, type SiteHubStore } from "../lib/state-store";
import { createGroupExportPayload, serializeExport } from "../lib/data-transfer";
import { parseTransferFile, type ImportRequest } from "../lib/data-workspace";
import type { SiteCollectionState } from "../types";
import type { ChromiumExtensionApi } from "../lib/browser-runtime";
import { STORAGE_KEY } from "../lib/storage";
import { useSiteHub } from "./use-site-hub";

vi.mock("../lib/state-store", () => ({ createSiteHubStore: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function setupStore() {
  const initial = { state: createDefaultState(), recovered: false };
  const save = vi.fn().mockResolvedValue(undefined);
  let receive: Parameters<NonNullable<SiteHubStore["subscribe"]>>[0];
  vi.mocked(createSiteHubStore).mockReturnValue({
    mode: "extension", initial, load: async () => initial, save,
    subscribe: (listener) => { receive = listener; return () => {}; },
  });
  return { initial, save, receive: (state: typeof initial.state) => receive({ state, recovered: false }) };
}

function importRequest(name = "Imported collection"): ImportRequest {
  const payload = createGroupExportPayload(createDefaultState(), "design");
  payload.group.name = name;
  payload.sites = [{ name: "Synthetic report", url: "https://import.example/Private/Report?view=AbC#section-2", order: 0 },
    { name: "Existing", url: "https://www.google.com/", order: 1 }];
  return { file: parseTransferFile(JSON.stringify(payload)), keys: ["0"], destination: { kind: "new" } };
}

function controlledWrites(store: ReturnType<typeof setupStore>) {
  let persisted = store.initial.state;
  const writes: { state: SiteCollectionState; resolve: () => void; reject: (error: Error) => void }[] = [];
  store.save.mockClear();
  store.save.mockImplementation((state: SiteCollectionState) => new Promise<void>((resolve, reject) => {
    writes.push({ state, resolve: () => { persisted = state; resolve(); }, reject });
  }));
  return { writes, persisted: () => persisted };
}

describe("collection state updates", () => {
  it("reports a failed save and retries the latest collection", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    store.save.mockRejectedValueOnce(new Error("quota"));
    await act(async () => result.current.setSortMode("heat"));
    expect(result.current.storageError).toContain("尚未保存");
    await act(async () => { await result.current.retrySave(); });
    expect(result.current.storageError).toBeNull();
    expect(store.save).toHaveBeenLastCalledWith(result.current.state);
  });

  it("persists a search once before resolving, without an effect writing it again", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    store.save.mockClear();
    await act(async () => { await result.current.recordSearch("maintenance"); });
    expect(store.save).toHaveBeenCalledTimes(1);
  });
  it("composes an edit and a click before React renders", () => {
    setupStore();
    const { result } = renderHook(() => useSiteHub());
    act(() => {
      result.current.setDisplayMode("grouped");
      result.current.recordSiteClick("google");
    });
    expect(result.current.state.displayModeByWorkspace.main).toBe("grouped");
    expect(result.current.state.sites.find((site) => site.id === "google")?.clickCount).toBe(1);
  });

  it("does not resurrect a deleted site when recording a search in the same batch", async () => {
    setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {
      result.current.deleteSite("google");
      await result.current.recordSearch("maintenance");
    });
    expect(result.current.state.sites.some((site) => site.id === "google")).toBe(false);
    expect(result.current.state.deletedSites.some((entry) => entry.site.id === "google")).toBe(true);
    expect(result.current.state.searchHistory[0].query).toBe("maintenance");
  });

  it("saves a local edit batched after an external update without echoing the external update", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    store.save.mockClear();
    const external = { ...store.initial.state, brand: { ...store.initial.state.brand, name: "External" } };
    act(() => store.receive(external));
    expect(store.save).not.toHaveBeenCalled();
    await act(async () => {
      store.receive({ ...external, brand: { ...external.brand, name: "Latest" } });
      result.current.setSortMode("heat");
    });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      brand: expect.objectContaining({ name: "Latest" }),
      sortModeByWorkspace: expect.objectContaining({ main: "heat" }),
    }));
  });
});

describe("import persistence acknowledgements", () => {
  it.each(["formatted string", "legacy object"])("does not mistake an initial %s normalization notification for an external replacement", async encoding => {
    const { createSiteHubStore: actualCreateStore } = await vi.importActual<typeof import("../lib/state-store")>("../lib/state-store");
    let persisted: unknown = encoding === "legacy object" ? createDefaultState() : JSON.stringify(createDefaultState(), null, 2);
    let receive!: (changes: Record<string, { newValue?: unknown }>, area: string) => void;
    const writes: { value: string; resolve: () => void }[] = [];
    const api: ChromiumExtensionApi = { runtime: { id: "synthetic-extension" }, storage: {
      local: { get: async () => ({ [STORAGE_KEY]: persisted }), set: values => new Promise<void>(resolve => {
        const value = values[STORAGE_KEY] as string;
        writes.push({ value, resolve: () => { persisted = value; resolve(); } });
      }) },
      onChanged: { addListener: listener => { receive = listener; }, removeListener: () => {} },
    } };
    const { result } = renderHook(() => useSiteHub(actualCreateStore(api, localStorage)));
    await act(async () => {});
    expect(writes).toHaveLength(1);
    act(() => { result.current.setSortMode("heat"); });
    expect(result.current.state.sortModeByWorkspace.main).toBe("heat");
    act(() => { receive({ [STORAGE_KEY]: { newValue: writes[0].value } }, "local"); });
    expect(result.current.state.sortModeByWorkspace.main).toBe("heat");
    await act(async () => { writes[0].resolve(); });
    await act(async () => { writes[1].resolve(); });
    expect(JSON.parse(persisted as string).sortModeByWorkspace.main).toBe("heat");
  });

  it("waits for the actual save, applies an import once, and shares its pending write with retry", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    let operation!: ReturnType<typeof result.current.importData>;
    act(() => { operation = result.current.importData(importRequest()); });
    expect(operation.result).toMatchObject({ added: 1, skipped: 1, created: 1 });
    expect(result.current.dataImport).toMatchObject({ id: operation.id, status: "saving" });
    expect(disk.persisted().sites.some(site => site.name === "Synthetic report")).toBe(false);
    expect(store.save).toHaveBeenCalledTimes(1);
    let retry!: Promise<boolean>;
    act(() => { retry = result.current.retrySave(); });
    expect(store.save).toHaveBeenCalledTimes(1);
    await act(async () => { disk.writes[0].resolve(); expect(await retry).toBe(true); });
    expect(result.current.dataImport).toMatchObject({ status: "saved", result: { added: 1, skipped: 1, created: 1 } });
    expect(disk.persisted().groups.filter(group => group.name === "Imported collection")).toHaveLength(1);
    expect(disk.persisted().sites.filter(site => site.name === "Synthetic report")).toHaveLength(1);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("keeps failed import context and retries the latest state without repeating its business transformation", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    act(() => { result.current.importData(importRequest()); });
    const imported = result.current.dataImport!;
    await act(async () => { disk.writes[0].reject(new Error("quota")); });
    expect(result.current.storageError).toContain("尚未保存");
    expect(result.current.dataImport).toMatchObject({ id: imported.id, status: "failed", result: imported.result });
    expect(disk.persisted()).toBe(store.initial.state);
    let failedRetry!: Promise<boolean>;
    act(() => { failedRetry = result.current.retrySave(); });
    await act(async () => { disk.writes[1].reject(new Error("quota again")); expect(await failedRetry).toBe(false); });
    expect(result.current.dataImport?.status).toBe("failed");
    // This normal edit creates a newer snapshot containing the same import.
    act(() => { result.current.setSortMode("heat"); });
    let recoveredRetry!: Promise<boolean>;
    act(() => { recoveredRetry = result.current.retrySave(); });
    expect(disk.writes).toHaveLength(3);
    await act(async () => { disk.writes[2].resolve(); expect(await recoveredRetry).toBe(true); });
    expect(result.current.storageError).toBeNull();
    expect(result.current.dataImport).toMatchObject({ id: imported.id, status: "saved", result: { added: 1, skipped: 1, created: 1 } });
    expect(disk.persisted().sortModeByWorkspace.main).toBe("heat");
    expect(disk.persisted().groups.filter(group => group.name === "Imported collection")).toHaveLength(1);
    expect(disk.persisted().sites.filter(site => site.name === "Synthetic report")).toHaveLength(1);
    // Recreate a hook from the successfully persisted snapshot, as a reload does.
    const reload = renderHook(() => useSiteHub({ mode: "web", initial: { state: disk.persisted(), recovered: false }, load: async () => ({ state: disk.persisted(), recovered: false }), save: async () => {} }));
    expect(reload.result.current.state.sites.some(site => site.name === "Synthetic report")).toBe(true);
    expect(reload.result.current.state.sortModeByWorkspace.main).toBe("heat");
  });

  it("serializes an import and a later edit, and ignores its own older extension notification", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    act(() => { result.current.importData(importRequest()); });
    const first = result.current.state;
    act(() => { result.current.setDisplayMode("grouped"); });
    expect(store.save).toHaveBeenCalledTimes(1);
    act(() => { store.receive(first); });
    expect(result.current.state.displayModeByWorkspace.main).toBe("grouped");
    await act(async () => { disk.writes[0].resolve(); });
    expect(disk.writes).toHaveLength(2);
    expect(result.current.dataImport?.status).toBe("saving");
    await act(async () => { disk.writes[1].reject(new Error("newer write failed")); });
    expect(result.current.storageError).toContain("尚未保存");
    expect(result.current.dataImport?.status).toBe("failed");
    expect(result.current.state.displayModeByWorkspace.main).toBe("grouped");
    let retry!: Promise<boolean>;
    act(() => { retry = result.current.retrySave(); });
    await act(async () => { disk.writes[2].resolve(); expect(await retry).toBe(true); });
    expect(disk.persisted().displayModeByWorkspace.main).toBe("grouped");
    expect(result.current.dataImport?.status).toBe("saved");
  });

  it("continues after an older write fails and only accepts the newest operation's receipt", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    act(() => { result.current.importData(importRequest("First import")); });
    const firstId = result.current.dataImport!.id;
    act(() => { result.current.importData(importRequest("Second import")); });
    const secondId = result.current.dataImport!.id;
    expect(secondId).not.toBe(firstId);
    await act(async () => { disk.writes[0].reject(new Error("older failure")); });
    expect(disk.writes).toHaveLength(2);
    expect(result.current.storageError).toBeNull();
    expect(result.current.dataImport).toMatchObject({ id: secondId, status: "saving" });
    await act(async () => { disk.writes[1].resolve(); });
    expect(result.current.dataImport).toMatchObject({ id: secondId, status: "saved", result: { added: 0, skipped: 2, created: 1 } });
    expect(disk.persisted().groups.filter(group => group.name.endsWith("import"))).toHaveLength(2);
  });

  it("does not attribute a newer operation's failure to the older successful import", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    act(() => { result.current.importData(importRequest("First import")); });
    act(() => { result.current.importData(importRequest("Second import")); });
    const secondId = result.current.dataImport!.id;
    await act(async () => { disk.writes[0].resolve(); });
    expect(result.current.dataImport).toMatchObject({ id: secondId, status: "saving" });
    await act(async () => { disk.writes[1].reject(new Error("new failure")); });
    act(() => { store.receive(disk.writes[0].state); });
    expect(result.current.dataImport).toMatchObject({ id: secondId, status: "failed" });
    expect(result.current.storageError).toContain("尚未保存");
    expect(result.current.state.groups.some(group => group.name === "Second import")).toBe(true);
  });

  it.each(["success", "failure"])("keeps the second import's entity protection after the first import's late %s", async firstReceipt => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    act(() => { result.current.importData(importRequest("First import")); });
    const secondRequest = importRequest("Second import");
    secondRequest.file.groups[0].payload.sites[0] = { name: "Second report", url: "https://second.example/Report", order: 0 };
    act(() => { result.current.importData(secondRequest); });
    const second = result.current.dataImport!;
    const secondSite = result.current.state.sites.find(site => site.name === "Second report")!;
    await act(async () => {
      if (firstReceipt === "success") disk.writes[0].resolve();
      else disk.writes[0].reject(new Error("older import failed"));
    });
    expect(result.current.dataImport).toMatchObject({ id: second.id, status: "saving" });
    expect(disk.writes).toHaveLength(2);
    act(() => { result.current.deleteSite(secondSite.id); });
    expect(result.current.dataImport).toMatchObject({ id: second.id, status: "superseded" });
    await act(async () => { disk.writes[1].resolve(); });
    await act(async () => { disk.writes[2].resolve(); });
    expect(result.current.dataImport).toMatchObject({ id: second.id, status: "superseded" });
    expect(disk.persisted().sites.some(site => site.id === secondSite.id)).toBe(false);
    expect(disk.persisted().deletedSites.some(entry => entry.site.id === secondSite.id)).toBe(true);
  });

  it("keeps successful statistics stable through normal edits, and gives the next import its own retry and invalidation lifecycle", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    act(() => { result.current.importData(importRequest("Completed import")); });
    await act(async () => { disk.writes[0].resolve(); });
    const completed = result.current.dataImport!;
    act(() => {
      result.current.recordSiteClick("google");
      result.current.setSortMode("heat");
      const current = result.current.state;
      result.current.saveSettings({ ...current.brand, name: "Edited after import" }, current.appearance, current.wallpaper);
    });
    await act(async () => { disk.writes[1].resolve(); });
    expect(result.current.dataImport).toBe(completed);
    expect(result.current.dataImport).toMatchObject({ status: "saved", result: { added: 1, skipped: 1, created: 1 } });
    expect(disk.persisted().sites.find(site => site.id === "google")?.clickCount).toBe(1);
    expect(disk.persisted().sortModeByWorkspace.main).toBe("heat");
    expect(disk.persisted().brand.name).toBe("Edited after import");

    const nextRequest = importRequest("Next import");
    nextRequest.file.groups[0].payload.sites[0] = { name: "Next report", url: "https://next.example/Report", order: 0 };
    act(() => { result.current.importData(nextRequest); });
    const next = result.current.dataImport!;
    expect(next.id).not.toBe(completed.id);
    await act(async () => { disk.writes[2].reject(new Error("next import failed")); });
    expect(result.current.dataImport).toMatchObject({ id: next.id, status: "failed" });
    let retry!: Promise<boolean>;
    act(() => { retry = result.current.retrySave(); });
    await act(async () => { disk.writes[3].resolve(); expect(await retry).toBe(true); });
    expect(result.current.dataImport).toMatchObject({ id: next.id, status: "saved", result: { added: 1, skipped: 1, created: 1 } });
    expect(disk.persisted().groups.filter(group => group.name === "Next import")).toHaveLength(1);
    expect(disk.persisted().sites.filter(site => site.name === "Next report")).toHaveLength(1);

    const pendingRequest = importRequest("Pending import");
    pendingRequest.file.groups[0].payload.sites[0] = { name: "Pending report", url: "https://pending.example/Report", order: 0 };
    act(() => { result.current.importData(pendingRequest); });
    const pendingId = result.current.dataImport!.id;
    const pendingSite = result.current.state.sites.find(site => site.name === "Pending report")!;
    act(() => { result.current.deleteSite(pendingSite.id); });
    expect(result.current.dataImport).toMatchObject({ id: pendingId, status: "superseded" });
    await act(async () => { disk.writes[4].resolve(); });
    await act(async () => { disk.writes[5].resolve(); });
    expect(result.current.dataImport).toMatchObject({ id: pendingId, status: "superseded" });
    expect(disk.persisted().sites.some(site => site.id === pendingSite.id)).toBe(false);
  });

  it("keeps failed-import entity protection after an unrelated save fails, and cannot report a deleted result as saved", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    act(() => { result.current.importData(importRequest()); });
    const operation = result.current.dataImport!;
    const added = result.current.state.sites.find(site => site.name === "Synthetic report")!;
    await act(async () => { disk.writes[0].reject(new Error("import failed")); });
    act(() => { result.current.setSortMode("heat"); });
    await act(async () => { disk.writes[1].reject(new Error("edited snapshot failed")); });
    expect(result.current.dataImport).toMatchObject({ id: operation.id, status: "failed" });
    act(() => { result.current.deleteSite(added.id); });
    expect(result.current.dataImport).toMatchObject({ id: operation.id, status: "superseded" });
    let retry!: Promise<boolean>;
    act(() => { retry = result.current.retrySave(); });
    await act(async () => { disk.writes[2].resolve(); expect(await retry).toBe(true); });
    expect(result.current.dataImport).toMatchObject({ id: operation.id, status: "superseded" });
    expect(disk.persisted().sites.some(site => site.id === added.id)).toBe(false);
  });

  it("does not claim an import succeeded after its entities or entire collection were replaced", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    act(() => { result.current.importData(importRequest()); });
    const added = result.current.state.sites.find(site => site.name === "Synthetic report")!;
    act(() => { result.current.deleteSite(added.id); });
    expect(result.current.dataImport?.status).toBe("superseded");
    await act(async () => { disk.writes[0].resolve(); });
    await act(async () => { disk.writes[1].resolve(); });
    expect(result.current.dataImport?.status).toBe("superseded");
    expect(disk.persisted().sites.some(site => site.id === added.id)).toBe(false);
    act(() => { result.current.importData(importRequest("Pending replacement")); });
    act(() => { result.current.replaceState(createDefaultState()); });
    await act(async () => { disk.writes[2].resolve(); });
    await act(async () => { disk.writes[3].resolve(); });
    expect(result.current.dataImport?.status).toBe("superseded");
    expect(disk.persisted().groups.some(group => group.name === "Pending replacement")).toBe(false);
  });

  it("cancels queued stale saves on an external replacement and preserves that replacement after an in-flight write", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    act(() => { result.current.importData(importRequest()); });
    act(() => { result.current.setSortMode("heat"); });
    const replacement = { ...createDefaultState(), brand: { ...createDefaultState().brand, name: "External replacement" } };
    act(() => { store.receive(replacement); });
    expect(result.current.dataImport?.status).toBe("superseded");
    await act(async () => { disk.writes[0].resolve(); });
    expect(disk.writes).toHaveLength(2);
    expect(disk.writes[1].state).toBe(replacement);
    await act(async () => { disk.writes[1].resolve(); });
    expect(disk.persisted()).toBe(replacement);
    expect(result.current.state).toBe(replacement);
    expect(result.current.dataImport?.status).toBe("superseded");
  });

  it("preserves replacement-import recovery data and acknowledges even an all-duplicate import", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    const disk = controlledWrites(store);
    const backup = createDefaultState(); backup.sites = [];
    act(() => { result.current.importData({ file: parseTransferFile(serializeExport(backup)), keys: [], destination: { kind: "replace" } }); });
    expect(result.current.state.deletedSites).toBe(store.initial.state.deletedSites);
    expect(result.current.state.searchHistory).toBe(store.initial.state.searchHistory);
    expect(result.current.dataImport?.status).toBe("saving");
    await act(async () => { disk.writes[0].resolve(); });
    expect(result.current.dataImport?.status).toBe("saved");
    const request = importRequest(); request.destination = { kind: "existing", groupId: "design" };
    act(() => { result.current.importData(request); });
    await act(async () => { disk.writes[1].resolve(); });
    act(() => { result.current.importData(request); });
    await act(async () => { disk.writes[2].resolve(); });
    expect(result.current.dataImport).toMatchObject({ status: "saved", result: { added: 0, skipped: 2, created: 0 } });
  });

  it("consumes its own very late notifications after many writes without expiring their provenance", async () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    await act(async () => {});
    await act(async () => { result.current.setSortMode("heat"); });
    const older = result.current.state;
    for (let index = 0; index < 12; index++) {
      await act(async () => { result.current.recordSiteClick("google"); });
    }
    const latest = result.current.state;
    const now = Date.now();
    const time = vi.spyOn(Date, "now").mockReturnValue(now + 60_000);
    try {
      act(() => { store.receive(older); });
      expect(result.current.state).toBe(latest);
      // The expected own notification was consumed once. A subsequent genuine
      // external write of that value is still applied by the existing policy.
      act(() => { store.receive(older); });
      expect(result.current.state).toBe(older);
    } finally { time.mockRestore(); }
  });
});
