import {
  createDefaultState,
  DEFAULT_APPEARANCE,
  DEFAULT_BRAND,
  DEFAULT_GITHUB_GROUPS,
  DEFAULT_GROUPS,
  DEFAULT_WALLPAPER,
  GITHUB_OTHER_GROUP_ID,
  OTHER_GROUP_ID,
} from "../data/defaults";
import { GROUP_ICON_OPTIONS } from "../data/group-icons";
import type {
  AppearanceSettings,
  BrandLogoSource,
  BrandSettings,
  CategoryIcon,
  GithubImportSource,
  GithubMigrationRecord,
  LayoutPreset,
  SearchHistoryEntry,
  SiteCollectionState,
  SiteGroup,
  SiteIconSource,
  SiteDisplayMode,
  SiteItem,
  SiteSortMode,
  SiteWorkspace,
  ThemePreference,
  TrashedSite,
  TrashRetentionDays,
  WallpaperFit,
  WallpaperSettings,
  WallpaperSource,
} from "../types";
import { isBrandLogoDataUrl, isHttpImageUrl } from "./brand-logo";
import { reindexSites } from "./site-utils";
import { purgeExpiredTrashFromState } from "./site-state";
import { ensureGithubWorkspace, getGroupWorkspace } from "./github-workspace";

export const STORAGE_KEY = "site-hub:v1";

