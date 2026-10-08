import { useEffect, useId, useRef, useState } from "react";
import "./range-control.css";

interface RangeControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function parseNumber(text: string) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim())) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function decimalPlaces(number: number) {
  const [coefficient, exponent = "0"] = String(number).split("e");
  return Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
}

function formatNumber(number: number) {
  const rounded = Number(number.toPrecision(15));
  return rounded.toFixed(Math.min(100, decimalPlaces(rounded)));
}

/** Typed values and the native slider share the same min-based step grid. */
function snapValue(number: number, min: number, max: number, step: number) {
  const lastStep = (max - min) / step;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(lastStep)) * 4;
  const index = Math.min(Math.floor(lastStep + tolerance), Math.max(0, Math.round((number - min) / step)));
  return Number((min + index * step).toFixed(Math.min(100, Math.max(decimalPlaces(min), decimalPlaces(step)))));
}

/** One controlled value, an immediate slider and an editable numeric draft. */
export function RangeControl({ label, value, min, max, step = 1, unit = "px", disabled, onChange }: RangeControlProps) {
  const id = useId();
  const numberInput = useRef<HTMLInputElement>(null);
  const edited = useRef(false);
  const [draft, setDraft] = useState(() => formatNumber(value));
  const [focused, setFocused] = useState(false);
  const parsed = parseNumber(draft);

  useEffect(() => {
    edited.current = false;
    setDraft(formatNumber(value));
  }, [value, min, max, step, disabled]);

  useEffect(() => {
    if (!focused) return;
    // Radix dismisses at document capture; cancel the focused draft before it.
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.target !== numberInput.current || !edited.current) return;
      event.preventDefault();
      event.stopPropagation();
      edited.current = false;
      setDraft(formatNumber(value));
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, [focused, value]);

  function apply(number: number) {
    if (disabled) return;
    const next = snapValue(number, min, max, step);
    edited.current = false;
    setDraft(formatNumber(next));
    if (next !== value) onChange(next);
  }

  function commit() {
    if (!edited.current || disabled) return;
    if (parsed !== null) apply(parsed);
    else {
      edited.current = false;
      setDraft(formatNumber(value));
    }
  }

  return (
    <div className="range-control">
      <span className="range-control-heading">
        <label htmlFor={id}>{label}</label>
        <span className="input-shell range-control-number" title="输入后按 Enter 或离开输入框应用，Esc 取消">
          <input ref={numberInput} type="text" role="spinbutton" inputMode="decimal"
            aria-label={`${label}数值`} aria-describedby={`${id}-hint`}
            aria-valuemin={min} aria-valuemax={max} aria-valuenow={parsed ?? undefined}
            aria-valuetext={`${draft}${unit}`} aria-invalid={parsed === null || parsed < min || parsed > max || undefined}
            value={draft} disabled={disabled} onFocus={() => setFocused(true)}
            onChange={event => { edited.current = true; setDraft(event.target.value); }}
            onBlur={() => { setFocused(false); commit(); }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || disabled) return;
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                commit();
              } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                const position = ((parsed ?? value) - min) / step;
                const tolerance = Number.EPSILON * Math.max(1, Math.abs(position)) * 4;
                const index = event.key === "ArrowUp" ? Math.floor(position + tolerance) + 1 : Math.ceil(position - tolerance) - 1;
                apply(min + index * step);
              }
            }} />
          {unit && <span className="range-control-unit" aria-hidden="true">{unit}</span>}
        </span>
      </span>
      <input id={id} type="range" aria-label={label} min={min} max={max} step={step}
        value={value} disabled={disabled} onChange={event => apply(Number(event.target.value))} />
      <small id={`${id}-hint`} className="visually-hidden">输入后按 Enter 或离开输入框应用，Esc 取消。</small>
    </div>
  );
}
