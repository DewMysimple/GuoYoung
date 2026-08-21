import { useEffect, useState } from "react";
import { SquaresFour } from "@phosphor-icons/react";
import type { BrandSettings } from "../types";

interface BrandMarkProps {
  brand: BrandSettings;
  preview?: boolean;
  onImageError?: () => void;
}

export function getBrandLogoUrl(brand: BrandSettings): string | undefined {
  return brand.logoSource === "local"
    ? brand.logoDataUrl
    : brand.logoSource === "url"
      ? brand.logoUrl
      : undefined;
}

export function BrandMark({ brand, preview = false, onImageError }: BrandMarkProps) {
  const source = getBrandLogoUrl(brand);
  const [failedSource, setFailedSource] = useState<string>();
  const failed = Boolean(source && failedSource === source);

  useEffect(() => {
    if (failedSource !== source) setFailedSource(undefined);
  }, [failedSource, source]);

  if (!source || failed) {
    return (
      <span className={`brand-mark${preview ? " brand-mark-preview" : ""}`}>
        <SquaresFour weight="fill" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      className={`brand-mark brand-mark-custom${
        preview ? " brand-mark-preview" : ""
      }`}
    >
      <img
        src={source}
        alt=""
        onError={() => {
          setFailedSource(source);
          onImageError?.();
        }}
      />
    </span>
  );
}
