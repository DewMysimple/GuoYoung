import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, EyedropperSample } from "@phosphor-icons/react";
import { useLatestEvent } from "../hooks/use-latest-event";

interface CustomColorPickerProps {
  label?: string;
  value: string;
  selected?: boolean;
  /** Pointer gestures preview without publishing the parent settings draft. */
  onPreview?: (value: string | null) => void;
  /** Publishes one finished gesture, or a discrete keyboard / HEX edit. */
  onChange: (value: string) => void;
}

interface HsvColor {
  h: number;
  s: number;
  v: number;
}

interface ColorGesture {
  pointerId: number;
  control: HTMLElement;
  bounds: DOMRect | null;
  start: HsvColor;
  next: HsvColor;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function hexToHsv(hex: string): HsvColor {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  return {
    h: hue < 0 ? hue + 360 : hue,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

function hsvToHex({ h, s, v }: HsvColor) {
  const saturation = s / 100;
  const value = v / 100;
  const chroma = value * saturation;
  const section = h / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const match = value - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (section < 1) [red, green] = [chroma, x];
  else if (section < 2) [red, green] = [x, chroma];
  else if (section < 3) [green, blue] = [chroma, x];
  else if (section < 4) [green, blue] = [x, chroma];
  else if (section < 5) [red, blue] = [x, chroma];
  else [red, blue] = [chroma, x];

  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function colorForHex(value: string, previous: HsvColor) {
  const next = hexToHsv(value);
  // RGB grey has no hue; black also has no saturation. Retain the user's
  // position so adjusting hue while grey/black does not jump back to red.
  if (next.s === 0) next.h = previous.h;
  if (next.v === 0) next.s = previous.s;
  return next;
}

export function CustomColorPicker({
  label = "自定义强调色",
  value,
  selected = false,
  onPreview,
  onChange,
}: CustomColorPickerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hexInput, setHexInput] = useState(value.toUpperCase());
  const hsvRef = useRef(hsv);
  const previousValue = useRef(value);
  const hexEdited = useRef(false);
  const gesture = useRef<ColorGesture | null>(null);
  const frame = useRef<number | null>(null);
  const previewValue = useRef<string | null>(null);
  const change = useLatestEvent(onChange);
  const preview = useLatestEvent((next: string | null) => onPreview?.(next));

  function setLocalColor(next: HsvColor) {
    hsvRef.current = next;
    setHsv(current => current.h === next.h && current.s === next.s && current.v === next.v ? current : next);
    setHexInput(hsvToHex(next).toUpperCase());
    hexEdited.current = false;
    if (hueRef.current) hueRef.current.value = String(Math.round(next.h));
  }

  function clearFrame() {
    if (frame.current === null) return;
    window.cancelAnimationFrame(frame.current);
    frame.current = null;
  }

  function release(active: ColorGesture) {
    if (active.control.hasPointerCapture(active.pointerId)) active.control.releasePointerCapture(active.pointerId);
  }

  const cancel = useLatestEvent((restore = true) => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    clearFrame();
    release(active);
    if (restore) setLocalColor(active.start);
    previewValue.current = null;
    preview(null);
  });

  function paint(next: HsvColor) {
    setLocalColor(next);
    const hex = hsvToHex(next);
    if (previewValue.current === hex) return;
    previewValue.current = hex;
    preview(hex);
  }

  function schedule(next: HsvColor) {
    const active = gesture.current;
    if (!active) return;
    active.next = next;
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      if (gesture.current) paint(gesture.current.next);
    });
  }

  function areaColor(active: ColorGesture, clientX: number, clientY: number) {
    const bounds = active.bounds!;
    return { ...active.next,
      s: clamp(((clientX - bounds.left) / bounds.width) * 100),
      v: clamp(100 - ((clientY - bounds.top) / bounds.height) * 100) };
  }

