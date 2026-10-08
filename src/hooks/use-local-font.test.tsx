import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLocalFont } from "./use-local-font";

const fontFiles = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../lib/local-fonts", () => ({ loadLocalFontBlob: fontFiles.load, getLocalFontFamily: (id: string) => `local-${id}` }));
const add = vi.fn(), remove = vi.fn();
let loadFont: (family: string) => Promise<void>;

beforeEach(() => {
  vi.clearAllMocks();
  fontFiles.load.mockReset();
  loadFont = async () => {};
  vi.stubGlobal("FontFace", class {
    constructor(readonly family: string) {}
    async load() { await loadFont(this.family); return this; }
  });
  Object.defineProperty(document, "fonts", { configurable: true, value: { add, delete: remove } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fonts");
});

function blob() {
  const result = new Blob(["font"]);
  Object.defineProperty(result, "arrayBuffer", { value: async () => new Uint8Array(4).buffer });
  return result;
}

it("registers a saved font in this document and removes it on unmount", async () => {
  fontFiles.load.mockResolvedValue(blob());
  const view = renderHook(() => useLocalFont({ fontFamily: "custom", customFontAssetId: "saved" }));
  await waitFor(() => expect(add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ family: "local-saved" })));
  expect(view.result.current).toEqual({ loading: false, error: null });
  view.unmount();
  expect(remove).toHaveBeenCalledExactlyOnceWith(add.mock.calls[0][0]);
});

it("does not register a stale font when the selection changes during loading", async () => {
  fontFiles.load.mockResolvedValue(blob());
  let finishOld!: () => void;
  loadFont = family => family === "local-old" ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve();
  const view = renderHook(({ id }) => useLocalFont({ fontFamily: "custom", customFontAssetId: id }), { initialProps: { id: "old" } });
  await waitFor(() => expect(finishOld).toBeDefined());
  view.rerender({ id: "current" });
  await waitFor(() => expect(add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ family: "local-current" })));
  await act(async () => finishOld());
  expect(add).toHaveBeenCalledTimes(1);
  expect(view.result.current).toEqual({ loading: false, error: null });
  view.unmount();
});

it("does not read inactive assets and cancels a pending read when leaving custom mode", async () => {
  let finish!: (value: Blob) => void;
  fontFiles.load.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = renderHook(({ family }) => useLocalFont({ fontFamily: family, customFontAssetId: "saved" }), { initialProps: { family: "default" } });
  expect(fontFiles.load).not.toHaveBeenCalled();
  view.rerender({ family: "custom" });
  expect(view.result.current.loading).toBe(true);
  view.rerender({ family: "default" });
  await act(async () => finish(blob()));
  expect(add).not.toHaveBeenCalled();
  expect(view.result.current).toEqual({ loading: false, error: null });
  view.unmount();
});

it("exposes a missing asset error without changing the saved selection", async () => {
  fontFiles.load.mockRejectedValue(new Error("字体已丢失"));
  const view = renderHook(() => useLocalFont({ fontFamily: "custom", customFontAssetId: "saved" }));
  await waitFor(() => expect(view.result.current).toEqual({ loading: false, error: "字体已丢失" }));
  expect(add).not.toHaveBeenCalled();
  view.unmount();
});