const themePreferences: ThemePreference[] = ["system", "light", "dark"];
const layoutPresets: LayoutPreset[] = [
  "compact",
  "standard",
  "spacious",
  "custom",
];
const brandLogoSources: BrandLogoSource[] = ["default", "local", "url"];
const displayModes: SiteDisplayMode[] = ["flat", "grouped"];
const sortModes: SiteSortMode[] = [
  "manual",
  "name-asc",
  "name-desc",
  "newest",
  "oldest",
  "heat",
];
const DEFAULT_DISPLAY_MODE_BY_WORKSPACE = {
  main: "flat" as SiteDisplayMode,
  github: "flat" as SiteDisplayMode,
};
const DEFAULT_SORT_MODE_BY_WORKSPACE = {
  main: "manual" as SiteSortMode,
  github: "manual" as SiteSortMode,
};
const trashRetentionOptions: TrashRetentionDays[] = [7, 30, 90, null];
const wallpaperSources: WallpaperSource[] = ["none", "url", "local"];
const wallpaperFits: WallpaperFit[] = ["cover", "contain"];
const legacyWallpaperPositions = [
  "left top",
  "center top",
  "right top",
  "left center",
  "center center",
  "right center",
  "left bottom",
  "center bottom",
  "right bottom",
] as const;
const groupIcons = GROUP_ICON_OPTIONS.map((option) => option.value);
const siteIconSources: SiteIconSource[] = [
  "auto",
  "browser",
  "google",
  "root",
  "duckduckgo",
  "brand",
  "custom",
];
const legacyCategoryIds = new Set([
  "search",
  "develop",
  "design",
  "media",
  "learn",
]);

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function normalizeClickCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeAppearance(value: unknown): AppearanceSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<AppearanceSettings>)
      : {};
  return {
    accentColor: isHexColor(candidate.accentColor)
      ? candidate.accentColor
      : DEFAULT_APPEARANCE.accentColor,
    layoutPreset: layoutPresets.includes(candidate.layoutPreset as LayoutPreset)
      ? (candidate.layoutPreset as LayoutPreset)
      : DEFAULT_APPEARANCE.layoutPreset,
    fontScale: clamp(candidate.fontScale, 85, 120, DEFAULT_APPEARANCE.fontScale),
    brandFontScale: clamp(
      candidate.brandFontScale,
      70,
      180,
      DEFAULT_APPEARANCE.brandFontScale,
    ),
    cardFontScale: clamp(
      candidate.cardFontScale,
      80,
      140,
      DEFAULT_APPEARANCE.cardFontScale,
    ),
    uiIconScale: clamp(
      candidate.uiIconScale,
      75,
      150,
      DEFAULT_APPEARANCE.uiIconScale,
    ),
    controlScale: clamp(
      candidate.controlScale,
      80,
      130,
      DEFAULT_APPEARANCE.controlScale,
    ),
    controlRadius: clamp(
      candidate.controlRadius,
      4,
      24,
      DEFAULT_APPEARANCE.controlRadius,
    ),
    pagePadding: clamp(
      candidate.pagePadding,
      12,
      80,
      DEFAULT_APPEARANCE.pagePadding,
    ),
    brandLogoSize: clamp(
      candidate.brandLogoSize,
      24,
      64,
      DEFAULT_APPEARANCE.brandLogoSize,
    ),
    brandLogoScale: clamp(
      candidate.brandLogoScale,
      40,
      120,
      DEFAULT_APPEARANCE.brandLogoScale,
    ),
    brandLogoRadius: clamp(
      candidate.brandLogoRadius,
      0,
      24,
      DEFAULT_APPEARANCE.brandLogoRadius,
    ),
    brandGap: clamp(
      candidate.brandGap,
      0,
      24,
      DEFAULT_APPEARANCE.brandGap,
    ),
    topbarHeight: clamp(
      candidate.topbarHeight,
      48,
      96,
      DEFAULT_APPEARANCE.topbarHeight,
    ),
    searchWidth: clamp(
      candidate.searchWidth,
      320,
      960,
      DEFAULT_APPEARANCE.searchWidth,
    ),
    searchHeight: clamp(
      candidate.searchHeight,
      40,
      72,
      DEFAULT_APPEARANCE.searchHeight,
    ),
    searchRadius: clamp(
      candidate.searchRadius,
      4,
      32,
      DEFAULT_APPEARANCE.searchRadius,
    ),
    groupFontScale: clamp(
      candidate.groupFontScale,
      80,
      140,
      DEFAULT_APPEARANCE.groupFontScale,
    ),
    groupTabHeight: clamp(
      candidate.groupTabHeight,
      30,
      54,
      DEFAULT_APPEARANCE.groupTabHeight,
    ),
    groupIconSize: clamp(
      candidate.groupIconSize,
      12,
      28,
      DEFAULT_APPEARANCE.groupIconSize,
    ),
    groupGap: clamp(
      candidate.groupGap,
      2,
      20,
      DEFAULT_APPEARANCE.groupGap,
    ),
    cardWidth: clamp(candidate.cardWidth, 132, 260, DEFAULT_APPEARANCE.cardWidth),
    cardHeight: clamp(
      candidate.cardHeight,
      112,
      240,
      DEFAULT_APPEARANCE.cardHeight,
    ),
    gap: clamp(candidate.gap, 4, 32, DEFAULT_APPEARANCE.gap),
    contentWidth: clamp(
      candidate.contentWidth,
      960,
      1920,
      DEFAULT_APPEARANCE.contentWidth,
    ),
    radius: clamp(candidate.radius, 4, 28, DEFAULT_APPEARANCE.radius),
    cardPadding: clamp(
      candidate.cardPadding,
      6,
      28,
      DEFAULT_APPEARANCE.cardPadding,
    ),
    siteIconSize: clamp(
      candidate.siteIconSize,
      24,
      64,
      DEFAULT_APPEARANCE.siteIconSize,
    ),
    siteIconScale: clamp(
      candidate.siteIconScale,
      60,
      120,
      DEFAULT_APPEARANCE.siteIconScale,
    ),
  };
}

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

