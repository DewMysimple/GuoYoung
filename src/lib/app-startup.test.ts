import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { prepareAppStore } from "./app-startup";
import { STORAGE_KEY } from "./storage";
import { THEME_STARTUP_KEY } from "./wallpaper-startup";
import { readFileSync } from "node:fs";

afterEach(() => { localStorage.clear(); delete window.__MYSIMPLE_STARTUP__; vi.unstubAllGlobals(); });

describe("first application commit", () => {
  it("uses storage changes received after the early read has already completed", async () => {
    const initial = createDefaultState();
    const newer = { ...initial, brand: { ...initial.brand, name: "Saved in another tab" } };
    let changed: (values: Record<string, unknown>, area: string) => void = () => undefined;
    const removeListener = vi.fn();
    vi.stubGlobal("chrome", { runtime: { id: "extension" }, storage: {
      local: { get: vi.fn().mockResolvedValue({ [STORAGE_KEY]: JSON.stringify(initial) }), set: vi.fn() },
      onChanged: { addListener: vi.fn(listener => { changed = listener; }), removeListener },
    } });
    // Exercise the shipped, CSP-compatible classic script rather than a test clone.
    const boot = readFileSync("public/wallpaper-boot.js", "utf8");
    window.eval(boot);
    await Promise.resolve();
    changed({ [STORAGE_KEY]: { newValue: JSON.stringify(newer) } }, "local");
    const store = await prepareAppStore();
    expect(store.initial?.state.brand.name).toBe(newer.brand.name);
    expect(removeListener).toHaveBeenCalledOnce();
  });
  it("prepares the authoritative extension result without a second read or an intermediate default state", async () => {
    const state = createDefaultState();
    state.brand.name = "Saved collection";
    state.appearance.theme = "dark";
    const get = vi.fn(), set = vi.fn();
    vi.stubGlobal("chrome", { runtime: { id: "extension" }, storage: { local: { get, set } } });
    const dispose = vi.fn();
    window.__MYSIMPLE_STARTUP__ = { read: () => Promise.resolve({ [STORAGE_KEY]: JSON.stringify(state) }), dispose };
    const store = await prepareAppStore();
    expect(store.initial).toEqual({ state, recovered: false });
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(window.__MYSIMPLE_STARTUP__).toBeUndefined();
    expect(dispose).toHaveBeenCalledOnce();
    expect(localStorage.getItem(THEME_STARTUP_KEY)).toBe("dark");
  });

  it("keeps failed reads in recovery without writing defaults to storage", async () => {
    const set = vi.fn();
    vi.stubGlobal("chrome", { runtime: { id: "extension" }, storage: { local: { get: vi.fn().mockRejectedValue(new Error("unavailable")), set } } });
    const store = await prepareAppStore();
    expect(store.initial?.recovered).toBe(true);
    expect(set).not.toHaveBeenCalled();
  });
});
