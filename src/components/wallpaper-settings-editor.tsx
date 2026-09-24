import { useRef, type ChangeEvent } from "react";
import { ArrowsOutCardinal, Crosshair, Image, Trash, UploadSimple } from "@phosphor-icons/react";
import { DEFAULT_WALLPAPER } from "../data/defaults";
import type { WallpaperSettings } from "../types";
import { RangeControl } from "./range-control";
import "./settings-editors.css";

const ATMOSPHERES = [
  { label: "清晰阅读", blur: 0, overlay: 22 },
  { label: "柔和背景", blur: 6, overlay: 38 },
  { label: "突出壁纸", blur: 0, overlay: 0 },
] as const;

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
          onClick={() => onChange({ ...DEFAULT_WALLPAPER })}><Trash size={17} /></button>
      </div>
      <input ref={file} className="visually-hidden" type="file" accept="image/*" onChange={onChoose} aria-label="选择壁纸文件" />
      <label className="settings-field"><span>网络图片地址</span>
        <input type="url" placeholder="https://example.com/wallpaper.jpg" value={value.source === "url" ? value.url ?? "" : ""}
          onChange={(event) => onChange({ source: event.target.value ? "url" : "none", url: event.target.value, localAssetId: undefined })} />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>

    <section className="appearance-card" aria-label="壁纸构图">
      <h3>位置与构图</h3>
      <p className="appearance-description">铺满页面或保留完整图片，再拖动选择合适的位置。</p>
      <div className="segmented-control" role="group" aria-label="填充方式">
        {(["cover", "contain"] as const).map((fit) => <button key={fit} type="button" className={value.fit === fit ? "active" : ""}
          aria-pressed={value.fit === fit} onClick={() => onChange({ fit })}>{fit === "cover" ? "铺满" : "完整显示"}</button>)}
      </div>
      <div className="wallpaper-position-actions">
        <button type="button" className={`button secondary-button ${editing ? "active" : ""}`} disabled={!enabled} onClick={onToggleEditing}>
          <ArrowsOutCardinal size={17} />{editing ? "完成位置调整" : "在页面拖动调整"}
        </button>
        <button type="button" className="icon-button" aria-label="居中复位" title="居中复位" disabled={!enabled}
          onClick={() => onChange({ positionX: 50, positionY: 50, zoom: 100 })}><Crosshair size={17} /></button>
      </div>
      <RangeControl label="缩放" min={50} max={300} value={value.zoom} unit="%" disabled={!enabled} onChange={(zoom) => onChange({ zoom })} />
    </section>

    <section className="appearance-card" aria-label="壁纸与界面协调">
      <h3>阅读与氛围</h3>
      <p className="appearance-description">保留壁纸的层次，通过柔化背景改善阅读。</p>
      <div className="segmented-control" role="group" aria-label="壁纸氛围">
        {ATMOSPHERES.map(({ label, ...patch }) => <button key={label} type="button" disabled={!enabled}
          className={Object.entries(patch).every(([key, val]) => value[key as keyof WallpaperSettings] === val) ? "active" : ""}
          onClick={() => onChange(patch)}>{label}</button>)}
      </div>
      <RangeControl label="模糊" min={0} max={20} value={value.blur} disabled={!enabled} onChange={(blur) => onChange({ blur })} />
      <RangeControl label="明暗遮罩" min={0} max={80} value={value.overlay} unit="%" disabled={!enabled} onChange={(overlay) => onChange({ overlay })} />
    </section>

    <section className="appearance-card" aria-label="玻璃外观">
      <h3>玻璃外观</h3>
      <p className="appearance-description">卡片与按钮一起预览。透明度越高，越能看见壁纸；磨砂越低，折射越清晰。</p>
      {!enabled && <p className="appearance-description">选择壁纸后可在页面预览以下效果。</p>}
      <RangeControl label="玻璃透明度" min={0} max={100} value={value.glassTransparency} unit="%" onChange={(glassTransparency) => onChange({ glassTransparency })} />
      <RangeControl label="玻璃磨砂" min={0} max={30} value={value.glassBlur} onChange={(glassBlur) => onChange({ glassBlur })} />
      <RangeControl label="色彩饱和度" min={100} max={200} value={value.glassSaturation} unit="%" onChange={(glassSaturation) => onChange({ glassSaturation })} />
      <RangeControl label="边缘高光" min={0} max={100} value={value.glassHighlight} unit="%" onChange={(glassHighlight) => onChange({ glassHighlight })} />
      <label className="toggle-row"><span><strong>玻璃折射</strong><small>轻微弯折卡片边缘后的壁纸，文字保持清晰</small></span>
        <input type="checkbox" checked={value.glassRefraction} onChange={(event) => onChange({ glassRefraction: event.target.checked })} />
      </label>
      {value.glassRefraction && <>
        <RangeControl label="折射强度" min={0} max={40} value={value.glassRefractionStrength} onChange={(glassRefractionStrength) => onChange({ glassRefractionStrength })} />
        <p className="appearance-description">Chrome / Edge 支持折射；其他浏览器保留磨砂玻璃。关闭可减少绘制开销。</p>
      </>}
      <button type="button" className="button secondary-button" onClick={() => onChange({
        glassTransparency: DEFAULT_WALLPAPER.glassTransparency, glassBlur: DEFAULT_WALLPAPER.glassBlur,
        glassSaturation: DEFAULT_WALLPAPER.glassSaturation, glassHighlight: DEFAULT_WALLPAPER.glassHighlight,
        glassRefraction: DEFAULT_WALLPAPER.glassRefraction, glassRefractionStrength: DEFAULT_WALLPAPER.glassRefractionStrength,
      })}>恢复玻璃默认</button>
    </section>

    <section className="appearance-card" aria-label="顶栏外观">
      <h3>顶栏外观</h3>
      <p className="appearance-description">融入壁纸让背景连贯，玻璃底板为导航提供独立衬底。</p>
      <div className="segmented-control" role="group" aria-label="顶栏样式">
        {(["clear", "glass"] as const).map((topbarStyle) => <button type="button" key={topbarStyle}
          aria-pressed={value.topbarStyle === topbarStyle} className={value.topbarStyle === topbarStyle ? "active" : ""}
          onClick={() => onChange({ topbarStyle })}>{topbarStyle === "clear" ? "融入壁纸" : "玻璃底板"}</button>)}
      </div>
      {value.topbarStyle === "glass" && <>
        <label className="toggle-row"><span><strong>模糊壁纸</strong><small>柔化顶栏下方的图片细节</small></span>
          <input type="checkbox" checked={value.topbarBlurEnabled} onChange={(event) => onChange({ topbarBlurEnabled: event.target.checked })} />
        </label>
        <RangeControl label="模糊强度" min={0} max={30} value={value.topbarBlur} disabled={!value.topbarBlurEnabled} onChange={(topbarBlur) => onChange({ topbarBlur })} />
        <RangeControl label="顶栏透明度" min={0} max={100} value={100 - value.topbarOpacity} unit="%" onChange={(transparency) => onChange({ topbarOpacity: 100 - transparency })} />
      </>}
    </section>
  </div>;
}
