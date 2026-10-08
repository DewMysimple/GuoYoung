import { describe, expect, it } from "vitest";
import { createDefaultState, DEFAULT_WALLPAPER } from "../data/defaults";
import { normalizeWallpaper, parseStoredState } from "./storage";
import { parseImportFile, serializeExport } from "./data-transfer";

describe("wallpaper glass migration", () => {
  it("adds material defaults without replacing wallpaper composition or collections", () => {
    const state = createDefaultState();
    const wallpaper = { source: "local", localAssetId: "personal-image", fit: "contain", positionX: 23,
      positionY: 71, zoom: 140, blur: 4, overlay: 18, topbarOpacity: 35, topbarBlur: 7, topbarBlurEnabled: false };
    const loaded = parseStoredState(JSON.stringify({ ...state, version: 16, wallpaper }));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state.version).toBe(27);
    const { topbarBlurEnabled: _enabled, topbarOpacity: _opacity, ...effective } = wallpaper;
    expect(loaded.state.wallpaper).toEqual({ ...DEFAULT_WALLPAPER, ...effective,
      topbarStyle: "glass", topbarTransparency: 65, topbarBlur: 0 });
    expect(loaded.state.sites).toEqual(state.sites);
    expect(loaded.state.groups).toEqual(state.groups);
    expect(loaded.state.appearance).toEqual(state.appearance);
  });

  it.each([16, 17, 18, 23, 24])("preserves explicit glass settings in version %s and on repeat reads", version => {
    const state = createDefaultState();
    state.wallpaper = { ...state.wallpaper, glassTransparency: 92, glassBlur: 0, glassSaturation: 180,
      glassHighlight: 0, glassControlTransparency: 90, glassPanelTransparency: 70, glassPopoverTransparency: 40, glassShadow: 0 };
    const loaded = parseStoredState(JSON.stringify({ ...state, version }));
    expect(loaded.state.wallpaper).toEqual(state.wallpaper);
    expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
  });

  it("bounds untrusted settings and rejects invalid types", () => {
    expect(normalizeWallpaper({ glassTransparency: 250, glassBlur: -10, glassSaturation: "200", glassHighlight: null,
      sidebarStyle: "invalid", sidebarTransparency: 999, sidebarBlur: -1, topbarTransparency: "65" }))
      .toMatchObject({ glassTransparency: 100, glassBlur: 0, glassSaturation: 130, glassHighlight: 45,
        sidebarStyle: "shared", sidebarTransparency: 100, sidebarBlur: 0, topbarTransparency: 100 });
  });

  it("adds only missing public layer controls", () => {
    const state = createDefaultState();
    const { glassControlTransparency: _control, glassPanelTransparency: _panel,
      glassPopoverTransparency: _popover, glassShadow: _shadow, ...wallpaper } = state.wallpaper;
    const loaded = parseStoredState(JSON.stringify({ ...state, version: 17,
      wallpaper: { ...wallpaper, glassTransparency: 91, glassBlur: 3 } }));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state.wallpaper).toEqual({ ...DEFAULT_WALLPAPER, ...wallpaper, glassTransparency: 91, glassBlur: 3 });
    expect(loaded.state.sites).toEqual(state.sites);
    expect(loaded.state.groups).toEqual(state.groups);
    expect(normalizeWallpaper({ glassShadow: -1, glassPanelTransparency: 999,
      glassControlTransparency: "90", glassPopoverTransparency: null })).toMatchObject({
      glassShadow: 0, glassPanelTransparency: 100, glassControlTransparency: 82, glassPopoverTransparency: 55,
    });
  });

  it("adds sidebar controls to v22 without changing existing materials", () => {
    const original = createDefaultState();
    const { sidebarStyle: _style, sidebarTransparency: _alpha, sidebarBlur: _blur,
      topbarStyle: _topStyle, topbarTransparency: _topAlpha, ...wallpaper } = original.wallpaper;
    const legacy = { ...original, version: 22, wallpaper: { ...wallpaper, glassPanelTransparency: 83, topbarOpacity: 27 } };
    const loaded = parseStoredState(JSON.stringify(legacy));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state.wallpaper).toEqual({ ...DEFAULT_WALLPAPER, ...wallpaper,
      glassPanelTransparency: 83, topbarStyle: "glass", topbarTransparency: 73 });
    expect(loaded.state.sites).toEqual(original.sites);
    expect(loaded.state.groups).toEqual(original.groups);
  });

  it.each([
    { topbarStyle: "clear", topbarBlur: 19, topbarOpacity: 65, sidebarStyle: "clear", sidebarBlur: 21, sidebarTransparency: 35 },
    { topbarStyle: "glass", topbarBlurEnabled: false, topbarBlur: 19, topbarOpacity: 0, sidebarStyle: "glass", sidebarBlurEnabled: false, sidebarBlur: 21, sidebarTransparency: 100 },
  ])("converts retired material overrides once, then preserves slider edits: %j", legacy => {
    const state = createDefaultState();
    const { topbarStyle: _style, topbarTransparency: _alpha, ...wallpaper } = state.wallpaper;
    const loaded = parseStoredState(JSON.stringify({ ...state, version: 20,
      wallpaper: { ...wallpaper, ...legacy, topbarReadability: "clear" } }));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state.wallpaper).toEqual({ ...state.wallpaper, topbarStyle: "glass", topbarBlur: 0, topbarTransparency: 100,
      sidebarStyle: "glass", sidebarBlur: 0, sidebarTransparency: 100 });
    expect(loaded.state.sites).toEqual(state.sites);
    expect(loaded.state.groups).toEqual(state.groups);
    const edited = { ...loaded.state, wallpaper: { ...loaded.state.wallpaper, topbarBlur: 8, topbarTransparency: 57,
      sidebarBlur: 11, sidebarTransparency: 69 } };
    expect(parseStoredState(JSON.stringify(edited)).state).toEqual(edited);
  });

  it("preserves legacy enabled glass values", () => {
    const expected = { ...DEFAULT_WALLPAPER, topbarStyle: "glass" as const, topbarTransparency: 37, topbarBlur: 17,
      sidebarStyle: "glass" as const, sidebarTransparency: 88, sidebarBlur: 7 };
    const { topbarTransparency: _alpha, ...wallpaper } = expected;
    expect(normalizeWallpaper({ ...wallpaper, topbarOpacity: 63, topbarReadability: "page",
      topbarBlurEnabled: true, sidebarBlurEnabled: true })).toEqual(expected);
  });

  it.each([0, 27, 100])("migrates v23 topbar opacity %s and drops retired optics across save and backup", opacity => {
    const original = createDefaultState();
    const { topbarStyle: _style, topbarTransparency: _alpha, ...wallpaper } = original.wallpaper;
    const loaded = parseStoredState(JSON.stringify({ ...original, version: 23,
      wallpaper: { ...wallpaper, topbarOpacity: opacity, topbarBlur: 9, glassRefraction: true, glassRefractionStrength: 32 } }));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state).toEqual({ ...original, wallpaper: { ...original.wallpaper,
      topbarStyle: "glass", topbarTransparency: 100 - opacity, topbarBlur: 9 } });
    expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
    expect(parseImportFile(serializeExport(loaded.state))).toEqual({ ...loaded.state, githubMigration: undefined });
  });

  it("defaults new installations to shared panels and retains independent values in shared mode", () => {
    const state = createDefaultState();
    expect(state.wallpaper).toMatchObject({ topbarStyle: "shared", sidebarStyle: "shared" });
    state.wallpaper = { ...state.wallpaper, topbarTransparency: 37, topbarBlur: 17, sidebarTransparency: 88, sidebarBlur: 7 };
    expect(parseStoredState(JSON.stringify(state)).state).toEqual(state);
  });
});
