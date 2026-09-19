import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { createSiteHubStore, type SiteHubStore } from "../lib/state-store";
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

  it("saves a local edit batched after an external update without echoing the external update", () => {
    const store = setupStore();
    const { result } = renderHook(() => useSiteHub());
    store.save.mockClear();
    const external = { ...store.initial.state, brand: { ...store.initial.state.brand, name: "External" } };
    act(() => store.receive(external));
    expect(store.save).not.toHaveBeenCalled();
    act(() => {
      store.receive({ ...external, brand: { ...external.brand, name: "Latest" } });
      result.current.setSortMode("heat");
    });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      brand: expect.objectContaining({ name: "Latest" }),
      sortModeByWorkspace: expect.objectContaining({ main: "heat" }),
    }));
  });
});