export function normalizeWallpaper(value: unknown): WallpaperSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<WallpaperSettings> & { position?: string })
      : {};
  const source = wallpaperSources.includes(candidate.source as WallpaperSource)
    ? (candidate.source as WallpaperSource)
    : DEFAULT_WALLPAPER.source;
  const legacyPosition = legacyWallpaperPositions.includes(
    candidate.position as (typeof legacyWallpaperPositions)[number],
  )
    ? candidate.position
    : undefined;
  const [legacyHorizontal, legacyVertical] = legacyPosition
    ? legacyPosition.split(" ")
    : [];
  const legacyX =
    legacyHorizontal === "left" ? 0 : legacyHorizontal === "right" ? 100 : 50;
  const legacyY =
    legacyVertical === "top" ? 0 : legacyVertical === "bottom" ? 100 : 50;
  return {
    source,
    ...(typeof candidate.url === "string" && candidate.url
      ? { url: candidate.url }
      : {}),
    ...(typeof candidate.localAssetId === "string" && candidate.localAssetId
      ? { localAssetId: candidate.localAssetId }
      : {}),
    fit: wallpaperFits.includes(candidate.fit as WallpaperFit)
      ? (candidate.fit as WallpaperFit)
      : DEFAULT_WALLPAPER.fit,
    positionX: clamp(
      candidate.positionX,
      0,
      100,
      legacyPosition ? legacyX : DEFAULT_WALLPAPER.positionX,
    ),
    positionY: clamp(
      candidate.positionY,
      0,
      100,
      legacyPosition ? legacyY : DEFAULT_WALLPAPER.positionY,
    ),
    zoom: clamp(candidate.zoom, 50, 300, DEFAULT_WALLPAPER.zoom),
    blur: clamp(candidate.blur, 0, 20, DEFAULT_WALLPAPER.blur),
    overlay: clamp(candidate.overlay, 0, 80, DEFAULT_WALLPAPER.overlay),
    topbarBlurEnabled:
      typeof candidate.topbarBlurEnabled === "boolean"
        ? candidate.topbarBlurEnabled
        : DEFAULT_WALLPAPER.topbarBlurEnabled,
    topbarBlur: clamp(
      candidate.topbarBlur,
      0,
      30,
      DEFAULT_WALLPAPER.topbarBlur,
    ),
    topbarOpacity: clamp(
      candidate.topbarOpacity,
      0,
      100,
      DEFAULT_WALLPAPER.topbarOpacity,
    ),
  };
}

function normalizeSearchHistory(value: unknown): SearchHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter(
      (entry): entry is SearchHistoryEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as SearchHistoryEntry).query === "string" &&
        Boolean((entry as SearchHistoryEntry).query.trim()) &&
        typeof (entry as SearchHistoryEntry).searchedAt === "string",
    )
    .filter((entry) => {
      const key = entry.query.trim().toLocaleLowerCase("zh-CN");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10)
    .map((entry) => ({ ...entry, query: entry.query.trim() }));
}

function hasBaseSiteFields(item: Record<string, unknown>): boolean {
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.url === "string" &&
    (item.customIconUrl === undefined || typeof item.customIconUrl === "string") &&
    (item.iconSource === undefined ||
      siteIconSources.includes(item.iconSource as SiteIconSource)) &&
    typeof item.order === "number" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}

function hasBaseGroupFields(group: Record<string, unknown>): boolean {
  return (
    typeof group.id === "string" &&
    group.id.length > 0 &&
    typeof group.name === "string" &&
    group.name.trim().length > 0 &&
    groupIcons.includes(group.icon as CategoryIcon) &&
    typeof group.order === "number" &&
    typeof group.createdAt === "string" &&
    typeof group.updatedAt === "string"
  );
}

function isSiteGroup(value: unknown): value is SiteGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Record<string, unknown>;
  return (
    hasBaseGroupFields(group) &&
    typeof group.isProtected === "boolean" &&
    (group.workspace === undefined ||
      group.workspace === "main" ||
      group.workspace === "github") &&
    (group.githubImportSource === undefined ||
      isGithubImportSource(group.githubImportSource))
  );
}

function isGithubImportSource(value: unknown): value is GithubImportSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.login === "string" &&
    source.login.trim().length > 0 &&
    typeof source.profileUrl === "string" &&
    source.profileUrl.trim().length > 0 &&
    (source.entityType === "user" || source.entityType === "organization") &&
    (source.lastFetchedAt === undefined || typeof source.lastFetchedAt === "string")
  );
}

