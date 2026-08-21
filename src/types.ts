export type CategoryIcon =
  | "magnifying-glass"
  | "code"
  | "pen-nib"
  | "play"
  | "book-open"
  | "briefcase"
  | "wrench"
  | "folder"
  | "database"
  | "terminal"
  | "cloud"
  | "chat"
  | "shopping"
  | "game"
  | "music"
  | "image"
  | "calendar"
  | "chart"
  | "robot"
  | "bookmark"
  | "globe"
  | "lightning"
  | "heart"
  | "star";

export interface SiteGroup {
  id: string;
  name: string;
  icon: CategoryIcon;
  isProtected: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type GroupDeletionStrategy = "move-to-other" | "delete-sites";

export type SiteIconSource =
  | "auto"
  | "browser"
  | "google"
  | "root"
  | "duckduckgo"
  | "brand"
  | "custom";

export interface SiteItem {
  id: string;
  name: string;
  url: string;
  groupId: string;
  customIconUrl?: string;
  iconSource?: SiteIconSource;
  order: number;
  globalOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type ThemePreference = "system" | "light" | "dark";

export type LayoutPreset = "compact" | "standard" | "spacious" | "custom";

export type BrandLogoSource = "default" | "local" | "url";

export interface BrandSettings {
  name: string;
  showName: boolean;
  showLogo: boolean;
  logoSource: BrandLogoSource;
  logoUrl?: string;
  logoDataUrl?: string;
}

export interface AppearanceSettings {
  accentColor: string;
  layoutPreset: LayoutPreset;
  fontScale: number;
  brandFontScale: number;
  cardFontScale: number;
  uiIconScale: number;
  controlScale: number;
  controlRadius: number;
  pagePadding: number;
  brandLogoSize: number;
  brandLogoScale: number;
  brandLogoRadius: number;
  brandGap: number;
  topbarHeight: number;
  searchWidth: number;
  searchHeight: number;
  searchRadius: number;
  groupFontScale: number;
  groupTabHeight: number;
  groupIconSize: number;
  groupGap: number;
  cardWidth: number;
  cardHeight: number;
  gap: number;
  contentWidth: number;
  radius: number;
  cardPadding: number;
  siteIconSize: number;
  siteIconScale: number;
}

export type SiteDisplayMode = "flat" | "grouped";

export type WallpaperSource = "none" | "url" | "local";
export type WallpaperFit = "cover" | "contain";
export interface WallpaperSettings {
  source: WallpaperSource;
  url?: string;
  localAssetId?: string;
  fit: WallpaperFit;
  positionX: number;
  positionY: number;
  zoom: number;
  blur: number;
  overlay: number;
  topbarBlurEnabled: boolean;
  topbarBlur: number;
  topbarOpacity: number;
}

export interface SearchHistoryEntry {
  query: string;
  searchedAt: string;
}

export interface SiteCollectionState {
  version: 8;
  groups: SiteGroup[];
  sites: SiteItem[];
  themePreference: ThemePreference;
  brand: BrandSettings;
  appearance: AppearanceSettings;
  wallpaper: WallpaperSettings;
  searchHistory: SearchHistoryEntry[];
  displayMode: SiteDisplayMode;
}

export interface SiteFormValues {
  name: string;
  url: string;
  groupId: string;
  customIconUrl: string;
  iconSource: SiteIconSource;
}
