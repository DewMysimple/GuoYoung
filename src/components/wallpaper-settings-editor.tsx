import { useRef, type ChangeEvent } from "react";
import { ArrowsOutCardinal, Crosshair, Image, Trash, UploadSimple } from "@phosphor-icons/react";
import { DEFAULT_WALLPAPER } from "../data/defaults";
import type { WallpaperSettings } from "../types";
import { RangeControl } from "./range-control";
import "./settings-editors.css";

const ATMOSPHERES = [
  { label: "清晰阅读", blur: 0, overlay: 22, topbarOpacity: 68, topbarBlur: 16 },
  { label: "柔和背景", blur: 6, overlay: 38, topbarOpacity: 68, topbarBlur: 20 },
  { label: "突出壁纸", blur: 0, overlay: 0, topbarOpacity: 68, topbarBlur: 16 },
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
          className={Object.entries(patch).every(([key, val]) => value[key as keyof WallpaperSettings] === val) && value.topbarBlurEnabled ? "active" : ""}
          onClick={() => onChange({ ...patch, topbarBlurEnabled: true })}>{label}</button>)}
      </div>
      <RangeControl label="模糊" min={0} max={20} value={value.blur} disabled={!enabled} onChange={(blur) => onChange({ blur })} />
      <RangeControl label="明暗遮罩" min={0} max={80} value={value.overlay} unit="%" disabled={!enabled} onChange={(overlay) => onChange({ overlay })} />
      <details className="wallpaper-material-details">
        <summary>顶栏材质</summary>
        <label className="toggle-row"><span><strong>模糊壁纸</strong><small>柔化顶栏下方的图片细节</small></span>
          <input type="checkbox" checked={value.topbarBlurEnabled} onChange={(event) => onChange({ topbarBlurEnabled: event.target.checked })} />
        </label>
        <RangeControl label="模糊强度" min={0} max={30} value={value.topbarBlur} disabled={!value.topbarBlurEnabled} onChange={(topbarBlur) => onChange({ topbarBlur })} />
        <RangeControl label="背景透明度" min={0} max={100} value={value.topbarOpacity} unit="%" onChange={(topbarOpacity) => onChange({ topbarOpacity })} />
      </details>
    </section>
  </div>;
}
