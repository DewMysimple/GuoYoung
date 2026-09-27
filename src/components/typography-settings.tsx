import { ArrowCounterClockwise, Check } from "@phosphor-icons/react";
import type { AppearanceSettings } from "../types";
import { applyTextSize, getTextSize, patchAppearance, TEXT_SIZE_OPTIONS } from "../lib/appearance-settings";
import { FONT_OPTIONS, TEXT_EFFECTS, getFontFamily, resetTypography, typographyVariables } from "../lib/typography";
import { CustomColorPicker } from "./custom-color-picker";
import { RangeControl } from "./range-control";
import { SettingsDisclosure } from "./settings-disclosure";
import type { CSSProperties } from "react";
import "./typography-settings.css";

const COLORS = [
  { label: "墨色", main: "#171c26", secondary: "#394457" },
  { label: "白色", main: "#ffffff", secondary: "#e2e8f0" },
  { label: "暖黄", main: "#fff1c2", secondary: "#eadbb5" },
  { label: "薄荷", main: "#bef8ed", secondary: "#9ed6cd" },
];

export function TypographySettingsEditor({ value, onChange, wallpaperUrl }: {
  value: AppearanceSettings; onChange: (value: AppearanceSettings) => void; wallpaperUrl?: string;
}) {
  const patch = (next: Partial<AppearanceSettings>) => onChange(patchAppearance(value, next));
  const textSize = getTextSize(value);
  const hasEffect = !["auto", "none"].includes(value.textEffect);
  return <div className="settings-section typography-settings">
    <section className="typography-preview" aria-label="字体效果预览" data-text-effect={value.textEffect}
      style={{ ...typographyVariables(value), fontFamily: getFontFamily(value), fontSize: `${14 * value.fontScale / 100}px`,
        ...(wallpaperUrl ? { backgroundImage: `url(${JSON.stringify(wallpaperUrl)})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) } as CSSProperties}>
      <strong>让每一份收藏，清晰可读。</strong>
      <span>Mysimple · 网站收藏  Aa 012345</span>
    </section>

    <section className="appearance-card typography-family" aria-label="字体">
      <h3>字体</h3>
      <div className="typography-fonts" role="group" aria-label="字体选择">
        {FONT_OPTIONS.map(option => <button type="button" key={option.value}
          aria-pressed={value.fontFamily === option.value} style={{ fontFamily: option.family }}
          onClick={() => patch({ fontFamily: option.value })}>{option.label}</button>)}
      </div>
      {value.fontFamily === "custom" && <label className="field-label typography-local-font">
        本机字体名称
        <input value={value.customFontFamily} maxLength={80} placeholder="例如：Microsoft YaHei"
          onChange={event => patch({ customFontFamily: event.target.value })} />
        <small>使用电脑已安装的字体；找不到时使用默认字体。</small>
      </label>}
    </section>

    <section className="appearance-card" aria-label="字号调节">
      <div className="appearance-heading"><h3>文字大小</h3>
        {textSize === undefined && <span className="appearance-status">保留自定义字号</span>}
      </div>
      <div className="segmented-control" role="group" aria-label="文字大小">
        {TEXT_SIZE_OPTIONS.map(({ value: size, label }) => <button key={size} type="button"
          className={textSize === size ? "active" : ""} aria-pressed={textSize === size}
          onClick={() => onChange(applyTextSize(value, size))}>{label}</button>)}
      </div>
      <RangeControl label="整体字号" min={85} max={120} unit="%" value={value.fontScale}
        onChange={fontScale => patch({ fontScale })} />
    </section>

    <section className="appearance-card" aria-label="文字颜色">
      <h3>文字颜色</h3>
      <div className="segmented-control" role="group" aria-label="文字配色">
        {[{ value: "theme", label: "跟随主题" }, { value: "custom", label: "自定义" }].map(option =>
          <button key={option.value} type="button" className={value.textColorMode === option.value ? "active" : ""}
            aria-pressed={value.textColorMode === option.value}
            onClick={() => patch({ textColorMode: option.value as AppearanceSettings["textColorMode"] })}>{option.label}</button>)}
      </div>
      {value.textColorMode === "custom" && <>
        <div className="typography-color-presets" role="group" aria-label="文字配色预设">
          {COLORS.map(color => <button type="button" key={color.label} aria-label={`${color.label}文字`}
            aria-pressed={value.textColor === color.main && value.textSecondaryColor === color.secondary}
            onClick={() => patch({ textColor: color.main, textSecondaryColor: color.secondary })}>
            <i style={{ background: color.main }} />{color.label}
            {value.textColor === color.main && value.textSecondaryColor === color.secondary && <Check size={12} />}
          </button>)}
        </div>
        <div className="typography-color-row"><span>主要文字</span><code>{value.textColor.toUpperCase()}</code>
          <CustomColorPicker label="自定义主要文字颜色" value={value.textColor} onChange={textColor => patch({ textColor })} />
        </div>
        <div className="typography-color-row"><span>次要文字</span><code>{value.textSecondaryColor.toUpperCase()}</code>
          <CustomColorPicker label="自定义次要文字颜色" value={value.textSecondaryColor} onChange={textSecondaryColor => patch({ textSecondaryColor })} />
        </div>
      </>}
      <p className="typography-note">用于页面内容；设置和菜单保持主题配色，方便随时调回。</p>
    </section>

    <section className="appearance-card" aria-label="文字增强">
      <h3>文字增强</h3>
      <div className="typography-effects" role="group" aria-label="文字效果">
        {TEXT_EFFECTS.map(option => <button type="button" key={option.value}
          aria-pressed={value.textEffect === option.value}
          onClick={() => patch({ textEffect: option.value,
            ...(option.value === "glow" ? { textEffectColor: "#ffffff" } : option.value === "shadow" || option.value === "outline" ? { textEffectColor: "#000000" } : {}) })}>{option.label}</button>)}
      </div>
      {hasEffect && <>
        <RangeControl label="效果强度" min={0} max={100} unit="%" value={value.textEffectStrength}
          onChange={textEffectStrength => patch({ textEffectStrength })} />
        <div className="typography-color-row"><span>效果颜色</span><code>{value.textEffectColor.toUpperCase()}</code>
          <CustomColorPicker label="自定义文字效果颜色" value={value.textEffectColor} onChange={textEffectColor => patch({ textEffectColor })} />
        </div>
      </>}
      <p className="typography-note">浅字配深色阴影，深字配浅色柔光。复杂壁纸可试描边，或调高壁纸遮罩。</p>
    </section>

    <SettingsDisclosure title="分区字号" summary="在整体字号上微调">
      <RangeControl label="网站卡片字号" min={80} max={140} unit="%" value={value.cardFontScale} onChange={cardFontScale => patch({ cardFontScale })} />
      <RangeControl label="分组字号" min={80} max={140} unit="%" value={value.groupFontScale} onChange={groupFontScale => patch({ groupFontScale })} />
      <RangeControl label="品牌名称字号" min={70} max={180} unit="%" value={value.brandFontScale} onChange={brandFontScale => patch({ brandFontScale })} />
    </SettingsDisclosure>
    <section className="appearance-card" aria-label="文字选择">
      <label className="toggle-row compact-toggle-row"><span><strong>允许选择展示文字</strong></span>
        <input type="checkbox" checked={value.allowTextSelection}
          onChange={event => patch({ allowTextSelection: event.target.checked })} />
      </label>
      <p className="typography-note">标题、说明等文字可选中复制；输入框始终可编辑，拖拽卡片保持原有操作。</p>
    </section>
    <button type="button" className="text-action appearance-reset" onClick={() => onChange(resetTypography(value))}>
      <ArrowCounterClockwise size={16} />恢复默认字体
    </button>
  </div>;
}
