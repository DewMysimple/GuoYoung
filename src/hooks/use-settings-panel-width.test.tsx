import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH, useSettingsPanelWidth } from "./use-settings-panel-width";

const WIDTH_KEY = "site-hub:settings-panel-width";
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth")!;
const panelWidth = () => document.documentElement.style.getPropertyValue("--settings-panel-width");
function viewport(width: number) { Object.defineProperty(window, "innerWidth", { configurable: true, value: width }); }

beforeEach(() => {
  viewport(1600);
  window.localStorage.clear();
  document.documentElement.style.removeProperty("--settings-panel-width");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", originalInnerWidth);
  window.localStorage.clear();
  document.documentElement.style.removeProperty("--settings-panel-width");
});

it.each([1, 1.5])("exposes logical geometry and publishes physical width at scale %s", scale => {
  const { result } = renderHook(() => useSettingsPanelWidth(true, scale));
  expect(result.current.width).toBe(DEFAULT_PANEL_WIDTH);
  expect(result.current.physicalWidth).toBe(DEFAULT_PANEL_WIDTH * scale);
  expect(result.current.maxWidth).toBe(760);
  expect(panelWidth()).toBe(`${DEFAULT_PANEL_WIDTH * scale}px`);
  act(() => result.current.changeWidth(520));
  expect(result.current.width).toBe(520);
  expect(result.current.physicalWidth).toBe(520 * scale);
  expect(panelWidth()).toBe(`${520 * scale}px`);
  expect(window.localStorage.getItem(WIDTH_KEY)).toBeNull();
});

it.each([{ scale: 1, max: 760 }, { scale: 1.5, max: 586 }])("clamps logical values against viewport space at scale $scale", ({ scale, max }) => {
  viewport(1200);
  const { result } = renderHook(() => useSettingsPanelWidth(true, scale));
  expect(result.current.maxWidth).toBe(max);
  act(() => result.current.changeWidth(900));
  expect(result.current.width).toBe(max);
  expect(result.current.physicalWidth).toBe(max * scale);
  expect(panelWidth()).toBe(`${max * scale}px`);
  act(() => result.current.changeWidth(100));
  expect(result.current.width).toBe(MIN_PANEL_WIDTH);
  expect(result.current.physicalWidth).toBe(MIN_PANEL_WIDTH * scale);
  expect(panelWidth()).toBe(`${MIN_PANEL_WIDTH * scale}px`);
});

it.each([{ scale: 1, max: 680 }, { scale: 1.5, max: 453 }])("updates the resize limit and physical CSS token at scale $scale", ({ scale, max }) => {
  const { result } = renderHook(() => useSettingsPanelWidth(true, scale));
  act(() => result.current.changeWidth(720));
  viewport(1000);
  act(() => window.dispatchEvent(new Event("resize")));
  expect(result.current.maxWidth).toBe(max);
  expect(result.current.width).toBe(max);
  expect(result.current.physicalWidth).toBe(max * scale);
  expect(panelWidth()).toBe(`${max * scale}px`);
  viewport(1600);
  act(() => window.dispatchEvent(new Event("resize")));
  expect(result.current.maxWidth).toBe(760);
  expect(result.current.width).toBe(max);
  expect(panelWidth()).toBe(`${max * scale}px`);
});

it.each([1, 1.5])("saves logical width and restores the same geometry on reopen at scale %s", scale => {
  const view = renderHook(({ open }) => useSettingsPanelWidth(open, scale), { initialProps: { open: true } });
  act(() => view.result.current.rememberWidth(520));
  expect(window.localStorage.getItem(WIDTH_KEY)).toBe("520");
  view.rerender({ open: false });
  act(() => view.result.current.changeWidth(600));
  view.rerender({ open: true });
  expect(view.result.current.width).toBe(520);
  expect(view.result.current.physicalWidth).toBe(520 * scale);
  expect(panelWidth()).toBe(`${520 * scale}px`);
  view.unmount();
  const reopened = renderHook(() => useSettingsPanelWidth(true, scale));
  expect(reopened.result.current.width).toBe(520);
  expect(reopened.result.current.physicalWidth).toBe(520 * scale);
  expect(panelWidth()).toBe(`${520 * scale}px`);
});

it("keeps the saved logical width when interface scale changes from 100% to 150%", () => {
  window.localStorage.setItem(WIDTH_KEY, "520");
  const view = renderHook(({ scale }) => useSettingsPanelWidth(true, scale), { initialProps: { scale: 1 } });
  expect(view.result.current.width).toBe(520);
  expect(panelWidth()).toBe("520px");
  view.rerender({ scale: 1.5 });
  expect(view.result.current.width).toBe(520);
  expect(view.result.current.physicalWidth).toBe(780);
  expect(panelWidth()).toBe("780px");
  expect(window.localStorage.getItem(WIDTH_KEY)).toBe("520");
});

it("rechecks a saved logical width against the scaled viewport without overwriting the preference", () => {
  window.localStorage.setItem(WIDTH_KEY, "700");
  viewport(1200);
  const view = renderHook(({ scale }) => useSettingsPanelWidth(true, scale), { initialProps: { scale: 1 } });
  expect(view.result.current.width).toBe(700);
  view.rerender({ scale: 1.5 });
  expect(view.result.current.maxWidth).toBe(586);
  expect(view.result.current.width).toBe(586);
  expect(view.result.current.physicalWidth).toBe(879);
  expect(panelWidth()).toBe("879px");
  expect(window.localStorage.getItem(WIDTH_KEY)).toBe("700");
});

it("retains the logical minimum in a narrow scaled viewport", () => {
  viewport(800);
  const { result } = renderHook(() => useSettingsPanelWidth(true, 1.5));
  expect(result.current.maxWidth).toBe(MIN_PANEL_WIDTH);
  expect(result.current.width).toBe(MIN_PANEL_WIDTH);
  expect(result.current.physicalWidth).toBe(540);
  expect(panelWidth()).toBe("540px");
});

it("keeps geometry usable when local storage reads and writes fail", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("unavailable"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
  const { result } = renderHook(() => useSettingsPanelWidth(true, 1.5));
  expect(result.current.width).toBe(DEFAULT_PANEL_WIDTH);
  act(() => result.current.rememberWidth(520));
  expect(result.current.width).toBe(520);
  expect(result.current.physicalWidth).toBe(780);
  expect(panelWidth()).toBe("780px");
});
