import type { Locator } from '@playwright/test';
export function readGlassMaterial(element: Element, pseudo?: boolean): {
  blur: number; saturation: number;
  sampling: 'backdrop' | 'none';
} | null;
export function describeGlassMaterial(locator: Locator, pseudo?: boolean): Promise<string>;
