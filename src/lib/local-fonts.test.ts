import { afterEach, beforeEach, expect, it, vi } from "vitest";

const assets = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("./asset-store", () => ({ loadAssetBlob: assets.load, saveAssetBlob: assets.save }));
let fontError: Error | undefined;
const loadedFonts: { family: string; bytes: ArrayBuffer }[] = [];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  assets.load.mockReset();
  assets.save.mockReset().mockResolvedValue(undefined);
  fontError = undefined;
  loadedFonts.length = 0;
  vi.stubGlobal("FontFace", class {
    constructor(readonly family: string, readonly bytes: ArrayBuffer) { loadedFonts.push(this); }
    async load() { if (fontError) throw fontError; return this; }
  });
});
afterEach(() => vi.unstubAllGlobals());

function fontFile(name: string, size = 4) {
  const file = new File([new Uint8Array(size)], name);
  Object.defineProperty(file, "arrayBuffer", { value: vi.fn(async () => new Uint8Array(size).buffer) });
  return file;
}

it.each(["TTF", "otf", "ttc", "woff", "woff2"])("validates a .%s font before storing it and returns a CSS-independent name", async extension => {
  const { prepareLocalFont, getLocalFontFamily, loadLocalFontBlob } = await import("./local-fonts");
  const file = fontFile(`我的字体.${extension}`);
  const result = await prepareLocalFont(file);
  expect(result.name).toBe("我的字体");
  expect(loadedFonts).toHaveLength(1);
  expect(loadedFonts[0].family).toBe(getLocalFontFamily(result.assetId));
  expect(assets.save).toHaveBeenCalledExactlyOnceWith("fonts", result.assetId, file);
  expect(await loadLocalFontBlob(result.assetId)).toBe(file);
  expect(assets.load).not.toHaveBeenCalled();
});

it.each(["invalid-extension", "empty", "oversized", "invalid-font"])("never stores a %s file", async reason => {
  const { prepareLocalFont, MAX_LOCAL_FONT_BYTES } = await import("./local-fonts");
  const file = fontFile(reason === "invalid-extension" ? "font.exe" : "font.ttf", reason === "empty" ? 0 : 4);
  if (reason === "oversized") Object.defineProperty(file, "size", { value: MAX_LOCAL_FONT_BYTES + 1 });
  if (reason === "invalid-font") fontError = new Error("bad sfnt");
  await expect(prepareLocalFont(file)).rejects.toThrow();
  expect(assets.save).not.toHaveBeenCalled();
});

it("does not report a selected font when persistence fails", async () => {
  assets.save.mockRejectedValue(new Error("quota exceeded"));
  const { prepareLocalFont } = await import("./local-fonts");
  await expect(prepareLocalFont(fontFile("font.ttf"))).rejects.toThrow("quota exceeded");
});

it("shares successful in-flight reads while retrying missing or failed assets", async () => {
  const blob = new Blob(["font"]);
  assets.load.mockResolvedValueOnce(blob).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("read failed")).mockResolvedValueOnce(blob);
  const { loadLocalFontBlob } = await import("./local-fonts");
  const first = loadLocalFontBlob("font-good");
  expect(loadLocalFontBlob("font-good")).toBe(first);
  expect(await first).toBe(blob);
  expect(await loadLocalFontBlob("font-good")).toBe(blob);
  await expect(loadLocalFontBlob("font-retry")).rejects.toThrow("已丢失");
  await expect(loadLocalFontBlob("font-retry")).rejects.toThrow("read failed");
  expect(await loadLocalFontBlob("font-retry")).toBe(blob);
  expect(assets.load).toHaveBeenCalledTimes(4);
});

it("bounds the read cache and rejects IDs that could alter CSS", async () => {
  assets.load.mockResolvedValue(new Blob(["font"]));
  const { getLocalFontFamily, loadLocalFontBlob } = await import("./local-fonts");
  for (const id of ["font-a", "font-b", "font-c", "font-a"]) await loadLocalFontBlob(id);
  expect(assets.load).toHaveBeenCalledTimes(4);
  for (const id of ["", 'font\";color:red', "../../font", "x".repeat(81)]) expect(() => getLocalFontFamily(id)).toThrow();
});
