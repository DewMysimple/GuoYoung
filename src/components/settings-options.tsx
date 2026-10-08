import type { ButtonHTMLAttributes, InputHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { SelectMenu, type SelectMenuProps } from "./select-menu";
import "./settings-options.css";

type OptionRole = "button" | "radio" | "tab" | "option" | "menuitemradio";
type SettingsOptionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role" | "aria-pressed" | "aria-checked" | "aria-selected"> & {
  selected: boolean;
  role?: OptionRole;
  variant?: "card" | "swatch";
};

/** Only the selectable shell belongs here; drafts and actions stay in each editor. */
export function SettingsOption({ selected, role = "button", variant, className = "", ...props }: SettingsOptionProps) {
  const checked = role === "radio" || role === "menuitemradio";
  const selectable = role === "tab" || role === "option";
  return <button type="button" {...props} role={role === "button" ? undefined : role}
    className={`settings-option ${className}`.trim()} data-variant={variant}
    aria-pressed={!checked && !selectable ? selected : undefined}
    aria-checked={checked ? selected : undefined} aria-selected={selectable ? selected : undefined}
    tabIndex={props.tabIndex ?? (role === "radio" || role === "tab" ? selected ? 0 : -1 : undefined)} />;
}

export function SettingsOptionGroup({ label, children, className = "", role = "group" }: {
  label: string; children: ReactNode; className?: string; role?: "group" | "radiogroup" | "tablist";
}) {
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (role === "group" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(
      `:scope > .settings-option[role="${role === "radiogroup" ? "radio" : "tab"}"]:not(:disabled)`,
    ));
    const index = options.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
      : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + options.length) % options.length;
    options[next].focus();
    options[next].click();
  }
  return <div className={`settings-option-group ${className}`.trim()} role={role} aria-label={label} onKeyDown={navigate}>{children}</div>;
}

export function SettingsChoiceGroup<Value extends string>({ label, value, options, onChange, disabled, className = "" }: {
  label: string; value: Value; options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void; disabled?: boolean; className?: string;
}) {
  return <SettingsOptionGroup label={label} className={`settings-choice-group ${className}`}>
    {options.map(option => <SettingsOption key={option.value} selected={value === option.value} disabled={disabled}
      onClick={() => onChange(option.value)}>{option.label}</SettingsOption>)}
  </SettingsOptionGroup>;
}

/** Retain native checkbox keyboard, focus and label semantics. */
export function SettingsCheckbox({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input {...props} type="checkbox" className={`settings-option-input ${className}`.trim()} />;
}

export function SettingsSelect<Value extends string>(props: SelectMenuProps<Value>) {
  return <SelectMenu {...props} containEscape
    triggerClassName={`settings-option is-selected ${props.triggerClassName ?? ""}`}
    optionClassName={`settings-option ${props.optionClassName ?? ""}`} />;
}
