import { expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import { parseImportFile, serializeExport } from "./data-transfer";
import { parseStoredState } from "./storage";

it("adds light to v15 without replacing collections or customized appearance", () => {
  const state = createDefaultState();
  const { theme: _theme, ...appearance } = state.appearance;
  const legacy = { ...state, version: 15, appearance: { ...appearance, cardWidth: 217, accentColor: "#6750a4" } };
  const raw = JSON.stringify(legacy);
  const loaded = parseStoredState(raw);
  expect(loaded.recovered).toBe(false);
  expect(loaded.state.version).toBe(18);
  expect(loaded.state.appearance).toEqual({ ...legacy.appearance, theme: "light" });
  expect(loaded.state.sites).toEqual(state.sites);
  expect(loaded.state.groups).toEqual(state.groups);
  expect(JSON.stringify(legacy)).toBe(raw);
  expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
});

it.each(["system", "light", "dark"] as const)("preserves %s through reload and portable backup", (theme) => {
  const state = createDefaultState();
  state.appearance.theme = theme;
  expect(parseStoredState(JSON.stringify(state)).state).toEqual(state);
  expect(parseImportFile(serializeExport(state)).appearance.theme).toBe(theme);
  expect(parseStoredState(JSON.stringify({ ...state, version: 15 })).state.appearance.theme).toBe(theme);
});

it.each([undefined, null, "invalid", 1])("repairs invalid current theme %s without losing collections", (theme) => {
  const state = createDefaultState();
  const loaded = parseStoredState(JSON.stringify({ ...state, appearance: { ...state.appearance, theme } }));
  expect(loaded.recovered).toBe(false);
  expect(loaded.state.appearance.theme).toBe("system");
  expect(loaded.state.sites).toEqual(state.sites);
  expect(parseStoredState(JSON.stringify(loaded.state)).state).toEqual(loaded.state);
});
