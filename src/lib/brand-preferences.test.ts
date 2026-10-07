import { expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import { parseStoredState } from "./storage";
import { parseImportFile, serializeExport } from "./data-transfer";

it("upgrades brand preferences without replacing existing content and keeps new choices through backups", () => {
  const state = createDefaultState();
  const old = { ...state, version: 19, brand: { name: "旧名称", showName: false, showLogo: true, logoSource: "default" } };
  const loaded = parseStoredState(JSON.stringify(old));
  expect(loaded.recovered).toBe(false);
  expect(loaded.state.version).toBe(23);
  expect(loaded.state.brand).toMatchObject({ name: "旧名称", showName: false, tabTitle: "", logoShape: "original" });
  expect(loaded.state.sites).toEqual(old.sites);
  loaded.state.brand = { ...loaded.state.brand, tabTitle: "我的起点", logoShape: "rectangle" };
  loaded.state.wallpaper.topbarOpacity = 25;
  const restored = parseImportFile(serializeExport(loaded.state));
  expect(restored.brand).toEqual(loaded.state.brand);
  expect(restored.wallpaper.topbarOpacity).toBe(25);
  expect(parseStoredState(JSON.stringify(restored)).state.brand).toEqual(restored.brand);
});
