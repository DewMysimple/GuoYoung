import { expect, type Locator } from "@playwright/test";
import { readGlassMaterial } from "../scripts/read-glass-material.mjs";

/** Inspect the executed paint, not its requested CSS custom property. */
export async function expectGlassMaterial(surface: Locator, expected: { blur?: number; saturation?: number }, pseudo = false) {
  await expect.poll(() => surface.evaluate(readGlassMaterial, pseudo)).toMatchObject(expected);
}
