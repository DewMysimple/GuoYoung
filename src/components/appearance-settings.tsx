import { useId, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import {
  applyLayoutPreset, applyTextSize, getLayoutPreset, getTextSize,
  LAYOUT_DETAILS, LAYOUT_OPTIONS, patchAppearance, TEXT_SIZE_OPTIONS,
} from "../lib/appearance-settings";
import type { AppearanceSettings as Appearance } from "../types";
import { CustomColorPicker } from "./custom-color-picker";
import "./appearance-settings.css";

const ACCENTS = ["#3367d6", "#6750a4", "#00897b", "#d97706", "#dc4f64", "#4f657d"];

interface AppearanceSettingsProps {
  value: Appearance;
  onChange: (value: Appearance) => void;
}

export function AppearanceSettingsEditor({ value, onChange }: AppearanceSettingsProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const preset = getLayoutPreset(value);
  const textSize = getTextSize(value);

  return (
    <>
      <section className="appearance-card" aria-label="页面布局">
        <div className="appearance-heading">
          <h3>页面布局</h3>
          {preset === "custom" && <span className="appearance-status">已自定义</span>}
        </div>
        <p className="appearance-description">选择喜欢的疏密，卡片与间距一起调整。</p>
        <div className="appearance-presets" role="group" aria-label="布局预设">
          {LAYOUT_OPTIONS.map(({ value: option, label, description }) => (
            <button key={option} type="button" aria-label={label}
              aria-pressed={preset === option}
              onClick={() => onChange(applyLayoutPreset(value, option))}>
              <span className={`appearance-layout-preview is-${option}`} aria-hidden="true">
                {Array.from({ length: option === "compact" ? 12 : 6 }, (_, index) => <i key={index} />)}
              </span>
              <strong>{label}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
        <button type="button" className="appearance-disclosure" aria-expanded={detailsOpen}
          aria-controls={detailsId} onClick={() => setDetailsOpen((open) => !open)}>
          <span>布局微调</span>
          <small>宽度、间距与圆角</small>
          <CaretDown size={15} aria-hidden="true" />
        </button>
        {detailsOpen && (
          <div className="appearance-details" id={detailsId}>
            <p className="appearance-description">立即预览。窄屏会自动适配可用空间。</p>
            {LAYOUT_DETAILS.map((field) => (
              <label key={field.key} className="range-control">
                <span>{field.label}<output>{value[field.key]}px</output></span>
                <input type="range" aria-label={field.label} min={field.min} max={field.max}
                  step={field.step} value={value[field.key]}
                  onChange={(event) => onChange(patchAppearance(value, {
                    [field.key]: Number(event.target.value),
                  }))} />
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="appearance-card" aria-label="颜色与文字">
        <h3>主题色</h3>
        <div className="accent-grid appearance-accents">
          {ACCENTS.map((color) => (
            <button key={color} type="button" className="accent-swatch"
              style={{ backgroundColor: color }} aria-label={`使用颜色 ${color}`}
              aria-pressed={value.accentColor === color}
              onClick={() => onChange(patchAppearance(value, { accentColor: color }))}>
              {value.accentColor === color && <Check size={16} weight="bold" />}
            </button>
          ))}
          <CustomColorPicker value={value.accentColor} selected={!ACCENTS.includes(value.accentColor)}
            onChange={(accentColor) => onChange(patchAppearance(value, { accentColor }))} />
        </div>
        <div className="appearance-heading appearance-reading-heading">
          <h3>文字大小</h3>
          {textSize === undefined && <span className="appearance-status">保留自定义字号</span>}
        </div>
        <div className="segmented-control" role="group" aria-label="文字大小">
          {TEXT_SIZE_OPTIONS.map(({ value: size, label }) => (
            <button key={size} type="button" className={textSize === size ? "active" : ""}
              aria-pressed={textSize === size} onClick={() => onChange(applyTextSize(value, size))}>
              {label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
