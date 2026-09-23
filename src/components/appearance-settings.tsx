import { useId, useState } from "react";
import { CaretDown, Check, Desktop, Sun, Moon } from "@phosphor-icons/react";
import {
  applyLayoutPreset, applyTextSize, getLayoutPreset, getTextSize,
  LAYOUT_DETAILS, LAYOUT_OPTIONS, patchAppearance, restoreLayout, TEXT_SIZE_OPTIONS,
} from "../lib/appearance-settings";
import type { AppearanceSettings as Appearance } from "../types";
import { CustomColorPicker } from "./custom-color-picker";
import "./appearance-settings.css";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { RangeControl } from "./range-control";

const ACCENTS = ["#3367d6", "#6750a4", "#00897b", "#d97706", "#dc4f64", "#4f657d"];
const THEMES = [
  { value: "system", label: "跟随系统", icon: Desktop },
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
] as const;

interface AppearanceSettingsProps {
  value: Appearance;
  onChange: (value: Appearance) => void;
  previousPreset: Appearance;
  onPresetChange: (value: Appearance) => void;
  panelWidth: number;
  panelMaxWidth: number;
  onPanelWidthChange: (width: number) => void;
}

export function AppearanceSettingsEditor({ value, previousPreset, onPresetChange, onChange, panelWidth, panelMaxWidth, onPanelWidthChange }: AppearanceSettingsProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const preset = getLayoutPreset(value);
  const textSize = getTextSize(value);

  return (
    <>
      <section className="appearance-card" aria-label="主题">
        <h3>主题</h3>
        <p className="appearance-description">选择界面的明暗，或随系统自动切换。</p>
        <div className="segmented-control appearance-theme-options" role="group" aria-label="主题模式">
          {THEMES.map(({ value: theme, label, icon: Icon }) => (
            <button key={theme} type="button" className={value.theme === theme ? "active" : ""}
              aria-pressed={value.theme === theme}
              onClick={() => onChange(patchAppearance(value, { theme }))}>
              <Icon size={17} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </section>
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
              onClick={() => {
                const next = applyLayoutPreset(value, option);
                onPresetChange(next);
                onChange(next);
              }}>
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
          <small>尺寸、间距与圆角</small>
          <CaretDown size={15} aria-hidden="true" />
        </button>
        {detailsOpen && (
          <div className="appearance-details" id={detailsId}>
            <p className="appearance-description">立即预览。窄屏会自动适配可用空间。</p>
            {LAYOUT_DETAILS.map(({ key, ...field }) => (
              <RangeControl key={key} {...field} value={value[key]}
                onChange={(next) => onChange(patchAppearance(value, { [key]: next }))} />
            ))}
            <div className="settings-inline-actions">
              <button type="button" className="button secondary-button" onClick={() => onChange(restoreLayout(value, DEFAULT_APPEARANCE))}>恢复默认</button>
              <button type="button" className="button secondary-button" onClick={() => onChange(restoreLayout(value, previousPreset))}>恢复上次预设</button>
            </div>
            <p className="appearance-description">上次预设为本次选择的布局；尚未选择时，恢复进入设置前的布局。</p>
          </div>
        )}
      </section>

      <details className="appearance-card interface-dimensions">
        <summary>界面尺寸 <span>顶栏与设置侧栏</span></summary>
        <p className="appearance-description">桌面端可直接拖动边界，双击边界恢复默认尺寸。侧栏宽度会自动记住。</p>
        <RangeControl label="顶栏高度" min={48} max={96} value={value.topbarHeight}
          onChange={(topbarHeight) => onChange(patchAppearance(value, { topbarHeight }))} />
        <RangeControl label="设置侧栏宽度" min={360} max={panelMaxWidth} value={panelWidth}
          onChange={onPanelWidthChange} />
      </details>

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
