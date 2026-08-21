import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Check, EyedropperSample } from "@phosphor-icons/react";

interface CustomColorPickerProps {
  value: string;
  selected?: boolean;
  onChange: (value: string) => void;
}

interface HsvColor {
  h: number;
  s: number;
  v: number;
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

export function CustomColorPicker({
  value,
  selected = false,
  onChange,
}: CustomColorPickerProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hexInput, setHexInput] = useState(value.toUpperCase());

  useEffect(() => {
    const next = hexToHsv(value);
    setHsv(next);
    setHexInput(value.toUpperCase());
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  function commit(next: HsvColor) {
    setHsv(next);
    onChange(hsvToHex(next));
  }

  function updateArea(clientX: number, clientY: number) {
    const bounds = areaRef.current?.getBoundingClientRect();
    if (!bounds) return;
    commit({
      ...hsv,
      s: clamp(((clientX - bounds.left) / bounds.width) * 100),
      v: clamp(100 - ((clientY - bounds.top) / bounds.height) * 100),
    });
  }

  function handleAreaPointer(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateArea(event.clientX, event.clientY);
  }

  function handleAreaKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    commit({
      ...hsv,
      s: clamp(
        hsv.s +
          (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
      ),
      v: clamp(
        hsv.v +
          (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
      ),
    });
  }

  function commitHex() {
    const normalized = hexInput.trim();
    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
      onChange(normalized.toLowerCase());
      return;
    }
    setHexInput(value.toUpperCase());
  }

  return (
    <div className="custom-color-picker" ref={wrapperRef}>
      <button
        type="button"
        className={`accent-swatch custom-accent-swatch ${
          selected ? "is-selected" : ""
        }`}
        style={{ backgroundColor: value }}
        aria-label="自定义强调色"
        aria-expanded={open}
        aria-pressed={selected}
        onClick={() => setOpen((current) => !current)}
      >
        <EyedropperSample size={17} weight="bold" />
      </button>
      {open && (
        <div className="color-picker-popover" role="dialog" aria-label="选择自定义颜色">
          <div
            ref={areaRef}
            className="color-picker-area"
            role="slider"
            tabIndex={0}
            aria-label="颜色饱和度和亮度"
            aria-valuetext={`饱和度 ${Math.round(hsv.s)}%，亮度 ${Math.round(hsv.v)}%`}
            style={{ "--picker-hue": hsv.h } as CSSProperties}
            onPointerDown={handleAreaPointer}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                updateArea(event.clientX, event.clientY);
              }
            }}
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
              type="range"
              min="0"
              max="359"
              value={Math.round(hsv.h)}
              onChange={(event) =>
                commit({ ...hsv, h: Number(event.target.value) })
              }
            />
          </label>
          <div className="color-picker-value">
            <span className="color-picker-preview" style={{ backgroundColor: value }}>
              <Check size={14} weight="bold" />
            </span>
            <label>
              <span>#</span>
              <input
                value={hexInput.replace(/^#/, "")}
                maxLength={6}
                aria-label="十六进制颜色"
                onChange={(event) =>
                  setHexInput(`#${event.target.value.replace(/[^0-9a-f]/gi, "")}`)
                }
                onBlur={commitHex}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitHex();
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