function isSiteItem(value: unknown, groupIds: Set<string>): value is SiteItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    hasBaseSiteFields(item) &&
    typeof item.groupId === "string" &&
    groupIds.has(item.groupId) &&
    typeof item.globalOrder === "number"
  );
}

function normalizeDeletedSites(value: unknown): TrashedSite[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter((entry): entry is TrashedSite => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as unknown as Record<string, unknown>;
      const site = candidate.site;
      if (!site || typeof site !== "object") return false;
      const siteCandidate = site as Record<string, unknown>;
      return (
        hasBaseSiteFields(siteCandidate) &&
        typeof siteCandidate.groupId === "string" &&
        typeof siteCandidate.globalOrder === "number" &&
        typeof candidate.deletedAt === "string" &&
        Number.isFinite(Date.parse(candidate.deletedAt)) &&
        typeof candidate.originalGroupId === "string" &&
        typeof candidate.originalGroupName === "string"
      );
    })
    .filter((entry) => {
      if (seen.has(entry.site.id)) return false;
      seen.add(entry.site.id);
      return true;
    })
    .map((entry) => ({
      site: {
        ...entry.site,
        clickCount: normalizeClickCount(
          (entry.site as unknown as Record<string, unknown>).clickCount,
        ),
      },
      deletedAt: entry.deletedAt,
      originalGroupId: entry.originalGroupId,
      originalGroupName: entry.originalGroupName,
      ...(entry.originalWorkspace === "github" || entry.originalWorkspace === "main"
        ? { originalWorkspace: entry.originalWorkspace }
        : {}),
    }));
}

function baseStateIsValid(
  value: Record<string, unknown>,
  requireGithubWorkspace = false,
): boolean {
  if (
    !Array.isArray(value.groups) ||
    value.groups.length === 0 ||
    !value.groups.every(isSiteGroup) ||
    !Array.isArray(value.sites) ||
    !themePreferences.includes(value.themePreference as ThemePreference)
  ) {
    return false;
  }
  const groups = value.groups as SiteGroup[];
  const groupIds = new Set(groups.map((group) => group.id));
  const mainGroups = groups.filter(
    (group) => getGroupWorkspace(group) === "main",
  );
  const protectedGroups = mainGroups.filter((group) => group.isProtected);
  const githubGroups = groups.filter(
    (group) => getGroupWorkspace(group) === "github",
  );
  return (
    groupIds.size === groups.length &&
    protectedGroups.length === 1 &&
    protectedGroups[0].id === OTHER_GROUP_ID &&
    (!requireGithubWorkspace ||
      (githubGroups.some(
        (group) => group.id === GITHUB_OTHER_GROUP_ID && group.isProtected,
      ) && githubGroups.length >= DEFAULT_GITHUB_GROUPS.length)) &&
    (value.sites as unknown[]).every((site) => isSiteItem(site, groupIds))
  );
}

function isGithubMigrationRecord(value: unknown): value is GithubMigrationRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    (record.status !== "completed" && record.status !== "undone") ||
    typeof record.completedAt !== "string" ||
    !Array.isArray(record.entries)
  ) {
    return false;
  }
  return record.entries.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Record<string, unknown>;
    return (
      typeof candidate.siteId === "string" &&
      typeof candidate.originalName === "string" &&
      typeof candidate.originalUrl === "string" &&
      typeof candidate.fromGroupId === "string" &&
      typeof candidate.fromGroupName === "string" &&
      typeof candidate.fromOrder === "number" &&
      typeof candidate.fromGlobalOrder === "number" &&
      typeof candidate.targetGroupId === "string"
    );
  });
}

function hasValidClickCount(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isInteger(value)
  );
}

