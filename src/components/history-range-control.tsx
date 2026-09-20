import { useEffect, useRef, useState } from "react";
import { CaretDown, Check, ClockCounterClockwise } from "@phosphor-icons/react";
import type { HistoryTimeRange } from "../lib/browser-history";
const TIME_RANGE_OPTIONS: Array<{ value: HistoryTimeRange; label: string }> = [
  { value: "all", label: "全部历史" },
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];

export function HistoryRangeControl({
  value,
  onChange,
}: {
  value: HistoryTimeRange;
  onChange: (value: HistoryTimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedIndex = TIME_RANGE_OPTIONS.findIndex((option) => option.value === value);
  const selectedOption = TIME_RANGE_OPTIONS[selectedIndex] ?? TIME_RANGE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", handleOutsidePointer);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function selectOption(nextValue: HistoryTimeRange) {
    onChange(nextValue);
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      const option = TIME_RANGE_OPTIONS[selectedIndex] ?? TIME_RANGE_OPTIONS[0];
      controlRef.current?.querySelector<HTMLButtonElement>(
        `[data-history-range-option="${option.value}"]`,
      )?.focus();
    }, 0);
  }, [open, selectedIndex]);

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleOptionKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = event.key === "ArrowDown"
        ? (index + 1) % TIME_RANGE_OPTIONS.length
        : (index - 1 + TIME_RANGE_OPTIONS.length) % TIME_RANGE_OPTIONS.length;
      const nextValue = TIME_RANGE_OPTIONS[nextIndex].value;
      onChange(nextValue);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(TIME_RANGE_OPTIONS[index].value);
    }
  }

  return (
    <div className="history-range-control" ref={controlRef}>
      <button
        type="button"
        className={`history-range-trigger ${open ? "is-open" : ""}`}
        ref={triggerRef}
        aria-label="历史记录时间范围"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="history-range-options"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <ClockCounterClockwise
          className="history-range-icon"
          size={18}
          weight="regular"
          aria-hidden="true"
        />
        <span className="history-range-label">时间范围</span>
        <span className="history-range-value">{selectedOption.label}</span>
        <CaretDown size={14} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div
          id="history-range-options"
          className="history-range-menu"
          role="listbox"
          aria-label="历史记录时间范围选项"
        >
          <span className="history-range-menu-label">时间范围</span>
          {TIME_RANGE_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              data-history-range-option={option.value}
              className={value === option.value ? "is-selected" : ""}
              onClick={() => selectOption(option.value)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={15} weight="bold" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
