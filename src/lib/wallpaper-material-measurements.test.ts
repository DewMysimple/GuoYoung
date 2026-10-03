import { afterEach, expect, it, vi } from "vitest";
import { discoverMaterialCandidates, readMaterialMeasurements, type MaterialBindings, type WallpaperFrame } from "./wallpaper-material-measurements";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it("leaves an undeclared native backdrop alone and removes a revoked managed binding", () => {
  const root = document.createElement("div"), native = document.createElement("button"), explicit = document.createElement("button");
  root.append(native, explicit); document.body.append(root);
  const style = (input: string, pseudo: boolean) => {
    const result = document.createElement("div").style;
    result.setProperty("--wallpaper-material-input", input);
    result.setProperty("backdrop-filter", "blur(18px)");
    result.transform = "none"; result.willChange = "auto";
    result.content = pseudo ? "none" : "normal";
    return result;
  };
  let declared = true, bound = false;
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
    style(element === explicit && !pseudo && declared ? "blur(12px)" : "none", !!pseudo));
  for (const element of [native, explicit]) vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    { x: 10, y: 20, width: 100, height: 40, top: 20, bottom: 60, left: 10, right: 110, toJSON() {} });
  const bindings: MaterialBindings = {
    has: (element, pseudo) => element === explicit && bound && pseudo !== true,
    targets: () => bound ? [{ element: explicit, pseudo: false }] : [],
  };
  const frame: WallpaperFrame = { key: "source", left: 0, top: 0, width: 1920, height: 1080,
    viewportWidth: 1920, viewportHeight: 1080, blur: 0, overlay: "transparent" };

  expect(discoverMaterialCandidates(root, bindings)).toEqual([explicit]);
  const initial = readMaterialMeasurements(frame, [native, explicit], bindings);
  expect(initial.surfaces).toHaveLength(1);
  expect(initial.surfaces[0]).toMatchObject({ element: explicit, blur: 12 });
  expect(initial.removals).toEqual([]);

  // React/CSS can revoke eligibility while the registry still owns the old
  // binding. It remains discoverable only long enough to remove that binding.
  bound = true; declared = false;
  expect(discoverMaterialCandidates(root, bindings)).toEqual([explicit]);
  expect(readMaterialMeasurements(frame, [native, explicit], bindings)).toEqual({
    surfaces: [], removals: [{ element: explicit, pseudo: false }],
  });
});
