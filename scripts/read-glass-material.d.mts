import type { Locator, Page } from '@playwright/test';
export function readGlassMaterial(element: Element, pseudo?: boolean): {
  blur: number; effectiveBlur: number; sourceBlur: number; saturation: number; refraction: boolean; strength: number;
  sampling: 'wallpaper' | 'backdrop' | 'none';
} | null;
export function describeGlassMaterial(locator: Locator, pseudo?: boolean): Promise<string>;
export function withoutGlassRefraction<T>(page: Page, capture: () => Promise<T>): Promise<T>;
