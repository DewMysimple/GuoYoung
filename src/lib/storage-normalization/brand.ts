import { DEFAULT_BRAND } from "../../data/defaults";
import type { BrandLogoSource, BrandSettings } from "../../types";
import { isBrandLogoDataUrl, isHttpImageUrl } from "../brand-logo";

const brandLogoSources: BrandLogoSource[] = ["default", "local", "url"];

export function normalizeBrand(value: unknown): BrandSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<BrandSettings>)
      : {};
  const name =
    typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name.trim().slice(0, 32)
      : DEFAULT_BRAND.name;
  const requestedSource = brandLogoSources.includes(
    candidate.logoSource as BrandLogoSource,
  )
    ? (candidate.logoSource as BrandLogoSource)
    : DEFAULT_BRAND.logoSource;
  const logoSource =
    requestedSource === "local" && !isBrandLogoDataUrl(candidate.logoDataUrl)
      ? "default"
      : requestedSource === "url" && !isHttpImageUrl(candidate.logoUrl)
        ? "default"
        : requestedSource;
  return {
    name,
    tabTitle: typeof candidate.tabTitle === "string" ? candidate.tabTitle.trim().slice(0, 80) : "",
    logoShape: candidate.logoShape === "circle" || candidate.logoShape === "square" || candidate.logoShape === "rectangle" ? candidate.logoShape : "original",
    showName:
      typeof candidate.showName === "boolean"
        ? candidate.showName
        : DEFAULT_BRAND.showName,
    showLogo:
      typeof candidate.showLogo === "boolean"
        ? candidate.showLogo
        : DEFAULT_BRAND.showLogo,
    logoSource,
    ...(logoSource === "url" && isHttpImageUrl(candidate.logoUrl)
      ? { logoUrl: candidate.logoUrl }
      : {}),
    ...(logoSource === "local" && isBrandLogoDataUrl(candidate.logoDataUrl)
      ? { logoDataUrl: candidate.logoDataUrl }
      : {}),
  };
}
