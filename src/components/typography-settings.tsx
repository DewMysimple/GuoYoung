import { SettingsToggle } from "./settings-toggle";
import { ArrowCounterClockwise, Check } from "@phosphor-icons/react";
import type { AppearanceSettings } from "../types";
import { patchAppearance } from "../lib/appearance-settings";
import { FONT_OPTIONS, TEXT_EFFECTS, getFontFamily, resetTypography } from "../lib/typography";
import { CustomColorPicker } from "./custom-color-picker";
import { RangeControl } from "./range-control";
import { SettingsDisclosure } from "./settings-disclosure";
import { LocalFontPicker } from "./local-font-picker";
import "./typography-settings.css";

const COLORS = [
  { label: "墨色", main: "#000000", secondary: "#394457" },
  { label: "白色", main: "#ffffff", secondary: "#e2e8f0" },
  { label: "暖黄", main: "#fff1c2", secondary: "#eadbb5" },
  { label: "薄荷", main: "#bef8ed", secondary: "#9ed6cd" },
];

export function TypographySettingsEditor({ value, onChange, onColorPreview, wallpaperUrl, localFontError }: {
  value: AppearanceSettings; onChange: (value: AppearanceSettings) => void; wallpaperUrl?: string; localFontError?: string;
  onColorPreview: (patch: Partial<AppearanceSettings> | null) => void;
}) {
  const patch = (next: Partial<AppearanceSettings>) => onChange(patchAppearance(value, next));
  const hasEffect = !["auto", "none"].includes(value.textEffect);
  const font = FONT_OPTIONS.find(option => option.value === value.fontFamily)!;
  const effect = TEXT_EFFECTS.find(option => option.value === value.textEffect)!;
  return <div className="settings-section typography-settings">
    <section className="typography-preview" aria-label="字体效果预览" data-text-effect={value.textEffect}
      >
      <div className="typography-preview-background" aria-hidden="true"
        style={wallpaperUrl ? { backgroundImage: `url(${JSON.stringify(wallpaperUrl)})` } : undefined} />
      <strong>让每一份收藏，清晰可读。</strong>
      <span>Mysimple · 网站收藏  Aa 012345</span>
    </section>

    <section className="appearance-card typography-family" aria-label="字体">
      <div className="appearance-heading"><h3>字体</h3><span className="appearance-status">{font.label}</span></div>
      <div className="appearance-option-grid typography-fonts" role="group" aria-label="字体选择">
        {FONT_OPTIONS.map(option => <button type="button" key={option.value}
          aria-label={option.label} aria-pressed={value.fontFamily === option.value}
          onClick={() => patch({ fontFamily: option.value })}>
          <span className="typography-font-sample" aria-hidden="true" style={{ fontFamily: option.value === "custom" ? getFontFamily({ ...value, fontFamily: "custom" }) : option.family }}>收藏 Aa</span>
          <span className="typography-font-label">{option.label}</span>
        </button>)}
      </div>
      {value.fontFamily === "custom" && <LocalFontPicker name={value.customFontFamily} error={localFontError}
        onChoose={({ assetId, name }) => patch({ customFontFamily: name, customFontAssetId: assetId })} />}
      <div className="typography-size" aria-label="字号调节">
      <RangeControl label="整体字号" min={70} max={130} unit="%" value={value.fontScale}
        onChange={fontScale => patch({ fontScale })} />
      </div>
      <SettingsDisclosure title="分区字号" summary="在整体字号上微调" className="settings-subsection">
        <RangeControl label="网站卡片字号" min={80} max={140} unit="%" value={value.cardFontScale} onChange={cardFontScale => patch({ cardFontScale })} />
        <RangeControl label="分组字号" min={80} max={140} unit="%" value={value.groupFontScale} onChange={groupFontScale => patch({ groupFontScale })} />
        <RangeControl label="品牌名称字号" min={70} max={180} unit="%" value={value.brandFontScale} onChange={brandFontScale => patch({ brandFontScale })} />
      </SettingsDisclosure>
    </section>

    <SettingsDisclosure help="全局生效，包含设置、菜单与弹窗。无壁纸时保留主题层次与强调色，壁纸下主题文字统一为黑或白；网站原图标和 Logo 保留原色。" title="文字颜色" summary={value.textColorMode === "theme" ? "跟随主题" : "自定义"}>
      <SettingsToggle label="主题关联字体颜色" help="有壁纸时浅色用纯黑、深色用纯白；无壁纸时保留主题的主次层次。关闭后使用自定义配色" checked={value.textColorMode === "theme"}
        onChange={checked => patch({ textColorMode: checked ? "theme" : "custom" })} />
      <SettingsToggle label="区分主次文字" help="自定义配色下，关闭后所有文字统一使用主要颜色" checked={value.textColorHierarchy === "split"}
        onChange={checked => patch({ textColorHierarchy: checked ? "split" : "unified" })} />
      <p className="typography-note">选择预设或调整调色盘即可使用自定义颜色；开启主题关联可恢复主题配色。</p>
        <div className="typography-color-presets" role="group" aria-label="文字配色预设">
          {COLORS.map(color => <button type="button" className="settings-choice" key={color.label} aria-label={`${color.label}文字`}
            aria-pressed={value.textColorMode === "custom" && value.textColor === color.main && value.textSecondaryColor === color.secondary}
            onClick={() => patch({ textColorMode: "custom", textColor: color.main, textSecondaryColor: color.secondary })}>
            <i style={{ background: color.main }} />{color.label}
            {value.textColorMode === "custom" && value.textColor === color.main && value.textSecondaryColor === color.secondary && <Check size={12} />}
          </button>)}
        </div>
        <div className="typography-color-row"><span>{value.textColorHierarchy === "unified" ? "全部文字" : "主要文字"}</span><code>{value.textColor.toUpperCase()}</code>
          <CustomColorPicker label="自定义主要文字颜色" value={value.textColor} onChange={textColor => patch({ textColorMode: "custom", textColor })}
            onPreview={textColor => onColorPreview(textColor === null ? null : { textColorMode: "custom", textColor })} />
        </div>
        {value.textColorHierarchy === "split" && <div className="typography-color-row"><span>次要文字</span><code>{value.textSecondaryColor.toUpperCase()}</code>
          <CustomColorPicker label="自定义次要文字颜色" value={value.textSecondaryColor} onChange={textSecondaryColor => patch({ textColorMode: "custom", textSecondaryColor })}
            onPreview={textSecondaryColor => onColorPreview(textSecondaryColor === null ? null : { textColorMode: "custom", textSecondaryColor })} />
        </div>}
      <SettingsToggle label="图标跟随文字" help="界面功能图标与文字同色，也可独立调色" checked={value.iconColorMode === "text"}
        onChange={checked => patch({ iconColorMode: checked ? "text" : "custom" })} />
      {value.iconColorMode === "custom" && <div className="typography-color-row"><span>图标颜色</span><code>{value.iconColor.toUpperCase()}</code>
        <CustomColorPicker label="自定义图标颜色" value={value.iconColor} onChange={iconColor => patch({ iconColor })}
          onPreview={iconColor => onColorPreview(iconColor === null ? null : { iconColor })} />
      </div>}

    </SettingsDisclosure>

    <SettingsDisclosure help="跟随主题：使用当前主题的默认文字效果。无壁纸时不额外增强；有壁纸时，页面标题等文字使用随浅深主题切换的轻微阴影。柔光可单独调节颜色与强度。" title="文字增强" summary={effect.label}>
      <div className="typography-effects" role="group" aria-label="文字效果">
        {TEXT_EFFECTS.map(option => <button type="button" className="settings-choice" key={option.value}
          aria-pressed={value.textEffect === option.value}
          onClick={() => patch({ textEffect: option.value,
            ...(option.value === "glow" ? { textEffectColor: "#ffffff" } : {}) })}>{option.label}</button>)}
      </div>
      {hasEffect && <SettingsDisclosure title="效果微调" summary={`${value.textEffectStrength}%`} className="settings-subsection">
        <RangeControl label="效果强度" min={0} max={100} unit="%" value={value.textEffectStrength}
          onChange={textEffectStrength => patch({ textEffectStrength })} />
        <div className="typography-color-row"><span>效果颜色</span><code>{value.textEffectColor.toUpperCase()}</code>
          <CustomColorPicker label="自定义文字效果颜色" value={value.textEffectColor} onChange={textEffectColor => patch({ textEffectColor })}
            onPreview={textEffectColor => onColorPreview(textEffectColor === null ? null : { textEffectColor })} />
        </div>
      </SettingsDisclosure>}

    </SettingsDisclosure>

    <section className="appearance-card" aria-label="文字选择">
      <SettingsToggle label="允许选择展示文字" help="标题、说明可选中复制" checked={value.allowTextSelection}
        onChange={checked => patch({ allowTextSelection: checked })} />
    </section>
    <button type="button" className="text-action appearance-reset" onClick={() => onChange(resetTypography(value))}>
      <ArrowCounterClockwise size={16} />恢复默认字体
    </button>
  </div>;
}
