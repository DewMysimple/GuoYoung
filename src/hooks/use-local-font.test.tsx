import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLocalFont } from "./use-local-font";
import { MissingLocalFontError } from "../lib/local-fonts";

const fontFiles = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../lib/local-fonts", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/local-fonts")>(),
  loadLocalFontBlob: fontFiles.load,
  getLocalFontFamily: (id: string) => `local-${id}`,
}));
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
  cleanup();
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
  expect(view.result.current).toEqual({ assetId: "saved", loading: false, error: null, status: "ready" });
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
  expect(view.result.current).toEqual({ assetId: "current", loading: false, error: null, status: "ready" });
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
  expect(view.result.current).toEqual({ assetId: undefined, loading: false, error: null, status: "inactive" });
  view.unmount();
});

it("exposes a missing asset error without changing the saved selection", async () => {
  const error = new MissingLocalFontError();
  fontFiles.load.mockRejectedValue(error);
  const view = renderHook(() => useLocalFont({ fontFamily: "custom", customFontAssetId: "saved" }));
  await waitFor(() => expect(view.result.current).toEqual({ assetId: "saved", loading: false, error: error.message, status: "missing" }));
  expect(add).not.toHaveBeenCalled();
  view.unmount();
});

it("keeps an unresolved asset read pending without reporting a missing file", async () => {
  let finish!: (value: Blob) => void;
  fontFiles.load.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = renderHook(() => useLocalFont({ fontFamily: "custom", customFontAssetId: "pending" }));
  await act(async () => {});
  expect(view.result.current).toEqual({ assetId: "pending", loading: true, error: null, status: "loading" });
  expect(add).not.toHaveBeenCalled();
  await act(async () => finish(blob()));
  expect(view.result.current).toEqual({ assetId: "pending", loading: false, error: null, status: "ready" });
  view.unmount();
});

it.each(["read-error", "load-error"])("distinguishes %s from a missing font without changing the asset ID", async stage => {
  if (stage === "read-error") fontFiles.load.mockRejectedValue(new Error("Synthetic IndexedDB failure"));
  else {
    fontFiles.load.mockResolvedValue(blob());
    loadFont = async () => { throw new Error("Synthetic font decoding failure"); };
  }
  const view = renderHook(() => useLocalFont({ fontFamily: "custom", customFontAssetId: "unavailable" }));
  await waitFor(() => expect(view.result.current.status).toBe(stage));
  expect(view.result.current).toEqual({ assetId: "unavailable", loading: false, status: stage,
    error: stage === "read-error" ? "本地字体暂时无法读取，请稍后重试或重新选择。" : "本地字体加载失败，请重新选择有效的字体文件。" });
  expect(add).not.toHaveBeenCalled();
  view.unmount();
});

it.each(["default", "serif", "custom"])("does not read files for %s font settings with no local asset reference", family => {
  const view = renderHook(() => useLocalFont({ fontFamily: family }));
  expect(view.result.current).toEqual({ assetId: undefined, loading: false, error: null, status: "inactive" });
  expect(fontFiles.load).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
  view.unmount();
});

it.each(["resolve", "reject"])("ignores a previous asset's delayed read %s after a new asset becomes ready", async outcome => {
  let finish!: (value: Blob) => void;
  let fail!: (error: Error) => void;
  fontFiles.load.mockImplementation(id => id === "old"
    ? new Promise((resolve, reject) => { finish = resolve; fail = reject; }) : Promise.resolve(blob()));
  const view = renderHook(({ id }) => useLocalFont({ fontFamily: "custom", customFontAssetId: id }), { initialProps: { id: "old" } });
  view.rerender({ id: "current" });
  await waitFor(() => expect(view.result.current.status).toBe("ready"));
  await act(async () => {
    if (outcome === "resolve") finish(blob());
    else fail(new MissingLocalFontError());
  });
  expect(view.result.current).toEqual({ assetId: "current", loading: false, error: null, status: "ready" });
  expect(add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ family: "local-current" }));
  view.unmount();
});

it("ignores an obsolete FontFace rejection after the current asset is registered", async () => {
  fontFiles.load.mockResolvedValue(blob());
  let failOld!: (error: Error) => void;
  loadFont = family => family === "local-old" ? new Promise((_, reject) => { failOld = reject; }) : Promise.resolve();
  const view = renderHook(({ id }) => useLocalFont({ fontFamily: "custom", customFontAssetId: id }), { initialProps: { id: "old" } });
  await waitFor(() => expect(failOld).toBeDefined());
  view.rerender({ id: "current" });
  await waitFor(() => expect(view.result.current.status).toBe("ready"));
  await act(async () => failOld(new Error("Synthetic obsolete load error")));
  expect(view.result.current).toEqual({ assetId: "current", loading: false, error: null, status: "ready" });
  expect(add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ family: "local-current" }));
  view.unmount();
});

it("returns a new asset's pending state on its first render instead of the previous missing result", async () => {
  fontFiles.load.mockImplementation(id => id === "old" ? Promise.reject(new MissingLocalFontError()) : new Promise(() => {}));
  const renders: { id: string; status: string; error: string | null }[] = [];
  const view = renderHook(({ id }) => {
    const state = useLocalFont({ fontFamily: "custom", customFontAssetId: id });
    renders.push({ id, status: state.status, error: state.error });
    return state;
  }, { initialProps: { id: "old" } });
  await waitFor(() => expect(view.result.current.status).toBe("missing"));
  view.rerender({ id: "current" });
  const currentRenders = renders.filter(render => render.id === "current");
  expect(currentRenders[0]).toEqual({ id: "current", status: "loading", error: null });
  expect(currentRenders.every(render => render.status === "loading" && render.error === null)).toBe(true);
  expect(view.result.current).toEqual({ assetId: "current", loading: true, error: null, status: "loading" });
  view.unmount();
});

it.each(["resolve", "reject"])("does not register or render after a pending asset read %ss following unmount", async outcome => {
  let finish!: (value: Blob) => void;
  let fail!: (error: Error) => void;
  fontFiles.load.mockImplementation(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
  const rendered = vi.fn();
  const view = renderHook(() => { const state = useLocalFont({ fontFamily: "custom", customFontAssetId: "pending" }); rendered(state); return state; });
  view.unmount();
  const renders = rendered.mock.calls.length;
  await act(async () => {
    if (outcome === "resolve") finish(blob());
    else fail(new MissingLocalFontError());
  });
  expect(add).not.toHaveBeenCalled();
  expect(rendered).toHaveBeenCalledTimes(renders);
});

it("reports unsupported font loading without treating the asset as missing or reading it", () => {
  vi.stubGlobal("FontFace", undefined);
  const view = renderHook(() => useLocalFont({ fontFamily: "custom", customFontAssetId: "saved" }));
  expect(view.result.current).toEqual({ assetId: "saved", loading: false, error: "当前浏览器无法加载字体文件", status: "unsupported" });
  expect(fontFiles.load).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
  view.unmount();
});
