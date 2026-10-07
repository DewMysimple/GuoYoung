import { PanelGlassControls } from "./panel-glass-controls";
import { SettingsToggle } from "./settings-toggle";
import { useRef, type ChangeEvent } from "react";
import { ArrowsOutCardinal, Crosshair, Image, Trash, UploadSimple } from "@phosphor-icons/react";
import { DEFAULT_WALLPAPER } from "../data/defaults";
import type { WallpaperSettings } from "../types";
import { RangeControl } from "./range-control";
import { SettingsDisclosure } from "./settings-disclosure";
import { GLASS_PRESETS, getGlassPreset, pickGlass } from "../lib/glass-presets";
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
  const preset = getGlassPreset(value);
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
          onClick={() => onChange({ ...DEFAULT_WALLPAPER })}><Trash size={17} /></button>
      </div>
      <input ref={file} className="visually-hidden" type="file" accept="image/*" onChange={onChoose} aria-label="选择壁纸文件" />
      <label className="settings-field"><span>网络图片地址</span>
        <input type="url" placeholder="https://example.com/wallpaper.jpg" value={value.source === "url" ? value.url ?? "" : ""}
          onChange={(event) => onChange({ source: event.target.value ? "url" : "none", url: event.target.value, localAssetId: undefined })} />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>

    <SettingsDisclosure title="基础设置" summary="构图与画面效果" className="wallpaper-basic-settings"
      help="选择显示方式，再拖动和缩放调整构图。模糊与明暗遮罩默认关闭，可按需增加；恢复默认只重置本组参数。">
      <div className="wallpaper-basic-row">
        <span>显示方式</span>
        <div className="segmented-control" role="group" aria-label="填充方式">
          {(["cover", "contain"] as const).map((fit) => <button key={fit} type="button" disabled={!enabled}
            className={value.fit === fit ? "active" : ""} aria-pressed={value.fit === fit}
            onClick={() => onChange({ fit })}>{fit === "cover" ? "铺满" : "完整显示"}</button>)}
        </div>
      </div>
      <div className="wallpaper-basic-row">
        <span>画面位置</span>
        <div className="wallpaper-position-actions">
          <button type="button" className={`button secondary-button ${editing ? "active" : ""}`} disabled={!enabled}
            aria-pressed={editing} onClick={onToggleEditing}>
            <ArrowsOutCardinal size={17} />{editing ? "完成调整" : "拖动调整"}
          </button>
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

    <SettingsDisclosure help="九套预设默认使用轻量玻璃；可在微调中开启折射。选择即刻预览，保存后生效。" title="玻璃外观" summary={preset?.label ?? "已自定义"}>
      <div className="glass-preset-grid" role="group" aria-label="玻璃外观预设">
        {GLASS_PRESETS.map(option => <button type="button" className="glass-preset" key={option.id}
          data-preset={option.id} aria-pressed={preset?.id === option.id} onClick={() => onChange(option.values)}>
          <span className="glass-preset-sample" aria-hidden="true"><i /></span>
          <strong>{option.label}</strong><small>{option.description}</small>
        </button>)}
      </div>
      <SettingsDisclosure title="玻璃参数微调" summary="透明度、高光与折射" className="glass-fine-tuning" help="透明度越高，越能看见壁纸。卡片、按钮、面板和菜单可分别调整，阴影设为 0 可关闭投影。">

      {!enabled && <p className="appearance-description">选择壁纸后可在页面预览以下效果。</p>}
      <RangeControl label="玻璃透明度" min={0} max={100} value={value.glassTransparency} unit="%" onChange={(glassTransparency) => onChange({ glassTransparency })} />
      <RangeControl label="按钮透明度" min={0} max={100} value={value.glassControlTransparency} unit="%" onChange={(glassControlTransparency) => onChange({ glassControlTransparency })} />
      <RangeControl label="面板透明度" min={0} max={100} value={value.glassPanelTransparency} unit="%" onChange={(glassPanelTransparency) => onChange({ glassPanelTransparency })} />
      <RangeControl label="菜单透明度" min={0} max={100} value={value.glassPopoverTransparency} unit="%" onChange={(glassPopoverTransparency) => onChange({ glassPopoverTransparency })} />
      <RangeControl label="阴影强度" min={0} max={100} value={value.glassShadow} unit="%" onChange={(glassShadow) => onChange({ glassShadow })} />
      <RangeControl label="玻璃磨砂" min={0} max={30} value={value.glassBlur} onChange={(glassBlur) => onChange({ glassBlur })} />
      <RangeControl label="色彩饱和度" min={100} max={200} value={value.glassSaturation} unit="%" onChange={(glassSaturation) => onChange({ glassSaturation })} />
      <RangeControl label="边缘高光" min={0} max={100} value={value.glassHighlight} unit="%" onChange={(glassHighlight) => onChange({ glassHighlight })} />
      <SettingsToggle label="玻璃折射" help="弯折边缘后的壁纸；收藏较多时会增加绘制开销。Chrome / Edge 支持折射，其他浏览器保留磨砂玻璃。" checked={value.glassRefraction}
        onChange={checked => onChange({ glassRefraction: checked })} />
      {value.glassRefraction && <>
        <RangeControl label="折射强度" min={0} max={40} value={value.glassRefractionStrength} onChange={(glassRefractionStrength) => onChange({ glassRefractionStrength })} />
      </>}
      <button type="button" className="button secondary-button" onClick={() => onChange(pickGlass(DEFAULT_WALLPAPER))}>恢复玻璃默认</button>
      </SettingsDisclosure>
    </SettingsDisclosure>

    <SettingsDisclosure title="顶栏外观" summary="独立调节" help="直接调节顶栏透明度和模糊强度；透明度 100%、模糊强度 0 时完全透出壁纸。">
      <PanelGlassControls label="顶栏"
        transparency={100 - value.topbarOpacity} blur={value.topbarBlur}
        onTransparency={transparency => onChange({ topbarOpacity: 100 - transparency })}
        onBlur={topbarBlur => onChange({ topbarBlur })} />

    </SettingsDisclosure>
    <SettingsDisclosure title="侧栏外观" summary={value.sidebarStyle === "shared" ? "跟随公共" : "独立玻璃底板"}
      help="默认跟随公共面板玻璃，也可独立调节透明度和模糊强度。透明度 100%、模糊强度 0 时完全透出壁纸。保存后保留，取消恢复原设置。">
      <div className="segmented-control" role="group" aria-label="侧栏样式">
        {(["shared", "glass"] as const).map(sidebarStyle => <button type="button" key={sidebarStyle}
          aria-pressed={value.sidebarStyle === sidebarStyle} className={value.sidebarStyle === sidebarStyle ? "active" : ""}
          onClick={() => onChange({ sidebarStyle })}>{sidebarStyle === "shared" ? "跟随公共" : "独立玻璃底板"}</button>)}
      </div>
      {value.sidebarStyle === "glass" && <PanelGlassControls label="侧栏"
        transparency={value.sidebarTransparency} blur={value.sidebarBlur}
        onTransparency={sidebarTransparency => onChange({ sidebarTransparency })}
        onBlur={sidebarBlur => onChange({ sidebarBlur })} />}
    </SettingsDisclosure>
  </div>;
}
