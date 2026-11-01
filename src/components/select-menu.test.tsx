import * as Dialog from "@radix-ui/react-dialog";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SelectMenu, type SelectMenuProps } from "./select-menu";
import { SettingsSelect } from "./settings-options";

afterEach(cleanup);

const options = [
  { value: "manual", label: "手动排列" },
  { value: "heat", label: "热量排列" },
  { value: "recent", label: "最近添加" },
];

function mount(overrides: Partial<SelectMenuProps<string>> = {}, settings = false) {
  const changed = vi.fn();
  function Controlled() {
    const [value, setValue] = useState(overrides.value ?? "heat");
    const props = { ariaLabel: "排列方式", options, ...overrides, value,
      onChange: (next: string) => { changed(next); setValue(next); } };
    return <><button>前一控件</button>
      {settings ? <SettingsSelect {...props} /> : <SelectMenu {...props} />}
      <button>后一控件</button></>;
  }
  render(<Controlled />);
  return { changed, trigger: screen.getByRole("button", { name: overrides.ariaLabel ?? "排列方式" }) };
}

it.each([
  { name: "排列方式", triggerClassName: "view-control-button sort-control active", role: "menu" as const, optionRole: "menuitemradio" as const },
  { name: "显示方式", triggerClassName: "view-control-button display-control", role: "menu" as const, optionRole: "menuitemradio" as const },
  { name: "弹出页分组", triggerClassName: "popup-select", role: "listbox" as const, optionRole: "option" as const },
])("preserves caller classes and the accessible selected value for $name", async ({ name, triggerClassName, role, optionRole }) => {
  const user = userEvent.setup();
  const { trigger, changed } = mount({ ariaLabel: name, triggerClassName, popoverRole: role, optionRole });
  expect(trigger).toHaveClass("select-menu-trigger", ...triggerClassName.split(" "));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).toHaveAttribute("aria-haspopup", role);
  await user.click(trigger);
  expect(trigger).toHaveClass("is-open");
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = screen.getByRole(role, { name });
  expect(trigger).toHaveAttribute("aria-controls", menu.id);
  const selected = screen.getByRole(optionRole, { name: "热量排列" });
  expect(selected).toHaveAttribute(optionRole === "option" ? "aria-selected" : "aria-checked", "true");
  expect(selected).toHaveClass("is-selected", "active");
  await user.click(screen.getByRole(optionRole, { name: "最近添加" }));
  expect(changed).toHaveBeenCalledExactlyOnceWith("recent");
  expect(screen.queryByRole(role)).not.toBeInTheDocument();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).not.toHaveClass("is-open");
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(screen.getByRole(optionRole, { name: "最近添加" })).toHaveAttribute(optionRole === "option" ? "aria-selected" : "aria-checked", "true");
});

it.each(["{ArrowDown}", "{ArrowUp}", "{Enter}", " "])("opens with %s and Escape restores the trigger without selecting", async key => {
  const user = userEvent.setup();
  const { trigger, changed } = mount();
  trigger.focus();
  await user.keyboard(key);
  await waitFor(() => expect(screen.getByRole("option", { name: "热量排列" })).toHaveFocus());
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
});

it.each(["{Enter}", " "])("navigates options with wrapping, Home and End, then selects once with %s", async activation => {
  const user = userEvent.setup();
  const { trigger, changed } = mount();
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  const first = screen.getByRole("option", { name: "手动排列" }), last = screen.getByRole("option", { name: "最近添加" });
  await waitFor(() => expect(screen.getByRole("option", { name: "热量排列" })).toHaveFocus());
  await user.keyboard("{End}"); expect(last).toHaveFocus();
  await user.keyboard("{ArrowDown}"); expect(first).toHaveFocus();
  await user.keyboard("{ArrowUp}"); expect(last).toHaveFocus();
  await user.keyboard("{Home}"); expect(first).toHaveFocus();
  expect(changed).not.toHaveBeenCalled();
  await user.keyboard(activation);
  expect(changed).toHaveBeenCalledExactlyOnceWith("manual");
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

it("leaves Tab navigation native and closes on an outside pointer without changing the value", async () => {
  const user = userEvent.setup();
  const { trigger, changed } = mount();
  await user.click(trigger);
  // Pointer opening keeps focus on the trigger. Tab enters the ordinary option
  // order; it does not silently choose an item or trap focus in the menu.
  await user.tab();
  expect(screen.getByRole("option", { name: "手动排列" })).toHaveFocus();
  await user.tab(); await user.tab(); await user.tab();
  expect(screen.getByRole("button", { name: "后一控件" })).toHaveFocus();
  expect(changed).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "前一控件" }));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "前一控件" })).toHaveFocus();
});

it.each([false, true])("keeps a disabled trigger inert and out of the Tab order (settings: %s)", async settings => {
  const user = userEvent.setup();
  const { trigger, changed } = mount({ disabled: true }, settings);
  expect(trigger).toBeDisabled();
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "前一控件" }));
  await user.tab();
  expect(screen.getByRole("button", { name: "后一控件" })).toHaveFocus();
  expect(changed).not.toHaveBeenCalled();
});

it("keeps SettingsSelect shells and contains Escape inside a real portaled settings dialog", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  function Settings() {
    const [value, setValue] = useState("heat");
    return <Dialog.Root defaultOpen><Dialog.Portal><Dialog.Overlay /><Dialog.Content aria-describedby={undefined}>
      <Dialog.Title>设置</Dialog.Title>
      <SettingsSelect ariaLabel="设置排列" triggerClassName="settings-select" value={value} options={options}
        onChange={next => { changed(next); setValue(next); }} />
    </Dialog.Content></Dialog.Portal></Dialog.Root>;
  }
  render(<Settings />);
  const trigger = screen.getByRole("button", { name: "设置排列" });
  expect(trigger).toHaveClass("select-menu-trigger", "settings-option", "is-selected", "settings-select");
  trigger.focus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("option", { name: "热量排列" })).toHaveFocus());
  for (const option of screen.getAllByRole("option")) expect(option).toHaveClass("settings-option");
  await user.keyboard("{End}{Enter}");
  expect(changed).toHaveBeenCalledExactlyOnceWith("recent");
  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("option", { name: "最近添加" })).toHaveFocus());
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "设置" })).toBeVisible();
  expect(trigger).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
