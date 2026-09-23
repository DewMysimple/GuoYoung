import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ThemePreference } from "../types";
import { useTheme } from "./use-theme";

afterEach(() => vi.restoreAllMocks());

it("follows live system changes only in system mode and releases the listener", () => {
  const listeners = new Set<() => void>();
  const media = {
    matches: true,
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
  };
  vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
  const { rerender, unmount } = renderHook(({ preference }: { preference: ThemePreference }) =>
    useTheme(preference, "#6750a4"), { initialProps: { preference: "system" as ThemePreference } });
  const root = document.documentElement;
  expect(root.dataset.theme).toBe("dark");
  expect(root.style.colorScheme).toBe("dark");
  expect(root.style.getPropertyValue("--accent-base")).toBe("#6750a4");
  act(() => { media.matches = false; listeners.forEach((listener) => listener()); });
  expect(root.dataset.theme).toBe("light");
  rerender({ preference: "dark" });
  expect(root.dataset.theme).toBe("dark");
  expect(listeners.size).toBe(0);
  rerender({ preference: "system" });
  expect(root.dataset.theme).toBe("light");
  expect(listeners.size).toBe(1);
  unmount();
  expect(listeners.size).toBe(0);
});