export function isSiteCollectionState(value: unknown): value is SiteCollectionState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return (
    state.version === 14 &&
    baseStateIsValid(state, true) &&
    (state.sites as Array<Record<string, unknown>>).every((site) =>
      hasValidClickCount(site.clickCount),
    ) &&
    Array.isArray(state.deletedSites) &&
    (state.deletedSites as Array<Record<string, unknown>>).every((entry) =>
      Boolean(entry) &&
      typeof entry.site === "object" &&
      entry.site !== null &&
      hasValidClickCount((entry.site as Record<string, unknown>).clickCount),
    ) &&
    trashRetentionOptions.includes(
      state.trashRetentionDays as TrashRetentionDays,
    ) &&
    Boolean(state.appearance) &&
    Boolean(state.brand) &&
    Boolean(state.wallpaper) &&
    Array.isArray(state.searchHistory) &&
    displayModes.includes(state.displayMode as SiteDisplayMode) &&
    isDisplayModeByWorkspace(state.displayModeByWorkspace) &&
    sortModes.includes(state.sortMode as SiteSortMode) &&
    isSortModeByWorkspace(state.sortModeByWorkspace) &&
    (state.githubMigration === null ||
      isGithubMigrationRecord(state.githubMigration))
  );
}

function isDisplayModeByWorkspace(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    displayModes.includes(candidate.main as SiteDisplayMode) &&
    displayModes.includes(candidate.github as SiteDisplayMode)
  );
}

function normalizeDisplayModeByWorkspace(
  value: unknown,
  mainFallback: SiteDisplayMode,
): SiteCollectionState["displayModeByWorkspace"] {
  const candidate = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  return {
    main: displayModes.includes(candidate.main as SiteDisplayMode)
      ? (candidate.main as SiteDisplayMode)
      : mainFallback,
    github: displayModes.includes(candidate.github as SiteDisplayMode)
      ? (candidate.github as SiteDisplayMode)
      : DEFAULT_DISPLAY_MODE_BY_WORKSPACE.github,
  };
}

function isSortModeByWorkspace(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    sortModes.includes(candidate.main as SiteSortMode) &&
    sortModes.includes(candidate.github as SiteSortMode)
  );
}

function normalizeSortModeByWorkspace(
  value: unknown,
  mainFallback: SiteSortMode,
): SiteCollectionState["sortModeByWorkspace"] {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    main: sortModes.includes(candidate.main as SiteSortMode)
      ? (candidate.main as SiteSortMode)
      : mainFallback,
    github: sortModes.includes(candidate.github as SiteSortMode)
      ? (candidate.github as SiteSortMode)
      : DEFAULT_SORT_MODE_BY_WORKSPACE.github,
  };
}

function repairDuplicateOtherGroups(
  state: SiteCollectionState,
): SiteCollectionState {
  const protectedOther = state.groups.find(
    (group) => group.id === OTHER_GROUP_ID && group.isProtected,
  );
  if (!protectedOther) return state;
  const protectedName = protectedOther.name.trim().toLocaleLowerCase("zh-CN");
  const duplicates = state.groups.filter(
    (group) =>
      getGroupWorkspace(group) === "main" &&
      !group.isProtected &&
      group.name.trim().toLocaleLowerCase("zh-CN") === protectedName,
  );
  if (!duplicates.length) return state;
  const duplicateIds = new Set(duplicates.map((group) => group.id));
  const now = new Date().toISOString();
  let order = state.sites.filter(
    (site) => site.groupId === OTHER_GROUP_ID,
  ).length;
  const groups = [
    ...state.groups
      .filter(
        (group) =>
          getGroupWorkspace(group) === "main" &&
          !group.isProtected &&
          !duplicateIds.has(group.id),
      )
      .sort((a, b) => a.order - b.order),
    protectedOther,
    ...state.groups
      .filter((group) => getGroupWorkspace(group) === "github")
      .sort((a, b) => a.order - b.order),
  ].map((group, groupOrder) => ({ ...group, order: groupOrder }));
  const sites = state.sites.map((site) =>
    duplicateIds.has(site.groupId)
      ? {
          ...site,
          groupId: OTHER_GROUP_ID,
          order: order++,
          updatedAt: now,
        }
      : { ...site },
  );
  return ensureGithubWorkspace({ ...state, groups, sites: reindexSites(sites) });
}

