import type {
  AppearanceSettings,
  BrandSettings,
  LayoutPreset,
  SiteCollectionState,
  SiteGroup,
  SiteItem,
  WallpaperSettings,
} from "../types";

const defaultTimestamp = "2026-01-01T00:00:00.000Z";
export const OTHER_GROUP_ID = "other";

export type LayoutPresetSettings = Pick<
  AppearanceSettings,
  | "fontScale"
  | "cardFontScale"
  | "uiIconScale"
  | "controlScale"
  | "controlRadius"
  | "pagePadding"
  | "topbarHeight"
  | "searchWidth"
  | "searchHeight"
  | "searchRadius"
  | "groupFontScale"
  | "groupTabHeight"
  | "groupIconSize"
  | "groupGap"
  | "cardWidth"
  | "cardHeight"
  | "gap"
  | "contentWidth"
  | "radius"
  | "cardPadding"
  | "siteIconSize"
  | "siteIconScale"
>;

export const LAYOUT_PRESETS: Record<
  Exclude<LayoutPreset, "custom">,
  LayoutPresetSettings
> = {
  compact: {
    fontScale: 95,
    cardFontScale: 95,
    uiIconScale: 95,
    controlScale: 92,
    controlRadius: 10,
    pagePadding: 16,
    topbarHeight: 58,
    searchWidth: 620,
    searchHeight: 48,
    searchRadius: 13,
    groupFontScale: 95,
    groupTabHeight: 34,
    groupIconSize: 15,
    groupGap: 3,
    cardWidth: 140,
    cardHeight: 124,
    gap: 8,
    contentWidth: 1760,
    radius: 12,
    cardPadding: 10,
    siteIconSize: 34,
    siteIconScale: 92,
  },
  standard: {
    fontScale: 100,
    cardFontScale: 100,
    uiIconScale: 100,
    controlScale: 100,
    controlRadius: 12,
    pagePadding: 20,
    topbarHeight: 64,
    searchWidth: 680,
    searchHeight: 52,
    searchRadius: 15,
    groupFontScale: 100,
    groupTabHeight: 38,
    groupIconSize: 16,
    groupGap: 5,
    cardWidth: 160,
    cardHeight: 140,
    gap: 12,
    contentWidth: 1600,
    radius: 16,
    cardPadding: 12,
    siteIconSize: 38,
    siteIconScale: 100,
  },
  spacious: {
    fontScale: 105,
    cardFontScale: 105,
    uiIconScale: 105,
    controlScale: 108,
    controlRadius: 14,
    pagePadding: 28,
    topbarHeight: 72,
    searchWidth: 760,
    searchHeight: 58,
    searchRadius: 18,
    groupFontScale: 105,
    groupTabHeight: 44,
    groupIconSize: 17,
    groupGap: 7,
    cardWidth: 190,
    cardHeight: 168,
    gap: 16,
    contentWidth: 1440,
    radius: 18,
    cardPadding: 15,
    siteIconSize: 42,
    siteIconScale: 104,
  },
};

export const DEFAULT_BRAND: BrandSettings = {
  name: "Mysimple",
  showName: true,
  showLogo: true,
  logoSource: "default",
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  accentColor: "#3367d6",
  layoutPreset: "standard",
  brandFontScale: 100,
  brandLogoSize: 36,
  brandLogoScale: 61,
  brandLogoRadius: 11,
  brandGap: 10,
  ...LAYOUT_PRESETS.standard,
};

export const DEFAULT_WALLPAPER: WallpaperSettings = {
  source: "none",
  fit: "cover",
  positionX: 50,
  positionY: 50,
  zoom: 100,
  blur: 0,
  overlay: 22,
  topbarBlurEnabled: true,
  topbarBlur: 16,
  topbarOpacity: 68,
};

export const DEFAULT_GROUPS: SiteGroup[] = [
  {
    id: "search",
    name: "搜索",
    icon: "magnifying-glass",
    isProtected: false,
    order: 0,
    createdAt: defaultTimestamp,
    updatedAt: defaultTimestamp,
  },
  {
    id: "develop",
    name: "开发",
    icon: "code",
    isProtected: false,
    order: 1,
    createdAt: defaultTimestamp,
    updatedAt: defaultTimestamp,
  },
  {
    id: "design",
    name: "设计",
    icon: "pen-nib",
    isProtected: false,
    order: 2,
    createdAt: defaultTimestamp,
    updatedAt: defaultTimestamp,
  },
  {
    id: "media",
    name: "影音",
    icon: "play",
    isProtected: false,
    order: 3,
    createdAt: defaultTimestamp,
    updatedAt: defaultTimestamp,
  },
  {
    id: "learn",
    name: "学习",
    icon: "book-open",
    isProtected: false,
    order: 4,
    createdAt: defaultTimestamp,
    updatedAt: defaultTimestamp,
  },
  {
    id: OTHER_GROUP_ID,
    name: "其他",
    icon: "folder",
    isProtected: true,
    order: 5,
    createdAt: defaultTimestamp,
    updatedAt: defaultTimestamp,
  },
];

const site = (
  id: string,
  name: string,
  url: string,
  groupId: SiteItem["groupId"],
  order: number,
  globalOrder: number,
): SiteItem => ({
  id,
  name,
  url,
  groupId,
  order,
  globalOrder,
  clickCount: 0,
  createdAt: defaultTimestamp,
  updatedAt: defaultTimestamp,
});

export const DEFAULT_SITES: SiteItem[] = [
  site("google", "Google", "https://www.google.com", "search", 0, 0),
  site("bing", "Bing", "https://www.bing.com", "search", 1, 1),
  site("github", "GitHub", "https://github.com", "develop", 0, 2),
  site(
    "stackoverflow",
    "Stack Overflow",
    "https://stackoverflow.com",
    "develop",
    1,
    3,
  ),
  site("codepen", "CodePen", "https://codepen.io", "develop", 2, 4),
  site("figma", "Figma", "https://www.figma.com", "design", 0, 5),
  site("dribbble", "Dribbble", "https://dribbble.com", "design", 1, 6),
  site("bilibili", "哔哩哔哩", "https://www.bilibili.com", "media", 0, 7),
  site("youtube", "YouTube", "https://www.youtube.com", "media", 1, 8),
  site("douban", "豆瓣", "https://www.douban.com", "media", 2, 9),
  site(
    "mdn",
    "MDN Web Docs",
    "https://developer.mozilla.org",
    "learn",
    0,
    10,
  ),
  site(
    "wikipedia",
    "维基百科",
    "https://zh.wikipedia.org",
    "learn",
    1,
    11,
  ),
];

export function createDefaultState(): SiteCollectionState {
  return {
    version: 10,
    groups: DEFAULT_GROUPS.map((group) => ({ ...group })),
    sites: DEFAULT_SITES.map((item) => ({ ...item })),
    deletedSites: [],
    trashRetentionDays: 30,
    themePreference: "system",
    brand: { ...DEFAULT_BRAND },
    appearance: { ...DEFAULT_APPEARANCE },
    wallpaper: { ...DEFAULT_WALLPAPER },
    searchHistory: [],
    displayMode: "flat",
  };
}
