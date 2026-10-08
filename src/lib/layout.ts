import type { AppearanceSettings } from "../types";

/** Shared limits for persisted values, controls and geometry calculations. */
export const LAYOUT_LIMITS = {
  interfaceScale: { min: 75, max: 150, default: 100 },
  cardColumns: { min: 1, max: 12, default: 6 },
  contentWidth: { min: 960, max: 3840 },
  cardWidth: { min: 132, max: 400 },
  cardHeight: { min: 112, max: 400 },
  gap: { min: 4, max: 32 },
  radius: { min: 4, max: 28 },
} as const;

/** Shared with the card CSS so column fitting includes the actual topline. */
export const CARD_LAYOUT_METRICS = {
  actionSize: 26,
  actionsGap: 2,
  toplineGap: 12,
  actionCount: 3,
  border: 1,
  nameSize: 14,
  openArrowSize: 18,
  domainSize: 12,
  detailSize: 11,
  footerSize: 12,
  textLineHeight: 1.5,
  detailLineHeight: 1.25,
  contentTop: 7,
  contentBottom: 5,
  domainGap: 4,
  detailGap: 5,
  footerGap: 2,
} as const;

const GEOMETRY_KEYS = [
  "controlRadius", "pagePadding", "brandLogoSize", "brandLogoRadius",
  "brandGap", "topbarHeight", "groupNavigationGap", "searchWidth",
  "searchHeight", "searchRadius", "groupTabHeight", "groupIconSize",
  "groupGap", "cardWidth", "cardHeight", "gap", "contentWidth", "radius",
  "cardPadding", "siteIconSize",
] as const satisfies readonly (keyof AppearanceSettings)[];

type ScaledGeometry = Pick<AppearanceSettings, typeof GEOMETRY_KEYS[number]>;

export function appearanceScale(appearance: Pick<AppearanceSettings, "interfaceScale">): number {
  const { min, max, default: fallback } = LAYOUT_LIMITS.interfaceScale;
  const value = appearance.interfaceScale;
  return (typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value)) : fallback) / 100;
}

/** Scale physical lengths once; existing icon/control/text ratios stay separate. */
export function scaledGeometry(appearance: AppearanceSettings): ScaledGeometry {
  const scale = appearanceScale(appearance);
  return Object.fromEntries(GEOMETRY_KEYS.map(key => [key, appearance[key] * scale])) as ScaledGeometry;
}

export function getMinimumCardWidth(appearance: AppearanceSettings): number {
  const scale = appearanceScale(appearance);
  const { actionSize, actionsGap, toplineGap, actionCount, border } = CARD_LAYOUT_METRICS;
  const topline = appearance.siteIconSize + toplineGap +
    actionCount * actionSize * appearance.controlScale / 100 +
    (actionCount - 1) * actionsGap;
  const horizontal = Math.max(LAYOUT_LIMITS.cardWidth.min * scale,
    (topline + 2 * appearance.cardPadding) * scale + 2 * border);
  if (appearance.cardShape !== "square") return horizontal;
  const { nameSize, openArrowSize, domainSize, detailSize, footerSize, textLineHeight, detailLineHeight,
    contentTop, contentBottom, domainGap, detailGap, footerGap } = CARD_LAYOUT_METRICS;
  const fontRatio = (appearance.fontScale / 100) * (appearance.cardFontScale / 100);
  const textHeight = Math.max(nameSize * textLineHeight * fontRatio, openArrowSize) +
    domainSize * textLineHeight * fontRatio + detailSize * detailLineHeight * fontRatio +
    Math.max(footerSize * textLineHeight * fontRatio, appearance.groupIconSize);
  const vertical = (Math.max(appearance.siteIconSize, actionSize * appearance.controlScale / 100) +
    textHeight + contentTop + contentBottom + domainGap + detailGap + footerGap +
    2 * appearance.cardPadding) * scale + 2 * border;
  return Math.max(horizontal, vertical);
}

/** Fonts are base px multiplied by --card-font-scale in CSS. Action lengths and
 * spacing are final physical px; applying another scale would double them.
 */
export function cardLayoutVariables(appearance: AppearanceSettings) {
  const scale = appearanceScale(appearance);
  const metrics = CARD_LAYOUT_METRICS;
  return {
    "--card-action-size": `${metrics.actionSize * appearance.controlScale / 100 * scale}px`,
    "--card-actions-gap": `${metrics.actionsGap * scale}px`,
    "--card-topline-gap": `${metrics.toplineGap * scale}px`,
    "--card-border-width": `${metrics.border}px`,
    "--card-name-size": `${metrics.nameSize}px`,
    "--card-open-arrow-size": `${metrics.openArrowSize * scale}px`,
    "--card-domain-size": `${metrics.domainSize}px`,
    "--card-detail-size": `${metrics.detailSize}px`,
    "--card-footer-size": `${metrics.footerSize}px`,
    "--card-text-line-height": String(metrics.textLineHeight),
    "--card-detail-line-height": String(metrics.detailLineHeight),
    "--card-content-top": `${metrics.contentTop * scale}px`,
    "--card-content-bottom": `${metrics.contentBottom * scale}px`,
    "--card-domain-gap": `${metrics.domainGap * scale}px`,
    "--card-detail-gap": `${metrics.detailGap * scale}px`,
    "--card-footer-gap": `${metrics.footerGap * scale}px`,
  };
}

export interface GridLayout {
  columns: number;
  cardWidth: number;
  cardHeight: number;
  gap: number;
  minCardWidth: number;
}

/** availableWidth is the rendered grid content-box width, in physical CSS px.
 * Content width, page padding and a pushing settings panel are already reflected
 * in that measurement. Stored dimensions must not be scaled before calling.
 */
export function getGridLayout(appearance: AppearanceSettings, availableWidth: number): GridLayout {
  const width = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  const { cardWidth: adaptiveWidth, cardHeight: freeHeight, gap } = scaledGeometry(appearance);
  const safeWidth = getMinimumCardWidth(appearance);
  const minCardWidth = appearance.cardLayout === "columns"
    ? safeWidth : Math.max(adaptiveWidth, safeWidth);
  const fittingRatio = (width + gap) / (minCardWidth + gap);
  // An exact track boundary can divide to 1.9999999999999998 after scaling.
  // Only absorb arithmetic rounding; a genuinely narrower box still loses a track.
  const fittingColumns = Math.max(1, Math.floor(fittingRatio + Number.EPSILON * Math.max(1, fittingRatio) * 4));
  const requestedColumns = Math.round(Math.min(LAYOUT_LIMITS.cardColumns.max,
    Math.max(LAYOUT_LIMITS.cardColumns.min, appearance.cardColumns)));
  const columns = appearance.cardLayout === "columns"
    ? Math.min(requestedColumns, fittingColumns) : fittingColumns;
  const cardWidth = Math.max(0, (width - gap * (columns - 1)) / columns);
  return {
    columns,
    cardWidth,
    cardHeight: appearance.cardShape === "square" ? cardWidth : freeHeight,
    gap,
    minCardWidth,
  };
}
