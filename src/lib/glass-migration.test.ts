import { describe, expect, it } from "vitest";
import { createDefaultState, DEFAULT_WALLPAPER } from "../data/defaults";
import { normalizeWallpaper, parseStoredState } from "./storage";

describe("wallpaper glass migration", () => {
  it("adds v17 material defaults without replacing wallpaper composition or collections", () => {
    const state = createDefaultState();
    const wallpaper = { source: "local", localAssetId: "personal-image", fit: "contain", positionX: 23,
      positionY: 71, zoom: 140, blur: 4, overlay: 18, topbarOpacity: 35, topbarBlur: 7, topbarBlurEnabled: false };
    const loaded = parseStoredState(JSON.stringify({ ...state, version: 16, wallpaper }));
    expect(loaded.recovered).toBe(false);
    expect(loaded.state.version).toBe(23);
    const { topbarBlurEnabled: _enabled, ...effective } = wallpaper;
    expect(loaded.state.wallpaper).toEqual({ ...DEFAULT_WALLPAPER, ...effective, topbarBlur: 0 });
    expect(loaded.state.sites).toEqual(state.sites);
    expect(loaded.state.groups).toEqual(state.groups);
    expect(loaded.state.appearance).toEqual(state.appearance);
  });

  it.each([16, 17, 18])("preserves explicit glass settings in version %s and on repeat reads", (version) => {
    const state = createDefaultState();
    state.wallpaper = { ...state.wallpaper, glassTransparency: 92, glassBlur: 0, glassSaturation: 180,
      glassHighlight: 0, glassRefraction: true, glassRefractionStrength: 32,
      glassControlTransparency: 90, glassPanelTransparency: 70, glassPopoverTransparency: 40, glassShadow: 0 };
    const loaded = parseStoredState(JSON.stringify({ ...state, version }));
    expect(loaded.state.wallpaper).toEqual(state.wallpaper);
    expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
  });

  it("bounds untrusted settings and rejects invalid types", () => {
    expect(normalizeWallpaper({ glassTransparency: 250, glassBlur: -10, glassSaturation: "200",
      glassHighlight: null, glassRefraction: "false", glassRefractionStrength: Infinity, topbarStyle: "invalid" }))
      .toMatchObject({ glassTransparency: 100, glassBlur: 0, glassSaturation: 130,
        glassHighlight: 45, glassRefraction: false, glassRefractionStrength: 24, topbarOpacity: 0 });
  });

  it("migrates v17 by adding only missing layer controls", () => {
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
});


it("adds independent sidebar controls to v22 without changing existing materials", () => {
  const original = createDefaultState();
  const { sidebarStyle: _style, sidebarTransparency: _alpha, sidebarBlur: _blur, ...wallpaper } = original.wallpaper;
  const legacy = { ...original, version: 22, wallpaper: { ...wallpaper, glassPanelTransparency: 83, topbarOpacity: 27 } };
  const loaded = parseStoredState(JSON.stringify(legacy));
  expect(loaded.recovered).toBe(false);
  expect(loaded.state.wallpaper).toEqual({ ...legacy.wallpaper, sidebarStyle: "shared", sidebarTransparency: 60, sidebarBlur: 12 });
  expect(loaded.state.sites).toEqual(original.sites);
  expect(loaded.state.groups).toEqual(original.groups);
  const custom = { ...loaded.state, wallpaper: { ...loaded.state.wallpaper, sidebarStyle: "glass", sidebarTransparency: 88, sidebarBlur: 7 } };
  expect(parseStoredState(JSON.stringify(custom)).state).toEqual(custom);
  expect(normalizeWallpaper({ sidebarStyle: "invalid", sidebarTransparency: 999, sidebarBlur: -1, sidebarBlurEnabled: "true" })).toMatchObject({ sidebarStyle: "shared", sidebarTransparency: 100, sidebarBlur: 0 });
});

it.each([
  { topbarStyle: "clear", topbarBlur: 19, topbarOpacity: 65, sidebarStyle: "clear", sidebarBlur: 21, sidebarTransparency: 35 },
  { topbarStyle: "glass", topbarBlurEnabled: false, topbarBlur: 19, topbarOpacity: 0, sidebarStyle: "glass", sidebarBlurEnabled: false, sidebarBlur: 21, sidebarTransparency: 100 },
])("converts retired material overrides once, then preserves direct slider edits: %j", legacy => {
  const state = createDefaultState();
  const loaded = parseStoredState(JSON.stringify({ ...state, wallpaper: { ...state.wallpaper, ...legacy, topbarReadability: "clear" } }));
  expect(loaded.recovered).toBe(false);
  expect(loaded.state.wallpaper).toEqual({ ...state.wallpaper, topbarBlur: 0, topbarOpacity: 0,
    sidebarStyle: "glass", sidebarBlur: 0, sidebarTransparency: 100 });
  expect(loaded.state.sites).toEqual(state.sites);
  expect(loaded.state.groups).toEqual(state.groups);
  const edited = { ...loaded.state, wallpaper: { ...loaded.state.wallpaper, topbarBlur: 8, topbarOpacity: 43,
    sidebarBlur: 9, sidebarTransparency: 72 } };
  expect(parseStoredState(JSON.stringify(edited)).state).toEqual(edited);
});

it("preserves enabled legacy glass values while dropping retired fields", () => {
  const wallpaper = { ...DEFAULT_WALLPAPER, topbarOpacity: 63, topbarBlur: 17,
    sidebarStyle: "glass" as const, sidebarTransparency: 88, sidebarBlur: 7 };
  expect(normalizeWallpaper({ ...wallpaper, topbarStyle: "glass", topbarReadability: "page",
    topbarBlurEnabled: true, sidebarBlurEnabled: true })).toEqual(wallpaper);
});
