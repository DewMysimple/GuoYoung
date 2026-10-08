import { useId } from "react";
import { useSettingsDisclosure } from "./settings-location";
import { CaretDown, Check, Desktop, Sun, Moon } from "@phosphor-icons/react";
import {
  applyLayoutPreset, getLayoutPreset,
  LAYOUT_DETAILS, LAYOUT_OPTIONS, patchAppearance, restoreLayout,
} from "../lib/appearance-settings";
import type { AppearanceSettings as Appearance } from "../types";
import { CustomColorPicker } from "./custom-color-picker";
import "./appearance-settings.css";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { RangeControl } from "./range-control";
import { SettingsToggle } from "./settings-toggle";
import { LAYOUT_LIMITS } from "../lib/layout";
import { SettingsOption, SettingsOptionGroup, SettingsChoiceGroup } from "./settings-options";

const ACCENTS = ["#3367d6", "#6750a4", "#00897b", "#d97706", "#dc4f64", "#4f657d"];
const THEMES = [
  { value: "system", label: "跟随系统", description: "随系统自动切换", icon: Desktop },
  { value: "light", label: "浅色", description: "明亮清晰", icon: Sun },
  { value: "dark", label: "深色", description: "柔和暗色", icon: Moon },
] as const;

interface AppearanceSettingsProps {
  value: Appearance;
  onChange: (value: Appearance) => void;
  onColorPreview: (patch: Partial<Appearance> | null) => void;
  previousPreset: Appearance;
  onPresetChange: (value: Appearance) => void;
  panelWidth: number;
  panelMaxWidth: number;
  onPanelWidthChange: (width: number) => void;
}

