import { SettingsToggle } from "./settings-toggle";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { DEFAULT_LOGO_EDIT, drawLogo, prepareBrandLogo, type LogoEditOptions } from "../lib/brand-logo";
import { useImageImport } from "../hooks/use-image-import";
import { RangeControl } from "./range-control";
import "./logo-image-editor.css";

export const LOGO_SHAPES = [{ value: "original", label: "原图比例" }, { value: "circle", label: "圆形" }, { value: "square", label: "正方形" }, { value: "rectangle", label: "长方形" }] as const;

export function LogoImageEditor({ source, shape, onCancel, onApply }: {
  source: File | string; shape: LogoEditOptions["shape"];
  onCancel: () => void; onApply: (dataUrl: string, shape: LogoEditOptions["shape"]) => void;
}) {
  const [options, setOptions] = useState({ ...DEFAULT_LOGO_EDIT, shape });
  const [file, setFile] = useState<File>();
  const [decoded, setDecoded] = useState<HTMLImageElement>();
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const operation = useImageImport(true);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    const image = new Image();
    void (async () => {
      const input = typeof source === "string" ? new File([await (await fetch(source)).blob()], "logo.webp", { type: "image/webp" }) : source;
      if (!active) return;
      url = URL.createObjectURL(input);
      image.src = url;
      await image.decode();
      if (active) { setFile(input); setDecoded(image); }
    })().catch(() => { if (active) setError("无法读取图片，请选择 PNG、JPG、WebP 或 SVG 图片。"); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [source]);
  useEffect(() => {
    if (decoded && canvas.current) {
      try { drawLogo(canvas.current, decoded, decoded.naturalWidth, decoded.naturalHeight, options); }
      catch { setError("浏览器无法预览这张图片"); }
    }
  }, [decoded, options]);
  return <Dialog.Root open onOpenChange={open => { if (!open) onCancel(); }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="dialog-content logo-image-editor">
      <div className="dialog-header"><div><Dialog.Title className="dialog-title">调整 Logo 图片</Dialog.Title>
        <Dialog.Description className="dialog-description">先选择外形和取景，再压缩应用。保存设置后才会保留。</Dialog.Description></div>
        <button type="button" className="icon-button" aria-label="关闭 Logo 编辑" onClick={onCancel}><X size={19} /></button></div>
      <div className="logo-editor-preview"><canvas ref={canvas} data-shape={options.shape} aria-label="Logo 裁切预览" /></div>
      <div className="segmented-control" role="group" aria-label="Logo 图片外形">
        {LOGO_SHAPES.map(item => <button key={item.value} type="button" aria-pressed={options.shape === item.value} className={options.shape === item.value ? "active" : ""}
          onClick={() => setOptions(current => ({ ...current, shape: item.value }))}>{item.label}</button>)}
      </div>
      <SettingsToggle label="裁切选定区域" help="关闭时保留整张图片，空余区域透明。" checked={options.crop}
        onChange={checked => setOptions(current => ({ ...current, crop: checked }))} />
      {options.crop && <div className="logo-crop-controls">
        <RangeControl label="裁切缩放" min={100} max={400} value={options.zoom * 100} unit="%" onChange={zoom => setOptions(current => ({ ...current, zoom: zoom / 100 }))} />
        <RangeControl label="裁切水平位置" min={0} max={100} value={options.x} unit="%" onChange={x => setOptions(current => ({ ...current, x }))} />
        <RangeControl label="裁切垂直位置" min={0} max={100} value={options.y} unit="%" onChange={y => setOptions(current => ({ ...current, y }))} />
      </div>}
      <p className="appearance-description">{file ? `原图 ${(file.size / 1024 / 1024).toFixed(2)} MB · ${decoded?.naturalWidth} × ${decoded?.naturalHeight}。` : "正在读取图片…"} 自动转为最长边 512px 的 WebP，结果低于 5MB，满足本地保存限制。</p>
      {(error || operation.error) && <p role="alert" className="field-error">{error || operation.error}</p>}
      <div className="dialog-footer"><button type="button" className="button secondary-button" onClick={onCancel}>取消</button>
        <button type="button" className="button primary-button" disabled={!file || !decoded || Boolean(error) || operation.pending}
          onClick={() => { if (file) void operation.run(() => prepareBrandLogo(file, options), data => onApply(data, options.shape)); }}>{operation.pending ? "正在压缩…" : "压缩并应用"}</button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