function upgradeToVersion10(
  legacy: Record<string, unknown>,
): SiteCollectionState | undefined {
  if (!baseStateIsValid(legacy)) return undefined;
  const legacyGroups = (legacy.groups as SiteGroup[])
    .filter((group) => getGroupWorkspace(group) === "main")
    .map((group) => ({ ...group }));
  const groups = normalizeMigratedGroups(legacyGroups);
  return {
    version: 10,
    groups,
    sites: (legacy.sites as SiteItem[]).map((site, index) => ({
      ...site,
      globalOrder:
        typeof site.globalOrder === "number" ? site.globalOrder : index,
      clickCount: normalizeClickCount(
        (site as unknown as Record<string, unknown>).clickCount,
      ),
    })),
    deletedSites: normalizeDeletedSites(legacy.deletedSites),
    trashRetentionDays: trashRetentionOptions.includes(
      legacy.trashRetentionDays as TrashRetentionDays,
    )
      ? (legacy.trashRetentionDays as TrashRetentionDays)
      : 30,
    themePreference: legacy.themePreference as ThemePreference,
    brand: normalizeBrand(legacy.brand),
    appearance: normalizeAppearance(legacy.appearance),
    wallpaper: normalizeWallpaper(legacy.wallpaper),
    searchHistory: normalizeSearchHistory(legacy.searchHistory),
    displayMode: displayModes.includes(legacy.displayMode as SiteDisplayMode)
      ? (legacy.displayMode as SiteDisplayMode)
      : "flat",
    displayModeByWorkspace: {
      ...DEFAULT_DISPLAY_MODE_BY_WORKSPACE,
      main: displayModes.includes(legacy.displayMode as SiteDisplayMode)
        ? (legacy.displayMode as SiteDisplayMode)
        : DEFAULT_DISPLAY_MODE_BY_WORKSPACE.main,
    },
    sortMode: DEFAULT_SORT_MODE_BY_WORKSPACE.main,
    sortModeByWorkspace: { ...DEFAULT_SORT_MODE_BY_WORKSPACE },
  };
}

function upgradeToVersion11(
  legacy: Record<string, unknown> | SiteCollectionState,
): SiteCollectionState | undefined {
  if (legacy.version === 11) {
    if (!baseStateIsValid(legacy as Record<string, unknown>, true)) {
      return undefined;
    }
    const candidate = legacy as SiteCollectionState;
    return ensureGithubWorkspace({
      ...candidate,
      version: 11,
      githubMigration:
        candidate.githubMigration === null ||
        isGithubMigrationRecord(candidate.githubMigration)
          ? candidate.githubMigration ?? null
          : null,
      groups: candidate.groups.map((group) => ({
        ...group,
        workspace: getGroupWorkspace(group),
      })),
      deletedSites: normalizeDeletedSites(candidate.deletedSites),
    });
  }

  const base =
    legacy.version === 10
      ? upgradeToVersion10(legacy as Record<string, unknown>)
      : undefined;
  if (!base || !baseStateIsValid(base as unknown as Record<string, unknown>)) {
    return undefined;
  }
  return ensureGithubWorkspace({
    ...base,
    version: 11,
    githubMigration: null,
    groups: base.groups.map((group) => ({
      ...group,
      workspace: "main",
    })),
  });
}

