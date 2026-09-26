import { CaretDown, Check } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import "./select-menu.css";

export interface SelectMenuOption<Value extends string = string> {
  value: Value;
  label: string;
  icon?: ReactNode;
}

interface SelectMenuProps<Value extends string> {
  value: Value;
  options: SelectMenuOption<Value>[];
  onChange: (value: Value) => void;
  ariaLabel?: string;
  menuLabel?: string;
  popoverRole?: "listbox" | "menu";
  optionRole?: "option" | "menuitemradio";
  renderTrigger?: (selected: SelectMenuOption<Value> | undefined) => ReactNode;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  title?: string;
  disabled?: boolean;
  placement?: "top" | "bottom";
}

/** Shared custom select used by the homepage controls and extension popup. */
export function SelectMenu<Value extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  menuLabel,
  popoverRole = "listbox",
  optionRole = "option",
  renderTrigger,
  className = "",
  triggerClassName = "",
  menuClassName = "",
  title,
  disabled = false,
  placement = "bottom",
}: SelectMenuProps<Value>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = `select-menu-${useId()}`;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", handleOutsidePointer);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function focusOption(index: number) {
    window.setTimeout(() => optionRefs.current[index]?.focus(), 0);
  }

  function openAndFocusSelected() {
    if (disabled || options.length === 0) return;
    setOpen(true);
    focusOption(selectedIndex);
  }

  function selectOption(nextValue: Value) {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openAndFocusSelected();
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : event.key === "ArrowDown"
            ? (index + 1) % options.length
            : (index - 1 + options.length) % options.length;
      optionRefs.current[nextIndex]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(options[index].value);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`select-menu-root ${className}`.trim()}
      data-placement={placement}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`select-menu-trigger ${open ? "is-open" : ""} ${triggerClassName}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup={popoverRole}
        aria-expanded={open}
        aria-controls={menuId}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        {renderTrigger ? renderTrigger(selected) : <span>{selected?.label ?? "请选择"}</span>}
        <CaretDown className="select-menu-caret" size={13} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          className={`select-menu-popover ${menuClassName}`.trim()}
          role={popoverRole}
          aria-label={menuLabel ?? ariaLabel}
        >
          {menuLabel && <span className="select-menu-label">{menuLabel}</span>}
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role={optionRole}
              aria-selected={optionRole === "option" ? option.value === value : undefined}
              aria-checked={optionRole === "menuitemradio" ? option.value === value : undefined}
              className={`select-menu-option ${option.value === value ? "is-selected active" : ""}`}
              onClick={() => selectOption(option.value)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              {option.icon && <span className="select-menu-option-icon">{option.icon}</span>}
              <span className="select-menu-option-label">{option.label}</span>
              {option.value === value && <Check className="select-menu-option-check" size={15} weight="bold" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
