import type { CSSProperties } from "react";
import type { WallpaperGlassSettings, WallpaperSettings } from "../types";
import { applyWallpaperPreset, getWallpaperPreset, saveCustomWallpaperPreset, WALLPAPER_PRESETS } from "../lib/wallpaper-presets";
import { SettingsDisclosure } from "./settings-disclosure";
import { SettingsToggle } from "./settings-toggle";

function PresetSample({ value }: { value: WallpaperGlassSettings | null }) {
  return <span className="glass-preset-sample" aria-hidden="true" style={value ? {
    "--preset-blur": `${value.glassBlur / 3}px`,
    "--preset-fill": `${(100 - value.glassTransparency) / 100}`,
    "--preset-edge": `${value.glassHighlight / 100}`,
  } as CSSProperties : undefined}><i /></span>;
}

export function WallpaperPresets({ value, onChange }: {
  value: WallpaperSettings;
  onChange: (patch: Partial<WallpaperSettings>) => void;
}) {
  const selected = getWallpaperPreset(value);
  return <SettingsDisclosure title="外观预设" summary={selected?.label ?? "已自定义"} className="wallpaper-presets"
    help="四套内置预设、两个自定义槽位。选择即刻预览；保存当前参数会记录公共玻璃、顶栏和侧栏，随页面底部“保存设置”一起保存。参数请在下方各外观分组调节。">
    <SettingsToggle label="预设同时应用顶栏和侧栏" checked={value.presetIncludesPanels}
      onChange={presetIncludesPanels => onChange({ presetIncludesPanels })} />
    <p className="appearance-description preset-scope-help">关闭时保留顶栏和侧栏设置；处于“跟随公共”的部分仍会随公共玻璃变化。</p>
    <div className="glass-preset-grid" role="group" aria-label="外观预设">
      {WALLPAPER_PRESETS.map(preset => <button type="button" className="glass-preset" key={preset.id}
        data-preset={preset.id} aria-pressed={selected?.id === preset.id}
        onClick={() => onChange(applyWallpaperPreset(value, preset.values))}>
        <PresetSample value={preset.values} /><strong>{preset.label}</strong><small>{preset.description}</small>
      </button>)}
      {([0, 1] as const).map(slot => {
        const saved = value.customPresets[slot];
        const label = `自定义 ${slot + 1}`;
        return <div className="custom-preset" key={slot}>
          <button type="button" className="glass-preset" data-preset={`custom-${slot + 1}`}
            disabled={!saved} aria-pressed={selected?.id === `custom-${slot + 1}`}
            onClick={() => saved && onChange(applyWallpaperPreset(value, saved))}>
            <PresetSample value={saved} /><strong>{label}</strong><small>{saved ? "已保存 · 点击应用" : "尚未保存"}</small>
          </button>
          <button type="button" className="custom-preset-save" aria-label={`${saved ? "覆盖" : "保存当前到"}${label}`}
            onClick={() => onChange({ customPresets: saveCustomWallpaperPreset(value, slot) })}>
            {saved ? "覆盖当前参数" : "保存当前参数"}
          </button>
        </div>;
      })}
    </div>
  </SettingsDisclosure>;
}