function upgradeToVersion12(
  legacy: Record<string, unknown> | SiteCollectionState,
): SiteCollectionState | undefined {
  if (legacy.version === 12) {
    if (!baseStateIsValid(legacy as Record<string, unknown>, true)) {
      return undefined;
    }
    const candidate = legacy as SiteCollectionState;
    const mainDisplayMode = displayModes.includes(
      candidate.displayMode as SiteDisplayMode,
    )
      ? candidate.displayMode
      : DEFAULT_DISPLAY_MODE_BY_WORKSPACE.main;
    return {
      ...candidate,
      version: 12,
      displayModeByWorkspace: normalizeDisplayModeByWorkspace(
        candidate.displayModeByWorkspace,
        mainDisplayMode,
      ),
    };
  }

  const base =
    legacy.version === 11 || legacy.version === 10
      ? upgradeToVersion11(legacy as Record<string, unknown>)
      : undefined;
  if (!base) return undefined;
  return {
    ...base,
    version: 12,
    displayModeByWorkspace: normalizeDisplayModeByWorkspace(
      undefined,
      displayModes.includes(base.displayMode as SiteDisplayMode)
        ? base.displayMode
        : DEFAULT_DISPLAY_MODE_BY_WORKSPACE.main,
    ),
  };
}

function normalizeGithubImportSource(value: unknown): GithubImportSource | undefined {
  if (!isGithubImportSource(value)) return undefined;
  return {
    login: value.login.trim(),
    profileUrl: value.profileUrl.trim(),
    entityType: value.entityType,
    ...(value.lastFetchedAt ? { lastFetchedAt: value.lastFetchedAt } : {}),
  };
}

function upgradeToVersion13(
  legacy: Record<string, unknown> | SiteCollectionState,
): SiteCollectionState | undefined {
  const base =
    legacy.version === 13
      ? legacy
      : legacy.version === 12 || legacy.version === 11 || legacy.version === 10
        ? upgradeToVersion12(legacy as Record<string, unknown>)
        : undefined;
  if (!base || !baseStateIsValid(base as Record<string, unknown>, true)) return undefined;
  const candidate = base as SiteCollectionState;
  return {
    ...candidate,
    version: 13,
    groups: candidate.groups.map((group) => {
      const source = normalizeGithubImportSource(group.githubImportSource);
      return source ? { ...group, githubImportSource: source } : { ...group, githubImportSource: undefined };
    }),
  };
}

function upgradeToVersion14(
  legacy: Record<string, unknown> | SiteCollectionState,
): SiteCollectionState | undefined {
  const base =
    legacy.version === 14
      ? legacy
      : legacy.version === 13 ||
          legacy.version === 12 ||
          legacy.version === 11 ||
          legacy.version === 10
        ? upgradeToVersion13(legacy as Record<string, unknown>)
        : undefined;
  if (!base || !baseStateIsValid(base as Record<string, unknown>, true)) {
    return undefined;
  }
  const candidate = base as SiteCollectionState;
  const mainSortMode = sortModes.includes(candidate.sortMode as SiteSortMode)
    ? candidate.sortMode
    : DEFAULT_SORT_MODE_BY_WORKSPACE.main;
  return {
    ...candidate,
    version: 14,
    sortMode: mainSortMode,
    sortModeByWorkspace: normalizeSortModeByWorkspace(
      candidate.sortModeByWorkspace,
      mainSortMode,
    ),
  };
}

function normalizeMigratedGroups(groups: SiteGroup[]): SiteGroup[] {
  const now = new Date().toISOString();
  const ordinary = groups
    .filter((group) => group.id !== OTHER_GROUP_ID)
    .sort((a, b) => a.order - b.order)
    .map((group, order) => ({ ...group, isProtected: false, order }));
  const existingOther = groups.find((group) => group.id === OTHER_GROUP_ID);
  return [
    ...ordinary,
    {
      id: OTHER_GROUP_ID,
      name: "其他",
      icon: "folder",
      isProtected: true,
      workspace: "main",
      order: ordinary.length,
      createdAt: existingOther?.createdAt ?? now,
      updatedAt: existingOther?.updatedAt ?? now,
    },
  ];
}

