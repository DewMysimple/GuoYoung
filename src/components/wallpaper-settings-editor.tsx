import { PanelGlassSettings } from "./panel-glass-settings";
import { useRef, type ChangeEvent } from "react";
import { ArrowsOutCardinal, Crosshair, Image, Trash, UploadSimple } from "@phosphor-icons/react";
import { DEFAULT_WALLPAPER } from "../data/defaults";
import type { WallpaperSettings } from "../types";
import { RangeControl } from "./range-control";
import { SettingsDisclosure } from "./settings-disclosure";
import { pickGlass } from "../lib/wallpaper-presets";
import { WallpaperPresets } from "./wallpaper-presets";
import { SettingsChoiceGroup, SettingsOption } from "./settings-options";
import "./settings-editors.css";

const BASIC_DEFAULTS = {
  fit: DEFAULT_WALLPAPER.fit,
  positionX: DEFAULT_WALLPAPER.positionX,
  positionY: DEFAULT_WALLPAPER.positionY,
  zoom: DEFAULT_WALLPAPER.zoom,
  blur: DEFAULT_WALLPAPER.blur,
  overlay: DEFAULT_WALLPAPER.overlay,
};

export function WallpaperSettingsEditor({ value, imageUrl, error, processing, editing, onChange, onChoose, onToggleEditing }: {
  value: WallpaperSettings;
  imageUrl?: string;
  error?: string;
  processing: boolean;
  editing: boolean;
  onChange: (patch: Partial<WallpaperSettings>) => void;
  onChoose: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleEditing: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const enabled = value.source !== "none";
  return <div className="settings-section wallpaper-settings">
    <section className="appearance-card wallpaper-source-card" aria-label="壁纸来源">
      <div className="wallpaper-thumbnail">
        {imageUrl ? <img src={imageUrl} alt="当前壁纸预览" /> : <Image size={32} />}
        <span>{processing ? "正在优化图片…" : enabled ? "当前壁纸" : "让收藏有自己的背景"}</span>
      </div>
      <div className="wallpaper-source-actions">
        <button type="button" className="button primary-button" onClick={() => file.current?.click()} disabled={processing}>
          <UploadSimple size={17} />{processing ? "正在优化…" : "选择本地图片"}
        </button>
        <button type="button" className="icon-button" aria-label="清除壁纸" title="清除壁纸" disabled={!enabled}
          onClick={() => onChange({ ...DEFAULT_WALLPAPER, presetIncludesPanels: value.presetIncludesPanels,
            customPresets: value.customPresets })}><Trash size={17} /></button>
      </div>
      <input ref={file} className="visually-hidden" type="file" accept="image/*" onChange={onChoose} aria-label="选择壁纸文件" />
      <label className="settings-field"><span>网络图片地址</span>
        <input type="url" placeholder="https://example.com/wallpaper.jpg" value={value.source === "url" ? value.url ?? "" : ""}
          onChange={(event) => onChange({ source: event.target.value ? "url" : "none", url: event.target.value, localAssetId: undefined })} />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>

    <WallpaperPresets value={value} onChange={onChange} />

    <SettingsDisclosure title="基础设置" summary="构图与画面效果" className="wallpaper-basic-settings"
      help="选择显示方式，再拖动和缩放调整构图。模糊与明暗遮罩默认关闭，可按需增加；恢复默认只重置本组参数。">
      <div className="wallpaper-basic-row">
        <span>显示方式</span>
        <SettingsChoiceGroup label="填充方式" className="segmented-control" value={value.fit}
          options={[{ value: "cover", label: "铺满" }, { value: "contain", label: "完整显示" }]}
          disabled={!enabled} onChange={fit => onChange({ fit })} />
      </div>
      <div className="wallpaper-basic-row">
        <span>画面位置</span>
        <div className="wallpaper-position-actions">
          <SettingsOption disabled={!enabled} selected={editing} onClick={onToggleEditing}>
            <ArrowsOutCardinal size={17} />{editing ? "完成调整" : "拖动调整"}
          </SettingsOption>
          <button type="button" className="icon-button" aria-label="居中复位" title="居中复位" disabled={!enabled}
            onClick={() => onChange({ positionX: DEFAULT_WALLPAPER.positionX, positionY: DEFAULT_WALLPAPER.positionY, zoom: DEFAULT_WALLPAPER.zoom })}><Crosshair size={17} /></button>
        </div>
      </div>
      <RangeControl label="缩放" min={50} max={300} value={value.zoom} unit="%" disabled={!enabled} onChange={(zoom) => onChange({ zoom })} />
      <div className="wallpaper-image-effects" role="group" aria-label="画面效果">
        <RangeControl label="模糊" min={0} max={20} value={value.blur} disabled={!enabled} onChange={(blur) => onChange({ blur })} />
        <RangeControl label="明暗遮罩" min={0} max={80} value={value.overlay} unit="%" disabled={!enabled} onChange={(overlay) => onChange({ overlay })} />
      </div>
      <button type="button" className="button secondary-button wallpaper-basic-reset" disabled={!enabled}
        onClick={() => onChange(BASIC_DEFAULTS)}>恢复基础默认</button>
    </SettingsDisclosure>

    <SettingsDisclosure help="公共玻璃用于卡片、按钮、面板和菜单；顶栏或侧栏选择“跟随公共”时也使用这里的材质。透明度越高，越能看见壁纸；阴影设为 0 可关闭投影。" title="玻璃外观" summary="透明度、磨砂与高光">

      {!enabled && <p className="appearance-description">选择壁纸后可在页面预览以下效果。</p>}
      <RangeControl label="玻璃透明度" min={0} max={100} value={value.glassTransparency} unit="%" onChange={(glassTransparency) => onChange({ glassTransparency })} />
      <RangeControl label="按钮透明度" min={0} max={100} value={value.glassControlTransparency} unit="%" onChange={(glassControlTransparency) => onChange({ glassControlTransparency })} />
      <RangeControl label="面板透明度" min={0} max={100} value={value.glassPanelTransparency} unit="%" onChange={(glassPanelTransparency) => onChange({ glassPanelTransparency })} />
      <RangeControl label="菜单透明度" min={0} max={100} value={value.glassPopoverTransparency} unit="%" onChange={(glassPopoverTransparency) => onChange({ glassPopoverTransparency })} />
      <RangeControl label="阴影强度" min={0} max={100} value={value.glassShadow} unit="%" onChange={(glassShadow) => onChange({ glassShadow })} />
      <RangeControl label="玻璃磨砂" min={0} max={30} value={value.glassBlur} onChange={(glassBlur) => onChange({ glassBlur })} />
      <RangeControl label="色彩饱和度" min={100} max={200} value={value.glassSaturation} unit="%" onChange={(glassSaturation) => onChange({ glassSaturation })} />
      <RangeControl label="边缘高光" min={0} max={100} value={value.glassHighlight} unit="%" onChange={(glassHighlight) => onChange({ glassHighlight })} />
      <button type="button" className="button secondary-button" onClick={() => onChange(pickGlass(DEFAULT_WALLPAPER))}>恢复玻璃默认</button>
    </SettingsDisclosure>

    <PanelGlassSettings label="顶栏" style={value.topbarStyle}
      transparency={value.topbarTransparency} blur={value.topbarBlur}
      onStyle={topbarStyle => onChange({ topbarStyle })}
      onTransparency={topbarTransparency => onChange({ topbarTransparency })}
      onBlur={topbarBlur => onChange({ topbarBlur })} />
    <PanelGlassSettings label="侧栏" style={value.sidebarStyle}
      transparency={value.sidebarTransparency} blur={value.sidebarBlur}
      onStyle={sidebarStyle => onChange({ sidebarStyle })}
      onTransparency={sidebarTransparency => onChange({ sidebarTransparency })}
      onBlur={sidebarBlur => onChange({ sidebarBlur })} />
  </div>;
}
