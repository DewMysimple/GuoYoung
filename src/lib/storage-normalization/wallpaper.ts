import { DEFAULT_WALLPAPER } from "../../data/defaults";
import type {
  CustomWallpaperPresets,
  WallpaperGlassSettings,
  WallpaperFit,
  WallpaperSettings,
  WallpaperSource,
} from "../../types";
import { OVERLAY_GLASS_KEYS, WALLPAPER_GLASS_KEYS } from "../wallpaper-presets";
import { clamp } from "./number";

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

type LegacyWallpaperSettings = Omit<Partial<WallpaperSettings>, "topbarStyle" | "sidebarStyle"> & {
  position?: string;
  topbarStyle?: unknown;
  topbarOpacity?: unknown;
  topbarBlurEnabled?: unknown;
  sidebarBlurEnabled?: unknown;
  sidebarStyle?: unknown;
};

export function normalizeWallpaper(value: unknown): WallpaperSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as LegacyWallpaperSettings)
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
    ...normalizeWallpaperGlass(candidate),
    presetIncludesPanels: typeof candidate.presetIncludesPanels === "boolean"
      ? candidate.presetIncludesPanels : DEFAULT_WALLPAPER.presetIncludesPanels,
    customPresets: normalizeCustomWallpaperPresets(candidate.customPresets),
  };
}

function normalizeWallpaperGlass(candidate: LegacyWallpaperSettings): WallpaperGlassSettings {
  return {
    // Retired presets and blur switches are consumed only at the storage boundary.
    // Store their effective values so direct sliders have no hidden overrides.
    sidebarStyle: candidate.sidebarStyle === "glass" || candidate.sidebarStyle === "clear" ? "glass" : "shared",
    sidebarTransparency: candidate.sidebarStyle === "clear" ? 100
      : clamp(candidate.sidebarTransparency, 0, 100, DEFAULT_WALLPAPER.sidebarTransparency),
    sidebarBlur: candidate.sidebarStyle === "clear" || candidate.sidebarBlurEnabled === false ? 0
      : clamp(candidate.sidebarBlur, 0, 30, DEFAULT_WALLPAPER.sidebarBlur),
    // Missing mode in pre-v24 data means the existing independent topbar.
    topbarStyle: candidate.topbarStyle === "shared" ? "shared" : "glass",
    topbarBlur: candidate.topbarStyle === "clear" || candidate.topbarBlurEnabled === false ? 0
      : clamp(candidate.topbarBlur, 0, 30, DEFAULT_WALLPAPER.topbarBlur),
    topbarTransparency: candidate.topbarStyle === "clear" ? 100
      : clamp(candidate.topbarTransparency, 0, 100,
          100 - clamp(candidate.topbarOpacity, 0, 100, 100 - DEFAULT_WALLPAPER.topbarTransparency)),
    glassTransparency: clamp(candidate.glassTransparency, 0, 100, DEFAULT_WALLPAPER.glassTransparency),
    glassControlTransparency: clamp(candidate.glassControlTransparency, 0, 100, DEFAULT_WALLPAPER.glassControlTransparency),
    glassPanelTransparency: clamp(candidate.glassPanelTransparency, 0, 100, DEFAULT_WALLPAPER.glassPanelTransparency),
    glassPopoverTransparency: clamp(candidate.glassPopoverTransparency, 0, 100, DEFAULT_WALLPAPER.glassPopoverTransparency),
    glassShadow: clamp(candidate.glassShadow, 0, 100, DEFAULT_WALLPAPER.glassShadow),
    glassBlur: clamp(candidate.glassBlur, 0, 30, DEFAULT_WALLPAPER.glassBlur),
    glassSaturation: clamp(candidate.glassSaturation, 100, 200, DEFAULT_WALLPAPER.glassSaturation),
    glassHighlight: clamp(candidate.glassHighlight, 0, 100, DEFAULT_WALLPAPER.glassHighlight),
    // Old panel/popover values must not seed the new floating material.
    overlayTransparency: clamp(candidate.overlayTransparency, 0, 100, DEFAULT_WALLPAPER.overlayTransparency),
    overlayBlur: clamp(candidate.overlayBlur, 0, 30, DEFAULT_WALLPAPER.overlayBlur),
    overlayBackdropDim: clamp(candidate.overlayBackdropDim, 0, 100, DEFAULT_WALLPAPER.overlayBackdropDim),
    overlayReadabilityProtection: typeof candidate.overlayReadabilityProtection === "boolean"
      ? candidate.overlayReadabilityProtection : DEFAULT_WALLPAPER.overlayReadabilityProtection,
  };
}

function normalizeCustomWallpaperPresets(value: unknown): CustomWallpaperPresets {
  const normalizeSlot = (slot: unknown): WallpaperGlassSettings | null => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) return null;
    const candidate = slot as Record<string, unknown>;
    // Incomplete or malformed snapshots are empty slots, never invented presets.
    // Complete legacy snapshots remain valid. Only the new fields may be
    // missing; the same safe normalization fills them without losing a slot.
    if (!WALLPAPER_GLASS_KEYS.filter(key => !OVERLAY_GLASS_KEYS.some(overlay => overlay === key)).every(key => key === "topbarStyle" || key === "sidebarStyle"
      ? candidate[key] === "shared" || candidate[key] === "glass"
      : typeof candidate[key] === "number" && Number.isFinite(candidate[key]))) return null;
    return normalizeWallpaperGlass(candidate as LegacyWallpaperSettings);
  };
  return Array.isArray(value) ? [normalizeSlot(value[0]), normalizeSlot(value[1])] : [null, null];
}
