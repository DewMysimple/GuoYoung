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
    expect(loaded.state.version).toBe(18);
    expect(loaded.state.wallpaper).toEqual({ ...DEFAULT_WALLPAPER, ...wallpaper });
    expect(loaded.state.sites).toEqual(state.sites);
    expect(loaded.state.groups).toEqual(state.groups);
    expect(loaded.state.appearance).toEqual(state.appearance);
  });

  it.each([16, 17, 18])("preserves explicit glass settings in version %s and on repeat reads", (version) => {
    const state = createDefaultState();
    state.wallpaper = { ...state.wallpaper, glassTransparency: 92, glassBlur: 0, glassSaturation: 180,
      glassHighlight: 0, glassRefraction: true, glassRefractionStrength: 32, topbarStyle: "glass",
      glassControlTransparency: 90, glassPanelTransparency: 70, glassPopoverTransparency: 40, glassShadow: 0 };
    const loaded = parseStoredState(JSON.stringify({ ...state, version }));
    expect(loaded.state.wallpaper).toEqual(state.wallpaper);
    expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
  });

  it("bounds untrusted settings and rejects invalid types", () => {
    expect(normalizeWallpaper({ glassTransparency: 250, glassBlur: -10, glassSaturation: "200",
      glassHighlight: null, glassRefraction: "false", glassRefractionStrength: Infinity, topbarStyle: "invalid" }))
      .toMatchObject({ glassTransparency: 100, glassBlur: 0, glassSaturation: 130,
        glassHighlight: 45, glassRefraction: false, glassRefractionStrength: 24, topbarStyle: "clear" });
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