function migrateLegacy(value: Record<string, unknown>): SiteCollectionState | undefined {
  if (
    value.version === 7 ||
    value.version === 6 ||
    value.version === 5 ||
    value.version === 4 ||
    value.version === 3
  ) {
    if (value.version === 3 && Array.isArray(value.sites)) {
      value = {
        ...value,
        version: 4,
        sites: (value.sites as Array<Record<string, unknown>>).map(
          (site, globalOrder) => ({ ...site, globalOrder }),
        ),
      };
    }
    return upgradeToVersion10(value);
  }

  if (
    value.version === 2 &&
    Array.isArray(value.groups) &&
    Array.isArray(value.sites) &&
    themePreferences.includes(value.themePreference as ThemePreference)
  ) {
    const rawGroups = value.groups as Array<Record<string, unknown>>;
    if (!rawGroups.every(hasBaseGroupFields)) return undefined;
    const groups = normalizeMigratedGroups(
      rawGroups.map((group) => ({
        ...(group as unknown as SiteGroup),
        isProtected: false,
      })),
    );
    const groupIds = new Set(groups.map((group) => group.id));
    const sites = (value.sites as Array<Record<string, unknown>>).map(
      (site, globalOrder) => ({ ...site, globalOrder }),
    );
    if (!sites.every((site) => isSiteItem(site, groupIds))) return undefined;
    return upgradeToVersion10({
      version: 4,
      groups,
      sites,
      themePreference: value.themePreference,
    });
  }

  if (
    value.version === 1 &&
    Array.isArray(value.sites) &&
    themePreferences.includes(value.themePreference as ThemePreference)
  ) {
    const legacySites = value.sites as Array<Record<string, unknown>>;
    if (
      !legacySites.every(
        (site) =>
          hasBaseSiteFields(site) &&
          typeof site.categoryId === "string" &&
          legacyCategoryIds.has(site.categoryId),
      )
    ) {
      return undefined;
    }
    const sites = legacySites.map((site, globalOrder) => ({
      id: site.id as string,
      name: site.name as string,
      url: site.url as string,
      groupId: site.categoryId as string,
      customIconUrl: site.customIconUrl as string | undefined,
      order: site.order as number,
      globalOrder,
      createdAt: site.createdAt as string,
      updatedAt: site.updatedAt as string,
    }));
    return upgradeToVersion10({
      version: 4,
      groups: DEFAULT_GROUPS.map((group) => ({ ...group })),
      sites,
      themePreference: value.themePreference,
    });
  }
  return undefined;
}

export interface LoadedState {
  state: SiteCollectionState;
  recovered: boolean;
}

export function parseStoredState(raw: string | null): LoadedState {
  if (!raw) return { state: createDefaultState(), recovered: false };
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object") {
      const candidate = value as Record<string, unknown>;
      const baseCandidate =
        candidate.version === 14 || candidate.version === 13 || candidate.version === 12 || candidate.version === 11
          ? candidate
          : candidate.version === 10 ||
              candidate.version === 9 ||
              candidate.version === 8
            ? upgradeToVersion10(candidate)
          : migrateLegacy(candidate);
      const migrated = baseCandidate
        ? upgradeToVersion14(baseCandidate)
        : undefined;
      if (migrated) {
        return {
          state: purgeExpiredTrashFromState(
            repairDuplicateOtherGroups({
              ...migrated,
              brand: normalizeBrand(migrated.brand),
              appearance: normalizeAppearance(migrated.appearance),
              wallpaper: normalizeWallpaper(migrated.wallpaper),
              searchHistory: normalizeSearchHistory(migrated.searchHistory),
            }),
          ),
          recovered: false,
        };
      }
    }
  } catch {
    // Keep the damaged source value untouched and show safe defaults.
  }
  return { state: createDefaultState(), recovered: true };
}

export function loadState(storage: Pick<Storage, "getItem"> = localStorage): LoadedState {
  return parseStoredState(storage.getItem(STORAGE_KEY));
}

export function saveState(
  state: SiteCollectionState,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