  const finish = useLatestEvent((event: globalThis.PointerEvent) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const next = active.bounds ? areaColor(active, event.clientX, event.clientY)
      : { ...active.next, h: Number((active.control as HTMLInputElement).value) };
    gesture.current = null;
    clearFrame();
    release(active);
    paint(next);
    change(hsvToHex(next));
    previewValue.current = null;
    preview(null);
  });

  useEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;
    cancel();
    if (hsvToHex(hsvRef.current) !== value.toLowerCase()) setLocalColor(colorForHex(value, hsvRef.current));
    else setHexInput(value.toUpperCase());
  }, [value, cancel]);

  useEffect(() => {
    const pointerCancel = (event: globalThis.PointerEvent) => {
      if (gesture.current?.pointerId === event.pointerId) cancel();
    };
    const cancelGesture = () => cancel();
    const visibility = () => { if (document.hidden) cancel(); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("blur", cancelGesture);
    window.addEventListener("pagehide", cancelGesture);
    window.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancel(false);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("blur", cancelGesture);
      window.removeEventListener("pagehide", cancelGesture);
      window.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [cancel, finish]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        cancel();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open, cancel]);

  function commit(next: HsvColor) {
    cancel();
    setLocalColor(next);
    change(hsvToHex(next));
  }

  function start(event: ReactPointerEvent<HTMLElement>, area: boolean) {
    if (event.button !== 0 || event.isPrimary === false || gesture.current) return;
    const bounds = area ? event.currentTarget.getBoundingClientRect() : null;
    if (bounds && (!bounds.width || !bounds.height)) return;
    if (area) {
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const active = { pointerId: event.pointerId, control: event.currentTarget, bounds,
      start: hsvRef.current, next: hsvRef.current };
    gesture.current = active;
    if (area) schedule(areaColor(active, event.clientX, event.clientY));
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) { cancel(); return; }
    if (active.bounds) {
      event.preventDefault();
      schedule(areaColor(active, event.clientX, event.clientY));
    }
  }

  function lostCapture(event: ReactPointerEvent<HTMLElement>) {
    if (gesture.current?.pointerId === event.pointerId) cancel();
  }

  function handleAreaKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const current = gesture.current?.next ?? hsvRef.current;
    commit({
      ...current,
      s: clamp(
        current.s +
          (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
      ),
      v: clamp(
        current.v +
          (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
      ),
    });
  }

  function commitHex(force = false) {
    if (!hexEdited.current && !force) return;
    const normalized = hexInput.trim();
    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
      commit(colorForHex(normalized, hsvRef.current));
      return;
    }
    hexEdited.current = false;
    setHexInput(hsvToHex(hsvRef.current).toUpperCase());
  }

  const color = hsvToHex(hsv);

  return (
    <div className="custom-color-picker" ref={wrapperRef} onKeyDown={event => {
      if (event.key !== "Escape" || !open) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
      setOpen(false);
    }}>
      <button
        type="button"
        className={`accent-swatch custom-accent-swatch ${
          selected ? "is-selected" : ""
        }`}
        style={{ backgroundColor: color }}
        aria-label={label}
        aria-expanded={open}
        aria-pressed={selected}
        onClick={() => { if (open) cancel(); setOpen(current => !current); }}
      >
        <EyedropperSample size={17} weight="bold" />
      </button>
      {open && (
        <div className="color-picker-popover" role="dialog" aria-label="选择自定义颜色">
          <div
            className="color-picker-area"
            role="slider"
            tabIndex={0}
            aria-label="颜色饱和度和亮度"
            aria-valuetext={`饱和度 ${Math.round(hsv.s)}%，亮度 ${Math.round(hsv.v)}%`}
            style={{ "--picker-hue": hsv.h } as CSSProperties}
            onPointerDown={event => start(event, true)}
            onPointerMove={move}
            onLostPointerCapture={lostCapture}
            onKeyDown={handleAreaKey}
          >
            <span
              className="color-picker-cursor"
              style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
            />
          </div>
          <label className="color-picker-hue">
            <span className="visually-hidden">色相</span>
            <input
              ref={hueRef}
              type="range"
              min="0"
              max="359"
              defaultValue={Math.round(hsv.h)}
              onPointerDown={event => start(event, false)}
              onPointerMove={move}
              onLostPointerCapture={lostCapture}
              onChange={event => {
                const next = { ...(gesture.current?.next ?? hsvRef.current), h: Number(event.target.value) };
                if (gesture.current) schedule(next);
                else commit(next);
              }}
            />
          </label>
          <div className="color-picker-value">
            <span className="color-picker-preview" style={{ backgroundColor: color }}>
              <Check size={14} weight="bold" />
            </span>
            <label>
              <span>#</span>
              <input
                value={hexInput.replace(/^#/, "")}
                maxLength={6}
                aria-label="十六进制颜色"
                onChange={event => {
                  hexEdited.current = true;
                  setHexInput(`#${event.target.value.replace(/[^0-9a-f]/gi, "")}`);
                }}
                onBlur={() => commitHex()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitHex(true);
                  }
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
