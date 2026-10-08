import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as Dialog from "@radix-ui/react-dialog";
import { useState, type ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { RangeControl } from "./range-control";

afterEach(cleanup);

function mount(overrides: Partial<ComponentProps<typeof RangeControl>> = {}) {
  const changed = vi.fn();
  const props = { label: "尺寸", min: 0, max: 100, value: 20, ...overrides };
  function Controlled() {
    const [value, setValue] = useState(props.value);
    return <RangeControl {...props} value={value} onChange={next => { changed(next); setValue(next); }} />;
  }
  const view = render(<Controlled />);
  return { ...view, changed, number: screen.getByRole("spinbutton", { name: "尺寸数值" }), slider: screen.getByRole("slider", { name: "尺寸" }) };
}

it("exposes a separate editable number and fixed unit without duplicating the slider label", () => {
  const { number, slider } = mount();
  expect(number).toHaveAttribute("type", "text");
  expect(number).toHaveAttribute("inputmode", "decimal");
  expect(number).toHaveAttribute("aria-valuemin", "0");
  expect(number).toHaveAttribute("aria-valuemax", "100");
  expect(number).toHaveAttribute("aria-valuenow", "20");
  expect(number).toHaveAccessibleDescription("输入后按 Enter 或离开输入框应用，Esc 取消。");
  expect(number.closest(".input-shell")).toHaveTextContent("px");
  expect(screen.getByLabelText("尺寸", { exact: true })).toBe(slider);
  expect(slider.closest("label")).toBeNull();
});

it("keeps incomplete typing local and applies once on Enter, without a second blur commit", () => {
  const { number, slider, changed } = mount();
  fireEvent.change(number, { target: { value: "" } });
  fireEvent.change(number, { target: { value: "7" } });
  fireEvent.change(number, { target: { value: "75" } });
  expect(changed).not.toHaveBeenCalled();
  expect(slider).toHaveValue("20");
  fireEvent.keyDown(number, { key: "Enter" });
  expect(changed).toHaveBeenCalledExactlyOnceWith(75);
  expect(number).toHaveValue("75");
  expect(slider).toHaveValue("75");
  fireEvent.blur(number);
  fireEvent.keyDown(number, { key: "Enter" });
  expect(changed).toHaveBeenCalledTimes(1);
});

it("applies on blur, clamps both limits and avoids publishing an unchanged number", () => {
  const { number, slider, changed } = mount();
  fireEvent.change(number, { target: { value: "200" } });
  expect(number).toHaveValue("200");
  expect(number).toHaveAttribute("aria-invalid", "true");
  expect(changed).not.toHaveBeenCalled();
  fireEvent.blur(number);
  expect(changed).toHaveBeenLastCalledWith(100);
  expect(number).toHaveValue("100");
  expect(slider).toHaveValue("100");
  fireEvent.change(number, { target: { value: "-50" } });
  fireEvent.blur(number);
  expect(changed).toHaveBeenLastCalledWith(0);
  expect(number).toHaveValue("0");
  fireEvent.change(number, { target: { value: "0.0" } });
  fireEvent.blur(number);
  expect(changed).toHaveBeenCalledTimes(2);
  expect(number).toHaveValue("0");
});

it.each(["", " ", "-", "+", ".", "-.", "1e", "20px", "hello", "9".repeat(400)])("restores invalid or incomplete draft %s without applying zero or NaN", text => {
  const { number, slider, changed } = mount();
  fireEvent.change(number, { target: { value: text } });
  fireEvent.keyDown(number, { key: "Enter" });
  expect(changed).not.toHaveBeenCalled();
  expect(number).toHaveValue("20");
  expect(slider).toHaveValue("20");
});

it("shares min-based decimal steps with the native range, including a nonaligned upper bound", () => {
  const { number, slider, changed } = mount({ min: .15, max: .42, step: .1, value: .25, unit: "%" });
  fireEvent.change(number, { target: { value: ".31" } });
  fireEvent.blur(number);
  expect(changed).toHaveBeenLastCalledWith(.35);
  expect(number).toHaveValue("0.35");
  expect(slider).toHaveValue("0.35");
  fireEvent.change(number, { target: { value: "1" } });
  fireEvent.keyDown(number, { key: "Enter" });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(number).toHaveValue("0.35");
  fireEvent.change(number, { target: { value: "-1" } });
  fireEvent.keyDown(number, { key: "Enter" });
  expect(changed).toHaveBeenLastCalledWith(.15);
  expect(number).toHaveAttribute("aria-valuetext", "0.15%");
});

it("steps with arrow keys without float accumulation or repeated changes at a limit", () => {
  const { number, slider, changed } = mount({ min: -.2, max: .4, step: .1, value: .2 });
  fireEvent.keyDown(number, { key: "ArrowUp" });
  expect(number).toHaveValue("0.3");
  fireEvent.keyDown(number, { key: "ArrowUp" });
  fireEvent.keyDown(number, { key: "ArrowUp" });
  expect(changed.mock.calls.map(([value]) => value)).toEqual([.3, .4]);
  fireEvent.keyDown(number, { key: "ArrowDown" });
  expect(slider).toHaveValue("0.3");
  fireEvent.change(number, { target: { value: ".14" } });
  fireEvent.keyDown(number, { key: "ArrowUp" });
  expect(number).toHaveValue("0.2");
  fireEvent.change(number, { target: { value: ".14" } });
  fireEvent.keyDown(number, { key: "ArrowDown" });
  expect(number).toHaveValue("0.1");
});

it("keeps native slider changes immediate and discards a superseded numeric draft", () => {
  const { number, slider, changed } = mount();
  fireEvent.change(number, { target: { value: "70" } });
  fireEvent.change(slider, { target: { value: "45" } });
  expect(changed).toHaveBeenCalledExactlyOnceWith(45);
  expect(number).toHaveValue("45");
  fireEvent.blur(number);
  expect(changed).toHaveBeenCalledTimes(1);
});

it("refreshes external values and limits without applying stale edits", () => {
  const changed = vi.fn();
  const props = { label: "尺寸", value: 20, min: 0, max: 100, onChange: changed };
  const view = render(<RangeControl {...props} />);
  const number = screen.getByRole("spinbutton");
  fireEvent.change(number, { target: { value: "75" } });
  view.rerender(<RangeControl {...props} value={40} />);
  expect(number).toHaveValue("40");
  fireEvent.keyDown(number, { key: "Enter" });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(number, { target: { value: "90" } });
  view.rerender(<RangeControl {...props} value={40} max={80} step={.5} />);
  expect(number).toHaveValue("40");
  expect(screen.getByRole("slider")).toHaveAttribute("max", "80");
  expect(screen.getByRole("slider")).toHaveAttribute("step", "0.5");
  fireEvent.blur(number);
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(number, { target: { value: "70" } });
  view.rerender(<RangeControl {...props} value={40} disabled />);
  expect(number).toHaveValue("40");
  expect(number).toBeDisabled();
  expect(screen.getByRole("slider")).toBeDisabled();
  fireEvent.keyDown(number, { key: "Enter" });
  expect(changed).not.toHaveBeenCalled();
});

it("formats existing floating results and small decimal steps as editable plain numbers", () => {
  const { number } = mount({ value: 1.1 * 100, max: 400 });
  expect(number).toHaveValue("110");
  cleanup();
  const small = mount({ min: 0, max: .000001, step: .0000001, value: .0000005 });
  expect(small.number).toHaveValue("0.0000005");
  fireEvent.keyDown(small.number, { key: "ArrowUp" });
  expect(small.changed).toHaveBeenCalledExactlyOnceWith(.0000006);
  expect(small.number).toHaveValue("0.0000006");
});

it("lets Escape cancel a draft before the enclosing Radix dialog dismisses", async () => {
  const user = userEvent.setup();
  const closed = vi.fn(), changed = vi.fn();
  render(<Dialog.Root open onOpenChange={closed}><Dialog.Portal><Dialog.Content>
    <Dialog.Title>设置</Dialog.Title><Dialog.Description>调整数值</Dialog.Description>
    <RangeControl label="尺寸" value={20} min={0} max={100} onChange={changed} />
  </Dialog.Content></Dialog.Portal></Dialog.Root>);
  const number = screen.getByRole("spinbutton");
  await user.click(number);
  await user.clear(number);
  await user.type(number, "75");
  await user.keyboard("{Escape}");
  expect(number).toHaveValue("20");
  expect(changed).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(closed).toHaveBeenCalledExactlyOnceWith(false);
});

it("uses Enter to apply a number without submitting its surrounding form", async () => {
  const user = userEvent.setup();
  const submit = vi.fn(event => event.preventDefault()), changed = vi.fn();
  render(<form onSubmit={submit}><RangeControl label="尺寸" value={20} min={0} max={100} onChange={changed} /></form>);
  const number = screen.getByRole("spinbutton");
  await user.click(number);
  await user.clear(number);
  await user.type(number, "50");
  await user.keyboard("{Enter}");
  expect(changed).toHaveBeenCalledExactlyOnceWith(50);
  expect(submit).not.toHaveBeenCalled();
});