export function AppearanceSettingsEditor({ value, previousPreset, onPresetChange, onChange, onColorPreview, panelWidth, panelMaxWidth, onPanelWidthChange }: AppearanceSettingsProps) {
  const [detailsOpen, setDetailsOpen] = useSettingsDisclosure("布局微调");
  const [dimensionsOpen, setDimensionsOpen] = useSettingsDisclosure("界面尺寸");
  const detailsId = useId();
  const preset = getLayoutPreset(value);

  return (
    <>
      <section className="appearance-card appearance-preview-settings" aria-label="预览与缩放">
        <h3>预览与缩放</h3>
        <SettingsToggle label="设置面板推开页面" checked={value.settingsPresentation === "push"}
          help="关闭时，设置面板覆盖在页面右侧，主页面保持原有宽度，方便预览布局。开启时，主页面缩窄，为设置面板留出空间；窗口过窄、无法容纳卡片时自动使用覆盖预览。"
          onChange={push => onChange(patchAppearance(value, { settingsPresentation: push ? "push" : "overlay" }))} />
        <RangeControl label="界面缩放" value={value.interfaceScale} min={LAYOUT_LIMITS.interfaceScale.min}
          max={LAYOUT_LIMITS.interfaceScale.max} unit="%"
          onChange={interfaceScale => onChange(patchAppearance(value, { interfaceScale }))} />
        <SettingsOptionGroup className="appearance-scale-options" label="常用界面缩放">
          {[75, 100, 125, 150].map(scale => <SettingsOption key={scale}
            aria-label={`界面缩放 ${scale}%`} selected={value.interfaceScale === scale}
            onClick={() => onChange(patchAppearance(value, { interfaceScale: scale }))}>{scale}%</SettingsOption>)}
        </SettingsOptionGroup>
        <p className="appearance-description">一起调整卡片、文字、图标与间距。高分辨率屏幕可适当放大；窗口变窄时自动减少列数。浏览器和系统缩放已体现在可用空间中，无需重复补偿。</p>
      </section>
      <section className="appearance-card" aria-label="主题">
        <h3>主题</h3>
        <p className="appearance-description">选择界面的明暗，或随系统自动切换。</p>
        <SettingsOptionGroup className="appearance-option-grid appearance-theme-options" label="主题模式">
          {THEMES.map(({ value: theme, label, description, icon: Icon }) => (
            <SettingsOption key={theme} aria-label={label} variant="card"
              selected={value.theme === theme}
              onClick={() => onChange(patchAppearance(value, { theme }))}>
              <span className={`appearance-theme-preview is-${theme}`} aria-hidden="true">
                <span className="appearance-theme-preview-toolbar" />
                <span className="appearance-theme-preview-tiles">
                  {Array.from({ length: 4 }, (_, index) => <i key={index} />)}
                </span>
              </span>
              <strong className="appearance-theme-label"><Icon size={14} aria-hidden="true" />{label}</strong>
              <small>{description}</small>
            </SettingsOption>
          ))}
        </SettingsOptionGroup>
      </section>
      <section className="appearance-card" aria-label="页面布局">
        <div className="appearance-heading">
          <h3>页面布局</h3>
          {preset === "custom" && <span className="appearance-status">已自定义</span>}
        </div>
        <p className="appearance-description">选择喜欢的疏密，卡片与间距一起调整。</p>
        <SettingsOptionGroup className="appearance-option-grid appearance-presets" label="布局预设">
          {LAYOUT_OPTIONS.map(({ value: option, label, description }) => (
            <SettingsOption key={option} aria-label={label} variant="card"
              selected={preset === option}
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
            </SettingsOption>
          ))}
        </SettingsOptionGroup>
        <div className="appearance-layout-controls">
          <LayoutChoice label="页面宽度模式" value={value.contentWidthMode}
            options={[{ value: "fixed", label: "固定宽度" }, { value: "full", label: "铺满窗口" }]}
            onChange={contentWidthMode => onChange(patchAppearance(value, { contentWidthMode }))} />
          <LayoutChoice label="卡片形状" value={value.cardShape}
            options={[{ value: "free", label: "自由比例" }, { value: "square", label: "正方形" }]}
            onChange={cardShape => onChange(patchAppearance(value, { cardShape }))} />
          <LayoutChoice label="卡片排列" value={value.cardLayout}
            options={[{ value: "adaptive", label: "自动适配" }, { value: "columns", label: "指定每行数量" }]}
            onChange={cardLayout => onChange(patchAppearance(value, { cardLayout }))} />
          {value.cardLayout === "columns" && <RangeControl label="每行卡片数量" value={value.cardColumns}
            min={LAYOUT_LIMITS.cardColumns.min} max={LAYOUT_LIMITS.cardColumns.max} unit="列"
            onChange={cardColumns => onChange(patchAppearance(value, { cardColumns }))} />}
          <p className="appearance-description">{value.cardLayout === "columns"
            ? "按每行数量均分宽度；空间不足时自动减少列数，保持卡片可读。"
            : "根据卡片最小宽度自动排列，充分利用可用空间。"}{value.cardShape === "square" && " 正方形的高度始终跟随实际宽度。"}</p>
        </div>
        <button type="button" className="appearance-disclosure" aria-expanded={detailsOpen}
          aria-controls={detailsId} onClick={() => setDetailsOpen((open) => !open)}>
          <span>布局微调</span>
          <small>尺寸、间距与圆角</small>
          <CaretDown size={15} aria-hidden="true" />
        </button>
        {detailsOpen && (
          <div className="appearance-details" id={detailsId}>
            <p className="appearance-description">尺寸以 100% 缩放为基准，立即预览。自动适配时，卡片宽度为最小宽度；实际宽度随排列均分。</p>
            {LAYOUT_DETAILS.map(({ key, ...field }) => (
              <RangeControl key={key} {...field} value={value[key]}
                disabled={(key === "contentWidth" && value.contentWidthMode === "full") ||
                  (key === "cardWidth" && value.cardLayout === "columns") ||
                  (key === "cardHeight" && value.cardShape === "square")}
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

      <details className="appearance-card interface-dimensions" open={dimensionsOpen} onToggle={event => setDimensionsOpen(event.currentTarget.open)}>
        <summary>界面尺寸 <span>顶栏与设置侧栏</span></summary>
        <p className="appearance-description">桌面端可直接拖动边界，双击边界恢复默认尺寸。侧栏宽度会自动记住。</p>
        <RangeControl label="顶栏高度" min={48} max={96} value={value.topbarHeight}
          onChange={(topbarHeight) => onChange(patchAppearance(value, { topbarHeight }))} />
        <RangeControl label="设置侧栏宽度" min={360} max={panelMaxWidth} value={panelWidth}
          onChange={onPanelWidthChange} />
      </details>

      <section className="appearance-card" aria-label="主题色">
        <h3>主题色</h3>
        <SettingsOptionGroup label="主题色选择" className="accent-grid appearance-accents">
          {ACCENTS.map((color) => (
            <SettingsOption key={color} className="accent-swatch" variant="swatch"
              aria-label={`使用颜色 ${color}`} selected={value.accentColor === color}
              onClick={() => onChange(patchAppearance(value, { accentColor: color }))}>
              <span className="settings-option-color" style={{ backgroundColor: color }} aria-hidden="true" />
              {value.accentColor === color && <Check size={16} weight="bold" />}
            </SettingsOption>
          ))}
          <CustomColorPicker value={value.accentColor} selected={!ACCENTS.includes(value.accentColor)}
            onPreview={accentColor => onColorPreview(accentColor === null ? null : { accentColor })}
            onChange={(accentColor) => onChange(patchAppearance(value, { accentColor }))} />
        </SettingsOptionGroup>
      </section>
    </>
  );
}

function LayoutChoice<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return <div className="appearance-layout-choice">
    <strong>{label}</strong>
    <SettingsChoiceGroup label={label} value={value} options={options} onChange={onChange} />
  </div>;
}
