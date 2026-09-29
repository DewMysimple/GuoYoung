import { HelpTip } from "./help-tip";
import { useEffect, useId, useRef, type ChangeEvent } from "react";
import { useSettingsDisclosure } from "./settings-location";
import { ArrowCounterClockwise, CaretDown, UploadSimple } from "@phosphor-icons/react";
import type { BrandSettings } from "../types";
import { BrandMark } from "./brand-mark";
import { LOGO_SHAPES } from "./logo-image-editor";

interface BrandSettingsEditorProps {
  value: BrandSettings;
  error: string;
  onChange: (patch: Partial<BrandSettings>) => void;
  onChooseLogo: (event: ChangeEvent<HTMLInputElement>) => void;
  onError: (message: string) => void;
  onReset: () => void;
  onEditLogo: () => void;
}

export function BrandSettingsEditor({
  value, error, onChange, onChooseLogo, onError, onReset, onEditLogo,
}: BrandSettingsEditorProps) {
  const [expanded, setExpanded] = useSettingsDisclosure("名称与图标");
  const logoFileRef = useRef<HTMLInputElement>(null);
  const contentId = useId();
  const isExpanded = expanded || Boolean(error);
  // Keep the editor open after the user corrects an error revealed by Save.
  useEffect(() => { if (error) setExpanded(true); }, [error]);

  return (
    <section className="appearance-card brand-settings-card" aria-label="名称与图标">
      <button type="button" className="appearance-disclosure brand-settings-summary"
        aria-label="名称与图标" aria-expanded={isExpanded} aria-controls={contentId}
        onClick={() => setExpanded((open) => !open)}>
        <BrandMark brand={value} preview
          onImageError={() => onError("这张网络 Logo 暂时无法加载，已回退默认图标")} />
        <span><strong>名称与图标</strong><small>{value.name.trim() || "Mysimple"}</small></span>
        <CaretDown size={16} aria-hidden="true" />
      </button>
      {isExpanded && (
        <div className="brand-settings-fields" id={contentId}>
          <label className="settings-field">
            <span>品牌名称</span>
            <input
              type="text"
              aria-label="品牌名称"
              maxLength={32}
              value={value.name}
              placeholder="Mysimple"
              onChange={(event) =>
                onChange({ name: event.target.value.slice(0, 32) })
              }
            />
            <small>{value.name.length}/32</small>
          </label>

          <div className="brand-visibility-options">
            <div className="settings-field">
              <span><label htmlFor={`${contentId}-tab-title`}>标签页名称</label><HelpTip label="标签页标题说明">完整自定义浏览器标签页标题，不追加固定后缀。</HelpTip></span>
              <input id={`${contentId}-tab-title`} aria-label="标签页名称" value={value.tabTitle ?? ""} maxLength={80} placeholder="留空时使用品牌名称"
                onChange={event => onChange({ tabTitle: event.target.value })} />
            </div>
            <label className="toggle-row compact-toggle-row">
              <span><strong>显示 Logo</strong></span>
              <input
                type="checkbox"
                checked={value.showLogo}
                onChange={(event) =>
                  onChange({ showLogo: event.target.checked })
                }
              />
            </label>
            <label className="toggle-row compact-toggle-row">
              <span><strong>显示品牌名称</strong></span>
              <input
                type="checkbox"
                checked={value.showName}
                onChange={(event) =>
                  onChange({ showName: event.target.checked })
                }
              />
            </label>
          </div>

          <div className="brand-source-block">
            <span className="settings-inline-label">Logo 来源</span>
            <div className="brand-source-options" role="radiogroup" aria-label="Logo 来源">
              <button
                type="button"
                role="radio"
                aria-checked={value.logoSource === "default"}
                className={value.logoSource === "default" ? "active" : ""}
                onClick={() =>
                  onChange({
                    logoSource: "default",
                    logoUrl: undefined,
                    logoDataUrl: undefined,
                  })
                }
              >
                默认方格
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={value.logoSource === "local"}
                className={value.logoSource === "local" ? "active" : ""}
                onClick={() =>
                  value.logoDataUrl
                    ? onChange({ logoSource: "local", logoUrl: undefined })
                    : logoFileRef.current?.click()
                }
              >
                本地图片
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={value.logoSource === "url"}
                className={value.logoSource === "url" ? "active" : ""}
                onClick={() =>
                  onChange({ logoSource: "url", logoDataUrl: undefined })
                }
              >
                网络地址
              </button>
            </div>
          </div>

          <input
            ref={logoFileRef}
            className="visually-hidden"
            type="file"
            aria-label="选择 Logo 图片"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={onChooseLogo}
          />
          {value.logoSource === "local" && (
            <button
              type="button"
              className="button secondary-button brand-replace-button"
              onClick={() => logoFileRef.current?.click()}
            >
              <UploadSimple size={17} />更换本地 Logo
            </button>
          )}
          {value.logoSource === "url" && (
            <label className="settings-field">
              <span>网络 Logo 地址</span>
              <input
                type="url"
                aria-label="网络 Logo 地址"
                placeholder="https://example.com/logo.png"
                value={value.logoUrl ?? ""}
                onChange={(event) =>
                  onChange({ logoUrl: event.target.value })
                }
              />
            </label>
          )}
          {value.logoSource !== "default" && <>
            <span className="settings-inline-label">Logo 外形</span>
            <div className="segmented-control" role="group" aria-label="Logo 外形">
              {LOGO_SHAPES.map(item => <button key={item.value} type="button" aria-pressed={(value.logoShape ?? "original") === item.value}
                className={(value.logoShape ?? "original") === item.value ? "active" : ""}
                onClick={() => onChange({ logoShape: item.value })}>{item.label}</button>)}
            </div>
            {value.logoSource === "local" && <button type="button" className="button secondary-button" onClick={onEditLogo}>裁切与压缩图片</button>}
            {value.logoSource === "local" && value.logoDataUrl && <small className="appearance-description">已压缩为 WebP · 约 {Math.ceil((value.logoDataUrl.length - value.logoDataUrl.indexOf(",") - 1) * 3 / 4 / 1024)} KB，低于 5MB 限制。</small>}
          </>}
          {error && (
            <p className="field-error" role="alert">{error}</p>
          )}
          <button
            type="button"
            className="text-action brand-reset-action"
            onClick={onReset}
          >
            <ArrowCounterClockwise size={16} />恢复默认品牌
          </button>
        </div>
      )}
    </section>
  );
}
