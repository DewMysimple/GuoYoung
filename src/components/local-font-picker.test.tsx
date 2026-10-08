import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalFontPicker } from "./local-font-picker";

const prepare = vi.hoisted(() => vi.fn());
vi.mock("../lib/local-fonts", () => ({ prepareLocalFont: prepare, LOCAL_FONT_ACCEPT: ".ttf,.otf,.ttc,.woff,.woff2" }));
beforeEach(() => prepare.mockReset());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function selectFile(file = new File(["font"], "Chosen.ttf")) {
  fireEvent.change(screen.getByLabelText("字体文件"), { target: { files: [file] } });
  return file;
}

it("opens the system file input from a button without a font-name textbox", () => {
  render(<LocalFontPicker name="Saved" onChoose={vi.fn()} />);
  const input = screen.getByLabelText("字体文件") as HTMLInputElement;
  const open = vi.spyOn(input, "click");
  fireEvent.click(screen.getByRole("button", { name: "选择已安装字体" }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(input).toHaveAttribute("type", "file");
  expect(input).toHaveAttribute("accept", ".ttf,.otf,.ttc,.woff,.woff2");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(prepare).not.toHaveBeenCalled();
});

it("keeps the existing selection and error when the native chooser is cancelled", () => {
  const choose = vi.fn();
  render(<LocalFontPicker name="Saved" error="旧字体暂不可用" onChoose={choose} />);
  fireEvent(screen.getByLabelText("字体文件"), new Event("cancel", { bubbles: true }));
  fireEvent.change(screen.getByLabelText("字体文件"), { target: { files: [] } });
  expect(screen.getByText("当前字体：Saved")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("旧字体暂不可用");
  expect(prepare).not.toHaveBeenCalled();
  expect(choose).not.toHaveBeenCalled();
});

it("publishes a prepared file only after validation and persistence resolve", async () => {
  let finish!: (value: { assetId: string; name: string }) => void;
  prepare.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const choose = vi.fn();
  render(<LocalFontPicker name="Saved" onChoose={choose} />);
  const file = selectFile();
  expect(prepare).toHaveBeenCalledExactlyOnceWith(file);
  expect(choose).not.toHaveBeenCalled();
  expect(screen.getByText("当前字体：Saved")).toBeVisible();
  expect(screen.getByRole("button", { name: "正在读取字体…" })).toBeDisabled();
  await act(async () => finish({ assetId: "font-ready", name: "Chosen" }));
  expect(choose).toHaveBeenCalledExactlyOnceWith({ assetId: "font-ready", name: "Chosen" });
  expect(screen.getByRole("button", { name: "选择已安装字体" })).toBeEnabled();
  expect(screen.getByLabelText("字体文件")).toHaveValue("");
});

it("shows a validation error while retaining the existing font", async () => {
  prepare.mockRejectedValue(new Error("无法加载这个字体文件"));
  const choose = vi.fn();
  render(<LocalFontPicker name="Saved" onChoose={choose} />);
  selectFile();
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("无法加载这个字体文件"));
  expect(screen.getByText("当前字体：Saved")).toBeVisible();
  expect(screen.getByRole("button", { name: "选择已安装字体" })).toBeEnabled();
  expect(choose).not.toHaveBeenCalled();
});

it.each(["unmount", "font-switch", "cancel-settings"])("cannot publish an asynchronous selection after %s", async reason => {
  let finish!: (value: { assetId: string; name: string }) => void;
  prepare.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const choose = vi.fn();
  const view = render(<LocalFontPicker name="Saved" onChoose={choose} />);
  selectFile();
  if (reason === "unmount") view.unmount();
  else view.rerender(<span>{reason === "font-switch" ? "系统字体" : "设置已关闭"}</span>);
  await act(async () => finish({ assetId: "font-late", name: "Late" }));
  expect(choose).not.toHaveBeenCalled();
});

it("reads the latest callback when a valid pending file finishes", async () => {
  let finish!: (value: { assetId: string; name: string }) => void;
  prepare.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const oldChoose = vi.fn(), latestChoose = vi.fn();
  const view = render(<LocalFontPicker name="Saved" onChoose={oldChoose} />);
  selectFile();
  view.rerender(<LocalFontPicker name="Saved" onChoose={latestChoose} />);
  await act(async () => finish({ assetId: "font-ready", name: "Chosen" }));
  expect(oldChoose).not.toHaveBeenCalled();
  expect(latestChoose).toHaveBeenCalledExactlyOnceWith({ assetId: "font-ready", name: "Chosen" });
});
