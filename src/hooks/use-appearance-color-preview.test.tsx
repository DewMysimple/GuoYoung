import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useInsertionEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { CustomColorPicker } from "../components/custom-color-picker";
import { typographyVariables } from "../lib/typography";
import { useAppearanceColorPreview } from "./use-appearance-color-preview";

let previousStyle: string | null;
beforeEach(() => { previousStyle = document.documentElement.getAttribute("style"); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (previousStyle === null) document.documentElement.removeAttribute("style");
  else document.documentElement.setAttribute("style", previousStyle);
});

it("keeps the saved owner tokens when closing settings during an active color gesture", () => {
  const saved = { ...DEFAULT_APPEARANCE };
  const draft = { ...saved, textColorMode: "custom" as const, textColor: "#123456" };
  function Settings({ open }: { open: boolean }) {
    const colors = useAppearanceColorPreview(draft, open);
    return open ? <CustomColorPicker value={draft.textColor} onChange={vi.fn()}
      onPreview={textColor => colors.preview(textColor === null ? null : { textColor })} /> : null;
  }
  function Owner({ open }: { open: boolean }) {
    useInsertionEffect(() => {
      for (const [key, value] of Object.entries(typographyVariables(open ? draft : saved))) {
        document.documentElement.style.setProperty(key, value);
      }
    }, [open]);
    return <Settings open={open} />;
  }
  const view = render(<Owner open />);
  fireEvent.click(screen.getByRole("button", { name: "自定义强调色" }));
  const area = screen.getByRole("slider", { name: "颜色饱和度和亮度" });
  vi.spyOn(area, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
  vi.spyOn(area, "setPointerCapture").mockImplementation(() => {});
  vi.spyOn(area, "hasPointerCapture").mockReturnValue(false);
  const event = new MouseEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, clientX: 50, clientY: 50 });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  fireEvent(area, event);
  view.rerender(<Owner open={false} />);
  expect(document.documentElement.style.getPropertyValue("--reading-text")).toBe("var(--theme-text)");
  expect(document.documentElement.style.getPropertyValue("--color-preview-duration")).toBe("");
});

it("previews public CSS tokens without rerendering its owner or changing the draft", () => {
  const value = { ...DEFAULT_APPEARANCE };
  const original = JSON.stringify(value);
  let renders = 0;
  const view = renderHook(() => { renders++; return useAppearanceColorPreview(value); });
  document.documentElement.style.setProperty("--reading-font", "KeepCurrentFont");
  act(() => {
    for (let i = 0; i < 20; i++) view.result.current.preview({ textColorMode: "custom", textColor: "#123456", accentColor: "#654321" });
  });
  const style = document.documentElement.style;
  expect(style.getPropertyValue("--reading-text")).toBe("#123456");
  expect(style.getPropertyValue("--reading-text-secondary")).toBe("#123456");
  expect(style.getPropertyValue("--accent-base")).toBe("#654321");
  expect(style.getPropertyValue("--reading-font")).toBe("KeepCurrentFont");
  expect(JSON.stringify(value)).toBe(original);
  expect(renders).toBe(1);
  view.unmount();
});

it("retains the completed gesture when commit and preview clear run before React rerenders", () => {
  const saved = { ...DEFAULT_APPEARANCE };
  const view = renderHook(() => useAppearanceColorPreview(saved));
  const next = { ...saved, textColorMode: "custom" as const, textColor: "#123456", iconColorMode: "custom" as const, iconColor: "#abcdef" };
  act(() => {
    view.result.current.preview({ textColorMode: "custom", textColor: "#654321" });
    view.result.current.commit(next);
    view.result.current.preview(null);
  });
  expect(document.documentElement.style.getPropertyValue("--reading-text")).toBe("#123456");
  expect(document.documentElement.style.getPropertyValue("--reading-icon")).toBe("#abcdef");
  expect(saved.textColorMode).toBe("theme");
  view.unmount();
});

it("restores the current base after cancellation and follows a restored saved draft", () => {
  const saved = { ...DEFAULT_APPEARANCE };
  const view = renderHook(({ value }) => useAppearanceColorPreview(value), { initialProps: { value: saved } });
  act(() => view.result.current.preview({ textColorMode: "custom", textColor: "#123456", iconColorMode: "custom", iconColor: "#abcdef" }));
  act(() => view.result.current.preview(null));
  expect(document.documentElement.style.getPropertyValue("--reading-text")).toBe("var(--theme-text)");
  expect(document.documentElement.style.getPropertyValue("--reading-icon")).toBe("inherit");
  const draft = { ...saved, textColorMode: "custom" as const, textColor: "#654321" };
  view.rerender({ value: draft });
  act(() => view.result.current.preview({ textColor: "#123456" }));
  view.rerender({ value: saved });
  act(() => view.result.current.preview(null));
  expect(document.documentElement.style.getPropertyValue("--reading-text")).toBe("var(--theme-text)");
  expect(document.documentElement.style.getPropertyValue("--accent-base")).toBe(saved.accentColor);
  view.unmount();
});
