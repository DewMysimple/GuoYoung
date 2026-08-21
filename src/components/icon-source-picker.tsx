import { useEffect, useMemo, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { getBundledBrandIcon } from "../lib/brand-icons";
import { getFaviconSourceUrl } from "../lib/site-utils";
import type { SiteIconSource, SiteItem } from "../types";
import { Favicon } from "./favicon";

interface IconSourcePickerProps {
  site: Pick<SiteItem, "name" | "url" | "customIconUrl">;
  value: SiteIconSource;
  onChange: (source: SiteIconSource) => void;
}

interface ImageSourceOptionProps {
  label: string;
  source: SiteIconSource;
  url: string;
  selected: boolean;
  onSelect: () => void;
  onUnavailable: () => void;
}

function ImageSourceOption({
  label,
  source,
  url,
  selected,
  onSelect,
  onUnavailable,
}: ImageSourceOptionProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );

  useEffect(() => {
    setStatus("loading");
  }, [url]);

  if (status === "failed") return null;

  if (status === "loading") {
    return (
      <img
        className="icon-source-probe"
        src={url}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        onLoad={() => setStatus("ready")}
        onError={() => {
          setStatus("failed");
          onUnavailable();
        }}
      />
    );
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`使用${label}图标`}
      className={`icon-source-choice ${selected ? "selected" : ""}`}
      data-icon-source={source}
      onClick={onSelect}
    >
      <span className="icon-source-thumb">
        <img
          src={url}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => {
            setStatus("failed");
            onUnavailable();
          }}
        />
      </span>
      <span>{label}</span>
      {selected && (
        <span className="icon-source-check" aria-hidden="true">
          <Check size={11} weight="bold" />
        </span>
      )}
    </button>
  );
}

export function IconSourcePicker({
  site,
  value,
  onChange,
}: IconSourcePickerProps) {
  const brandIcon = useMemo(() => getBundledBrandIcon(site.url), [site.url]);
  const imageOptions = useMemo(
    () => {
      const options: Array<{
        source: Exclude<SiteIconSource, "auto" | "brand">;
        label: string;
        url: string | undefined;
      }> = [
          {
            source: "browser",
            label: "浏览器",
            url: getFaviconSourceUrl(site, "browser"),
          },
          {
            source: "google",
            label: "高清",
            url: getFaviconSourceUrl(site, "google"),
          },
          {
            source: "root",
            label: "网站",
            url: getFaviconSourceUrl(site, "root"),
          },
          {
            source: "duckduckgo",
            label: "镜像",
            url: getFaviconSourceUrl(site, "duckduckgo"),
          },
          {
            source: "custom",
            label: "自定义",
            url: getFaviconSourceUrl(site, "custom"),
          },
        ];
      return options.filter(
        (option): option is {
          source: Exclude<SiteIconSource, "auto" | "brand">;
          label: string;
          url: string;
        } => Boolean(option.url),
      );
    },
    [site],
  );

  return (
    <div
      className="icon-source-grid"
      role="radiogroup"
      aria-label="图标来源"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === "auto"}
        aria-label="使用自动图标"
        className={`icon-source-choice ${value === "auto" ? "selected" : ""}`}
        data-icon-source="auto"
        onClick={() => onChange("auto")}
      >
        <Favicon site={{ ...site, iconSource: "auto" }} />
        <span>自动</span>
        {value === "auto" && (
          <span className="icon-source-check" aria-hidden="true">
            <Check size={11} weight="bold" />
          </span>
        )}
      </button>

      {imageOptions.map((option) => (
        <ImageSourceOption
          key={`${option.source}-${option.url}`}
          label={option.label}
          source={option.source}
          url={option.url}
          selected={value === option.source}
          onSelect={() => onChange(option.source)}
          onUnavailable={() => {
            if (value === option.source) onChange("auto");
          }}
        />
      ))}

      {brandIcon && (
        <button
          type="button"
          role="radio"
          aria-checked={value === "brand"}
          aria-label="使用品牌图标"
          className={`icon-source-choice ${
            value === "brand" ? "selected" : ""
          }`}
          data-icon-source="brand"
          onClick={() => onChange("brand")}
        >
          <span className="icon-source-thumb icon-source-brand">
            <svg viewBox="0 0 24 24" role="presentation">
              <path d={brandIcon.path} fill={`#${brandIcon.hex}`} />
            </svg>
          </span>
          <span>品牌</span>
          {value === "brand" && (
            <span className="icon-source-check" aria-hidden="true">
              <Check size={11} weight="bold" />
            </span>
          )}
        </button>
      )}
    </div>
  );
}
