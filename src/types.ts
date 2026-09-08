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
  | "star"
  | "house"
  | "lightbulb"
  | "palette"
  | "paint-brush"
  | "camera"
  | "film-strip"
  | "headphones"
  | "newspaper"
  | "graduation-cap"
  | "brain"
  | "atom"
  | "test-tube"
  | "rocket-launch"
  | "kanban"
  | "list-checks"
  | "chart-line-up"
  | "stack"
  | "map-pin"
  | "currency-cny"
  | "shield-check"
  | "user-circle"
  | "microphone"
  | "package"
  | "flask";

export type SiteWorkspace = "main" | "github";

export type SiteSortMode =
  | "manual"
  | "name-asc"
  | "name-desc"
  | "newest"
  | "oldest"
  | "heat";

export type WorkspaceSortModes = Record<SiteWorkspace, SiteSortMode>;

export interface SiteGroup {
  id: string;
  name: string;
  icon: CategoryIcon;
  isProtected: boolean;
  workspace: SiteWorkspace;
  order: number;
  createdAt: string;
  updatedAt: string;
  githubImportSource?: GithubImportSource;
}

export interface GithubImportSource {
  login: string;
  profileUrl: string;
  entityType: "user" | "organization";
  lastFetchedAt?: string;
}

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
  clickCount: number;
  createdAt: string;
  updatedAt: string;
}

export type TrashRetentionDays = 7 | 30 | 90 | null;

export interface TrashedSite {
  site: SiteItem;
  deletedAt: string;
  originalGroupId: string;
  originalGroupName: string;
  originalWorkspace?: SiteWorkspace;
}

export interface GithubMigrationEntry {
  siteId: string;
  originalName: string;
  originalUrl: string;
  fromGroupId: string;
  fromGroupName: string;
  fromOrder: number;
  fromGlobalOrder: number;
  targetGroupId: string;
}

export interface GithubMigrationRecord {
  status: "completed" | "undone";
  completedAt: string;
  undoneAt?: string;
  entries: GithubMigrationEntry[];
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

export type WorkspaceDisplayModes = Record<SiteWorkspace, SiteDisplayMode>;

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
  version: number;
  groups: SiteGroup[];
  sites: SiteItem[];
  deletedSites: TrashedSite[];
  trashRetentionDays: TrashRetentionDays;
  themePreference: ThemePreference;
  brand: BrandSettings;
  appearance: AppearanceSettings;
  wallpaper: WallpaperSettings;
  searchHistory: SearchHistoryEntry[];
  displayMode: SiteDisplayMode;
  displayModeByWorkspace: WorkspaceDisplayModes;
  sortMode: SiteSortMode;
  sortModeByWorkspace: WorkspaceSortModes;
  githubMigration?: GithubMigrationRecord | null;
}

export interface SiteFormValues {
  name: string;
  url: string;
  groupId: string;
  customIconUrl: string;
  iconSource: SiteIconSource;
}
