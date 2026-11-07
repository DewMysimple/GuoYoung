import { FolderSimple, LinkSimple, DotsThree } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import type { WallpaperSettings } from "../types";
import { wallpaperGlassStyle } from "../lib/wallpaper-glass";
import "./glass-material-preview.css";

/** Samples use the same material tokens as real cards, dialogs and popovers. */
export function GlassMaterialPreview({ value, material }: { value: WallpaperSettings; material: "card" | "overlay" }) {
  return <figure className="glass-material-preview" data-material={material}
    style={wallpaperGlassStyle(value) as CSSProperties} aria-label={material === "card" ? "链接与文件夹卡片预览" : "弹窗与菜单预览"}>
    <div className="glass-preview-scene" aria-hidden="true">
      {material === "card" ? <>
        <div className="glass-card-sample"><LinkSimple size={19} /><strong>我的收藏</strong><small>example.com</small></div>
        <div className="glass-card-sample"><FolderSimple size={19} /><strong>灵感文件夹</strong><small>3 个网站</small></div>
      </> : <div className="glass-dialog-sample">
        <strong>管理分组</strong><DotsThree className="glass-preview-dots" size={20} />
        <span className="glass-preview-field">灵感收藏</span>
        <span className="glass-preview-save">保存</span>
        <div className="glass-popover-sample"><span>导入资源</span><span>导出资源</span></div>
      </div>}
    </div>
    <figcaption>{material === "card" ? "链接卡片与文件夹使用同一套卡片参数" : "弹窗与菜单使用独立的浮窗玻璃参数"}</figcaption>
  </figure>;
}
