import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowCounterClockwise,
  ArrowsOutCardinal,
  CaretDown,
  CaretUp,
  Check,
  Crosshair,
  DownloadSimple,
  Image as ImageIcon,
  PaintBrush,
  MagnifyingGlass,
  SquaresFour,
  SlidersHorizontal,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_BRAND,
  DEFAULT_WALLPAPER,
  LAYOUT_PRESETS,
} from "../data/defaults";
import {
  MAX_BRAND_LOGO_BYTES,
  isHttpImageUrl,
  prepareBrandLogo,
} from "../lib/brand-logo";
import {
  MAX_WALLPAPER_BYTES,
  prepareWallpaper,
  saveWallpaperBlob,
} from "../lib/wallpaper-store";
import type {
  AppearanceSettings,
  BrandSettings,
  LayoutPreset,
  SiteCollectionState,
  ThemePreference,
  TrashRetentionDays,
  WallpaperSettings,
} from "../types";
import { CustomColorPicker } from "./custom-color-picker";
import { BrandMark } from "./brand-mark";
import { ConfirmDialog } from "./confirm-dialog";
import { Favicon } from "./favicon";
import { getHostname } from "../lib/site-utils";

export interface SettingsDraft {
  themePreference: ThemePreference;
  brand: BrandSettings;
  appearance: AppearanceSettings;
  wallpaper: WallpaperSettings;
}

interface SettingsPanelProps {
  open: boolean;
  state: SiteCollectionState;
  onOpenChange: (open: boolean) => void;
  onPreview: (draft: SettingsDraft | null) => void;
  onSave: (draft: SettingsDraft) => void;
  onExport: () => void;
  onImport: () => void;
  onResetBookmarks: () => void;
  onClearHistory: () => void;
  onRestoreSite: (id: string) => void;
  onRestoreAllSites: () => void;
  onPermanentDeleteSite: (id: string) => void;
  onEmptyTrash: () => void;
  onTrashRetentionChange: (days: TrashRetentionDays) => void;
  wallpaperLoadError?: string;
}

const ACCENTS = [
  "#3367d6",
  "#6750a4",
  "#00897b",
  "#d97706",
  "#dc4f64",
  "#4f657d",
];

const SETTINGS_WIDTH_KEY = "site-hub:settings-panel-width";
const DEFAULT_PANEL_WIDTH = 440;
const MIN_PANEL_WIDTH = 360;
const MAX_PANEL_WIDTH = 760;
const MIN_WORKSPACE_WIDTH = 440;

function getMaximumPanelWidth() {
  return Math.min(
    MAX_PANEL_WIDTH,
    Math.max(MIN_PANEL_WIDTH, window.innerWidth - MIN_WORKSPACE_WIDTH),
  );
}

function clampPanelWidth(width: number) {
  return Math.min(getMaximumPanelWidth(), Math.max(MIN_PANEL_WIDTH, width));
}

type AdvancedSection = "global" | "brand" | "header" | "groups" | "cards";
type AppearanceNumberKey = {
  [Key in keyof AppearanceSettings]: AppearanceSettings[Key] extends number
    ? Key
    : never;
}[keyof AppearanceSettings];

interface RangeField {
  key: AppearanceNumberKey;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
  description?: string;
}

const RANGE_FIELD_GROUPS: Record<AdvancedSection, RangeField[]> = {
  global: [
    { key: "fontScale", label: "界面字号", min: 85, max: 120, step: 0.5, suffix: "%" },
    { key: "uiIconScale", label: "UI 图标比例", min: 75, max: 150, step: 1, suffix: "%" },
    { key: "controlScale", label: "控件整体比例", min: 80, max: 130, step: 1, suffix: "%" },
    { key: "controlRadius", label: "控件圆角", min: 4, max: 24, step: 1, suffix: "px" },
    { key: "contentWidth", label: "内容最大宽度", min: 960, max: 1920, step: 10, suffix: "px" },
    { key: "pagePadding", label: "页面左右留白", min: 12, max: 80, step: 1, suffix: "px" },
  ],
  brand: [
    { key: "brandFontScale", label: "Logo 字号", min: 70, max: 180, step: 0.5, suffix: "%", description: "品牌名称文字大小" },
    { key: "brandLogoSize", label: "品牌 Logo 框尺寸", min: 24, max: 64, step: 1, suffix: "px" },
    { key: "brandLogoScale", label: "Logo 图片占比", min: 40, max: 120, step: 1, suffix: "%" },
    { key: "brandLogoRadius", label: "Logo 圆角", min: 0, max: 24, step: 1, suffix: "px" },
    { key: "brandGap", label: "Logo 与名称间距", min: 0, max: 24, step: 1, suffix: "px" },
  ],
  header: [
    { key: "topbarHeight", label: "顶栏高度", min: 48, max: 96, step: 1, suffix: "px" },
    { key: "searchWidth", label: "搜索框宽度", min: 320, max: 960, step: 10, suffix: "px" },
    { key: "searchHeight", label: "搜索框高度", min: 40, max: 72, step: 1, suffix: "px" },
    { key: "searchRadius", label: "搜索框圆角", min: 4, max: 32, step: 1, suffix: "px" },
  ],
  groups: [
    { key: "groupFontScale", label: "分组文字比例", min: 80, max: 140, step: 0.5, suffix: "%" },
    { key: "groupTabHeight", label: "分组按钮高度", min: 30, max: 54, step: 1, suffix: "px" },
    { key: "groupIconSize", label: "分组图标尺寸", min: 12, max: 28, step: 1, suffix: "px" },
    { key: "groupGap", label: "分组项目间距", min: 2, max: 20, step: 1, suffix: "px" },
  ],
  cards: [
    { key: "cardFontScale", label: "卡片文字比例", min: 80, max: 140, step: 0.5, suffix: "%" },
    { key: "cardWidth", label: "卡片宽度", min: 132, max: 260, step: 1, suffix: "px" },
    { key: "cardHeight", label: "卡片高度", min: 112, max: 240, step: 1, suffix: "px" },
    { key: "gap", label: "卡片间距", min: 4, max: 32, step: 1, suffix: "px" },
    { key: "radius", label: "卡片圆角", min: 4, max: 28, step: 1, suffix: "px" },
    { key: "cardPadding", label: "卡片内边距", min: 6, max: 28, step: 1, suffix: "px" },
    { key: "siteIconSize", label: "网站图标框尺寸", min: 24, max: 64, step: 1, suffix: "px" },
    { key: "siteIconScale", label: "网站图标内容占比", min: 60, max: 120, step: 1, suffix: "%" },
  ],
};

const LAYOUT_FIELD_KEYS = new Set<keyof AppearanceSettings>(
  Object.keys(LAYOUT_PRESETS.standard) as Array<keyof AppearanceSettings>,
);

function cloneDraft(state: SiteCollectionState): SettingsDraft {
  return {
    themePreference: state.themePreference,
    brand: { ...state.brand },
    appearance: { ...state.appearance },
    wallpaper: { ...state.wallpaper },
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatTrashDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getTrashRemainingLabel(
  deletedAt: string,
  retention: TrashRetentionDays,
) {
  if (retention === null) return "不会自动清理";
  const elapsed = Math.max(0, Date.now() - Date.parse(deletedAt));
  const remaining = Math.max(
    0,
    Math.ceil((retention * 24 * 60 * 60 * 1000 - elapsed) / 86_400_000),
  );
  return `剩余 ${remaining} 天`;
}

export function SettingsPanel({
  open,
  state,
  onOpenChange,
  onPreview,
  onSave,
  onExport,
  onImport,
  onResetBookmarks,
  onClearHistory,
  onRestoreSite,
  onRestoreAllSites,
  onPermanentDeleteSite,
  onEmptyTrash,
  onTrashRetentionChange,
  wallpaperLoadError,
}: SettingsPanelProps) {
  const titleId = useId();
  const wallpaperFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const resizeState = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null>(null);
  const wallpaperDragState = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPositionX: number;
    startPositionY: number;
  } | null>(null);
  const wallpaperFrame = useRef<number | null>(null);
  const wallpaperWheelCommit = useRef<number | null>(null);
  const wallpaperGestureValue = useRef<{
    positionX: number;
    positionY: number;
    zoom: number;
  } | null>(null);
  const initialDraftSnapshot = useRef(JSON.stringify(cloneDraft(state)));
  const [draft, setDraft] = useState<SettingsDraft>(() => cloneDraft(state));
  const [section, setSection] = useState<"appearance" | "wallpaper" | "data">(
    "appearance",
  );
  const [advanced, setAdvanced] = useState(false);
  const [advancedSection, setAdvancedSection] =
    useState<AdvancedSection>("global");
  const [logoError, setLogoError] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);
  const [armedTrashDeleteId, setArmedTrashDeleteId] = useState<string | null>(
    null,
  );
  const armedTrashTimerRef = useRef<number | null>(null);

  function clearArmedTrashDelete() {
    if (armedTrashTimerRef.current !== null) {
      window.clearTimeout(armedTrashTimerRef.current);
      armedTrashTimerRef.current = null;
    }
    setArmedTrashDeleteId(null);
  }

  function requestTrashDelete(id: string, action: () => void) {
    if (armedTrashDeleteId === id) {
      clearArmedTrashDelete();
      action();
      return;
    }
    clearArmedTrashDelete();
    setArmedTrashDeleteId(id);
    armedTrashTimerRef.current = window.setTimeout(() => {
      armedTrashTimerRef.current = null;
      setArmedTrashDeleteId(null);
    }, 2000);
  }

  useEffect(() => {
    if (!open) {
      setTrashOpen(false);
      clearArmedTrashDelete();
    }
  }, [open]);

  useEffect(() => {
    if (!armedTrashDeleteId) return;
    const handlePointer = (event: globalThis.PointerEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-trash-delete-id]")
          : null;
      if (target?.dataset.trashDeleteId !== armedTrashDeleteId) {
        clearArmedTrashDelete();
      }
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") clearArmedTrashDelete();
    };
    window.addEventListener("pointerdown", handlePointer, true);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointer, true);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, [armedTrashDeleteId]);

  useEffect(
    () => () => {
      if (armedTrashTimerRef.current !== null) {
        window.clearTimeout(armedTrashTimerRef.current);
      }
    },
    [],
  );
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [wallpaperError, setWallpaperError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [wallpaperEditing, setWallpaperEditing] = useState(false);
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const [wallpaperGesturePreview, setWallpaperGesturePreview] = useState<{
    positionX: number;
    positionY: number;
    zoom: number;
  } | null>(null);
  const previewWallpaper = wallpaperGesturePreview
    ? { ...draft.wallpaper, ...wallpaperGesturePreview }
    : draft.wallpaper;
  const hasUnsavedChanges =
    JSON.stringify({ ...draft, wallpaper: previewWallpaper }) !==
    initialDraftSnapshot.current;

  useEffect(() => {
    if (!open) return;
    const nextDraft = cloneDraft(state);
    initialDraftSnapshot.current = JSON.stringify(nextDraft);
    setDraft(nextDraft);
    setSection("appearance");
    setAdvancedSection("global");
    setLogoError("");
    setWallpaperError("");
    setWallpaperEditing(false);
    setDiscardPromptOpen(false);
  }, [open]);

  useEffect(() => {
    if (draft.wallpaper.source === "none") setWallpaperEditing(false);
  }, [draft.wallpaper.source]);

  useEffect(
    () => () => {
      if (wallpaperFrame.current !== null) {
        window.cancelAnimationFrame(wallpaperFrame.current);
      }
      if (wallpaperWheelCommit.current !== null) {
        window.clearTimeout(wallpaperWheelCommit.current);
      }
      document.documentElement.classList.remove("wallpaper-positioning");
    },
    [],
  );

  useEffect(() => {
    if (!open) return;

    const storedWidth = Number.parseFloat(
      window.localStorage.getItem(SETTINGS_WIDTH_KEY) ?? "",
    );
    const nextWidth = clampPanelWidth(
      Number.isFinite(storedWidth) ? storedWidth : DEFAULT_PANEL_WIDTH,
    );
    setPanelWidth(nextWidth);
    document.documentElement.style.setProperty(
      "--settings-panel-width",
      `${nextWidth}px`,
    );

    const handleWindowResize = () => {
      setPanelWidth((current) => {
        const clamped = clampPanelWidth(current);
        document.documentElement.style.setProperty(
          "--settings-panel-width",
          `${clamped}px`,
        );
        return clamped;
      });
    };

    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
      document.documentElement.classList.remove("settings-resizing");
      resizeState.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (open) onPreview(draft);
  }, [draft, open, onPreview]);

  function applyPanelWidth(width: number) {
    const nextWidth = clampPanelWidth(width);
    setPanelWidth(nextWidth);
    document.documentElement.style.setProperty(
      "--settings-panel-width",
      `${nextWidth}px`,
    );
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (window.innerWidth < 900 || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelWidth,
      currentWidth: panelWidth,
    };
    document.documentElement.classList.add("settings-resizing");
  }

  function resizePanel(event: PointerEvent<HTMLDivElement>) {
    const active = resizeState.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const nextWidth = clampPanelWidth(
      active.startWidth + active.startX - event.clientX,
    );
    active.currentWidth = nextWidth;
    applyPanelWidth(nextWidth);
  }

  function finishResize(event: PointerEvent<HTMLDivElement>) {
    const active = resizeState.current;
    if (!active || active.pointerId !== event.pointerId) return;
    resizeState.current = null;
    document.documentElement.classList.remove("settings-resizing");
    window.localStorage.setItem(SETTINGS_WIDTH_KEY, String(active.currentWidth));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextWidth = clampPanelWidth(
      panelWidth + (event.key === "ArrowLeft" ? 24 : -24),
    );
    applyPanelWidth(nextWidth);
    window.localStorage.setItem(SETTINGS_WIDTH_KEY, String(nextWidth));
  }

  function resetPanelWidth() {
    const nextWidth = clampPanelWidth(DEFAULT_PANEL_WIDTH);
    applyPanelWidth(nextWidth);
    window.localStorage.setItem(SETTINGS_WIDTH_KEY, String(nextWidth));
  }

  function updateAppearance(patch: Partial<AppearanceSettings>) {
    setDraft((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        ...patch,
        ...(Object.keys(patch).some((key) =>
          LAYOUT_FIELD_KEYS.has(key as keyof AppearanceSettings),
        )
          ? { layoutPreset: "custom" as const }
          : {}),
      },
    }));
  }

  function updateBrand(patch: Partial<BrandSettings>) {
    setLogoError("");
    setDraft((current) => ({
      ...current,
      brand: { ...current.brand, ...patch },
    }));
  }

  function resetAdvancedSection(sectionToReset: AdvancedSection) {
    const fields = RANGE_FIELD_GROUPS[sectionToReset];
    const defaults = Object.fromEntries(
      fields.map((field) => [field.key, DEFAULT_APPEARANCE[field.key]]),
    ) as Partial<AppearanceSettings>;
    updateAppearance(defaults);
  }

  async function chooseLocalLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setLogoError("");
    setLogoProcessing(true);
    try {
      if (file.size > MAX_BRAND_LOGO_BYTES) {
        throw new Error("Logo 图片不能超过 5MB");
      }
      const logoDataUrl = await prepareBrandLogo(file);
      setDraft((current) => ({
        ...current,
        brand: {
          ...current.brand,
          logoSource: "local",
          logoDataUrl,
          logoUrl: undefined,
        },
        appearance:
          current.appearance.brandLogoScale === DEFAULT_APPEARANCE.brandLogoScale
            ? { ...current.appearance, brandLogoScale: 100 }
            : current.appearance,
      }));
    } catch (error) {
      setLogoError(
        error instanceof Error ? error.message : "无法处理这张 Logo 图片",
      );
    } finally {
      setLogoProcessing(false);
    }
  }

  function choosePreset(preset: Exclude<LayoutPreset, "custom">) {
    setDraft((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        layoutPreset: preset,
        ...LAYOUT_PRESETS[preset],
      },
    }));
  }

  function updateWallpaper(patch: Partial<WallpaperSettings>) {
    const pendingGesture = wallpaperGestureValue.current;
    if (wallpaperFrame.current !== null) {
      window.cancelAnimationFrame(wallpaperFrame.current);
      wallpaperFrame.current = null;
    }
    if (wallpaperWheelCommit.current !== null) {
      window.clearTimeout(wallpaperWheelCommit.current);
      wallpaperWheelCommit.current = null;
    }
    wallpaperGestureValue.current = null;
    setWallpaperGesturePreview(null);
    document.documentElement.classList.remove("wallpaper-positioning");
    setDraft((current) => ({
      ...current,
      wallpaper: { ...current.wallpaper, ...pendingGesture, ...patch },
    }));
  }

  function applyWallpaperGesture(value: {
    positionX: number;
    positionY: number;
    zoom: number;
  }) {
    const shell = document.querySelector<HTMLElement>("[data-app-shell]");
    shell?.style.setProperty("--wallpaper-position-x", `${value.positionX}%`);
    shell?.style.setProperty("--wallpaper-position-y", `${value.positionY}%`);
    shell?.style.setProperty("--wallpaper-zoom", String(value.zoom / 100));
  }

  function scheduleWallpaperGesture(value: {
    positionX: number;
    positionY: number;
    zoom: number;
  }) {
    wallpaperGestureValue.current = value;
    if (wallpaperFrame.current !== null) return;
    wallpaperFrame.current = window.requestAnimationFrame(() => {
      wallpaperFrame.current = null;
      const next = wallpaperGestureValue.current;
      if (!next) return;
      applyWallpaperGesture(next);
      setWallpaperGesturePreview(next);
    });
  }

  function commitWallpaperGesture() {
    const next = wallpaperGestureValue.current;
    if (wallpaperWheelCommit.current !== null) {
      window.clearTimeout(wallpaperWheelCommit.current);
      wallpaperWheelCommit.current = null;
    }
    if (!next) {
      document.documentElement.classList.remove("wallpaper-positioning");
      return;
    }
    if (wallpaperFrame.current !== null) {
      window.cancelAnimationFrame(wallpaperFrame.current);
      wallpaperFrame.current = null;
      applyWallpaperGesture(next);
    }
    wallpaperGestureValue.current = null;
    setWallpaperGesturePreview(null);
    setDraft((current) => ({
      ...current,
      wallpaper: { ...current.wallpaper, ...next },
    }));
    document.documentElement.classList.remove("wallpaper-positioning");
  }

  function startWallpaperDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    wallpaperDragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPositionX: previewWallpaper.positionX,
      startPositionY: previewWallpaper.positionY,
    };
    wallpaperGestureValue.current = {
      positionX: previewWallpaper.positionX,
      positionY: previewWallpaper.positionY,
      zoom: previewWallpaper.zoom,
    };
    document.documentElement.classList.add("wallpaper-positioning");
    event.currentTarget.classList.add("is-dragging");
  }

  function dragWallpaper(event: PointerEvent<HTMLDivElement>) {
    const active = wallpaperDragState.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - active.startClientX) / bounds.width) * 100;
    const deltaY = ((event.clientY - active.startClientY) / bounds.height) * 100;
    scheduleWallpaperGesture({
      positionX: clamp(active.startPositionX - deltaX, 0, 100),
      positionY: clamp(active.startPositionY - deltaY, 0, 100),
      zoom: wallpaperGestureValue.current?.zoom ?? draft.wallpaper.zoom,
    });
  }

  function finishWallpaperDrag(event: PointerEvent<HTMLDivElement>) {
    if (wallpaperDragState.current?.pointerId !== event.pointerId) return;
    wallpaperDragState.current = null;
    commitWallpaperGesture();
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function zoomWallpaper(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const delta =
      event.deltaY *
      (event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? event.currentTarget.clientHeight
          : 1);
    const current = wallpaperGestureValue.current ?? {
      positionX: draft.wallpaper.positionX,
      positionY: draft.wallpaper.positionY,
      zoom: draft.wallpaper.zoom,
    };
    document.documentElement.classList.add("wallpaper-positioning");
    scheduleWallpaperGesture({
      ...current,
      zoom: Math.round(clamp(current.zoom - delta * 0.08, 50, 300) * 10) / 10,
    });
    if (wallpaperWheelCommit.current !== null) {
      window.clearTimeout(wallpaperWheelCommit.current);
    }
    wallpaperWheelCommit.current = window.setTimeout(() => {
      wallpaperWheelCommit.current = null;
      commitWallpaperGesture();
    }, 140);
  }

  function moveWallpaperWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 5 : 1;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    updateWallpaper({
      positionX: clamp(
        draft.wallpaper.positionX +
          (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0),
        0,
        100,
      ),
      positionY: clamp(
        draft.wallpaper.positionY +
          (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
        0,
        100,
      ),
    });
  }

  async function chooseLocalWallpaper(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setWallpaperError("");
    setIsProcessing(true);
    try {
      if (file.size > MAX_WALLPAPER_BYTES) {
        throw new Error("图片不能超过 20MB");
      }
      const blob = await prepareWallpaper(file);
      const id = crypto.randomUUID();
      await saveWallpaperBlob(id, blob);
      setDraft((current) => ({
        ...current,
        wallpaper: {
          ...current.wallpaper,
          source: "local",
          localAssetId: id,
          url: undefined,
        },
      }));
    } catch (error) {
      setWallpaperError(
        error instanceof Error ? error.message : "无法处理这张图片",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function closeWithoutSaving() {
    if (wallpaperFrame.current !== null) {
      window.cancelAnimationFrame(wallpaperFrame.current);
      wallpaperFrame.current = null;
    }
    if (wallpaperWheelCommit.current !== null) {
      window.clearTimeout(wallpaperWheelCommit.current);
      wallpaperWheelCommit.current = null;
    }
    wallpaperGestureValue.current = null;
    setWallpaperGesturePreview(null);
    setWallpaperEditing(false);
    setDiscardPromptOpen(false);
    document.documentElement.classList.remove("wallpaper-positioning");
    onPreview(null);
    onOpenChange(false);
  }

  function saveAndClose() {
    const brandName = draft.brand.name.trim();
    if (!brandName) {
      setSection("appearance");
      setLogoError("请输入品牌名称");
      return;
    }
    if (
      draft.brand.logoSource === "url" &&
      !isHttpImageUrl(draft.brand.logoUrl)
    ) {
      setSection("appearance");
      setLogoError("网络 Logo 地址需要以 http:// 或 https:// 开头");
      return;
    }
    if (
      draft.wallpaper.source === "url" &&
      !/^https?:\/\//i.test(draft.wallpaper.url ?? "")
    ) {
      setSection("wallpaper");
      setWallpaperError("网络壁纸地址需要以 http:// 或 https:// 开头");
      return;
    }
    const pendingWallpaper = wallpaperGestureValue.current;
    onSave(
      pendingWallpaper
        ? {
            ...draft,
            brand: { ...draft.brand, name: brandName },
            wallpaper: { ...draft.wallpaper, ...pendingWallpaper },
          }
        : { ...draft, brand: { ...draft.brand, name: brandName } },
    );
    wallpaperGestureValue.current = null;
    setWallpaperGesturePreview(null);
    document.documentElement.classList.remove("wallpaper-positioning");
    onPreview(null);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog.Root
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeWithoutSaving();
          else onOpenChange(true);
        }}
      >
        <Dialog.Portal>
        {!wallpaperEditing && (
          <div
            className="settings-outside-dismiss-layer"
            style={{ right: panelWidth }}
            aria-hidden="true"
            data-testid="settings-outside-dismiss-layer"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (hasUnsavedChanges) setDiscardPromptOpen(true);
              else closeWithoutSaving();
            }}
          />
        )}
        {wallpaperEditing && draft.wallpaper.source !== "none" && (
          <div
            className="wallpaper-edit-canvas"
            style={{ right: panelWidth }}
            role="application"
            tabIndex={0}
            aria-label="拖动壁纸调整位置，滚轮缩放，方向键微调"
            onPointerDown={startWallpaperDrag}
            onPointerMove={dragWallpaper}
            onPointerUp={finishWallpaperDrag}
            onPointerCancel={finishWallpaperDrag}
            onLostPointerCapture={finishWallpaperDrag}
            onWheel={zoomWallpaper}
            onKeyDown={moveWallpaperWithKeyboard}
          >
            <div
              className="wallpaper-edit-hud"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <ArrowsOutCardinal size={17} />
              <span>拖动定位 · 滚轮缩放</span>
              <button
                type="button"
                onClick={() => updateWallpaper({ positionX: 50, positionY: 50 })}
              >
                <Crosshair size={16} />居中
              </button>
              <button
                type="button"
                onClick={() => {
                  commitWallpaperGesture();
                  setWallpaperEditing(false);
                }}
              >
                完成
              </button>
            </div>
          </div>
        )}
          <Dialog.Content
          className="settings-panel"
          aria-labelledby={titleId}
          style={{ width: panelWidth }}
          onEscapeKeyDown={() => onPreview(null)}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div
            className="settings-resize-handle"
            role="separator"
            tabIndex={0}
            aria-label="调整设置栏宽度"
            aria-orientation="vertical"
            aria-valuemin={MIN_PANEL_WIDTH}
            aria-valuemax={getMaximumPanelWidth()}
            aria-valuenow={Math.round(panelWidth)}
            title="左右拖动调整设置栏宽度，双击恢复默认宽度"
            onPointerDown={startResize}
            onPointerMove={resizePanel}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            onLostPointerCapture={finishResize}
            onDoubleClick={resetPanelWidth}
            onKeyDown={resizeWithKeyboard}
          >
            <span aria-hidden="true" />
          </div>
          <div className="settings-header">
            <div>
              <Dialog.Title id={titleId} className="dialog-title">
                设置
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                调整后会立即预览，保存后保留。
              </Dialog.Description>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="关闭设置"
              onClick={closeWithoutSaving}
            >
              <X size={19} />
            </button>
          </div>

          <div className="settings-tabs" role="tablist" aria-label="设置分类">
            <button
              type="button"
              role="tab"
              aria-selected={section === "appearance"}
              className={section === "appearance" ? "active" : ""}
              onClick={() => setSection("appearance")}
            >
              <PaintBrush size={17} />外观
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === "wallpaper"}
              className={section === "wallpaper" ? "active" : ""}
              onClick={() => setSection("wallpaper")}
            >
              <ImageIcon size={17} />壁纸
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === "data"}
              className={section === "data" ? "active" : ""}
              onClick={() => setSection("data")}
            >
              <SlidersHorizontal size={17} />数据
            </button>
          </div>

          <div className="settings-body">
            {section === "appearance" && (
              <div className="settings-section">
                <fieldset className="settings-group brand-settings-card">
                  <legend>品牌</legend>
                  <div className="brand-settings-preview">
                    <BrandMark
                      brand={draft.brand}
                      preview
                      onImageError={() =>
                        setLogoError("这张网络 Logo 暂时无法加载，已回退默认图标")
                      }
                    />
                    <div>
                      <strong>{draft.brand.name.trim() || "Mysimple"}</strong>
                      <span>顶部品牌实时预览</span>
                    </div>
                  </div>

                  <label className="settings-field">
                    <span>品牌名称</span>
                    <input
                      type="text"
                      aria-label="品牌名称"
                      maxLength={32}
                      value={draft.brand.name}
                      placeholder="Mysimple"
                      onChange={(event) =>
                        updateBrand({ name: event.target.value.slice(0, 32) })
                      }
                    />
                    <small>{draft.brand.name.length}/32</small>
                  </label>

                  <div className="brand-visibility-options">
                    <label className="toggle-row compact-toggle-row">
                      <span><strong>显示 Logo</strong></span>
                      <input
                        type="checkbox"
                        checked={draft.brand.showLogo}
                        onChange={(event) =>
                          updateBrand({ showLogo: event.target.checked })
                        }
                      />
                    </label>
                    <label className="toggle-row compact-toggle-row">
                      <span><strong>显示品牌名称</strong></span>
                      <input
                        type="checkbox"
                        checked={draft.brand.showName}
                        onChange={(event) =>
                          updateBrand({ showName: event.target.checked })
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
                        aria-checked={draft.brand.logoSource === "default"}
                        className={draft.brand.logoSource === "default" ? "active" : ""}
                        onClick={() =>
                          updateBrand({
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
                        aria-checked={draft.brand.logoSource === "local"}
                        className={draft.brand.logoSource === "local" ? "active" : ""}
                        onClick={() =>
                          draft.brand.logoDataUrl
                            ? updateBrand({ logoSource: "local", logoUrl: undefined })
                            : logoFileRef.current?.click()
                        }
                      >
                        {logoProcessing ? "正在处理…" : "本地图片"}
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={draft.brand.logoSource === "url"}
                        className={draft.brand.logoSource === "url" ? "active" : ""}
                        onClick={() =>
                          updateBrand({ logoSource: "url", logoDataUrl: undefined })
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
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={chooseLocalLogo}
                  />
                  {draft.brand.logoSource === "local" && (
                    <button
                      type="button"
                      className="button secondary-button brand-replace-button"
                      onClick={() => logoFileRef.current?.click()}
                      disabled={logoProcessing}
                    >
                      <UploadSimple size={17} />更换本地 Logo
                    </button>
                  )}
                  {draft.brand.logoSource === "url" && (
                    <label className="settings-field">
                      <span>网络 Logo 地址</span>
                      <input
                        type="url"
                        aria-label="网络 Logo 地址"
                        placeholder="https://example.com/logo.png"
                        value={draft.brand.logoUrl ?? ""}
                        onChange={(event) =>
                          updateBrand({ logoUrl: event.target.value })
                        }
                      />
                    </label>
                  )}
                  {logoError && (
                    <p className="field-error" role="alert">{logoError}</p>
                  )}
                  <button
                    type="button"
                    className="text-action brand-reset-action"
                    onClick={() => {
                      setLogoError("");
                      setDraft((current) => ({
                        ...current,
                        brand: { ...DEFAULT_BRAND },
                      }));
                    }}
                  >
                    <ArrowCounterClockwise size={16} />恢复默认品牌
                  </button>
                </fieldset>

                <fieldset className="settings-group">
                  <legend>主题</legend>
                  <div className="segmented-control">
                    {(["system", "light", "dark"] as ThemePreference[]).map(
                      (value) => (
                        <button
                          key={value}
                          type="button"
                          className={
                            draft.themePreference === value ? "active" : ""
                          }
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              themePreference: value,
                            }))
                          }
                        >
                          {value === "system"
                            ? "跟随系统"
                            : value === "light"
                              ? "浅色"
                              : "深色"}
                        </button>
                      ),
                    )}
                  </div>
                </fieldset>

                <fieldset className="settings-group">
                  <legend>强调色</legend>
                  <div className="accent-grid">
                    {ACCENTS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="accent-swatch"
                        style={{ backgroundColor: color }}
                        aria-label={`使用颜色 ${color}`}
                        aria-pressed={draft.appearance.accentColor === color}
                        onClick={() => updateAppearance({ accentColor: color })}
                      >
                        {draft.appearance.accentColor === color && (
                          <Check size={16} weight="bold" />
                        )}
                      </button>
                    ))}
                    <CustomColorPicker
                      value={draft.appearance.accentColor}
                      selected={!ACCENTS.includes(draft.appearance.accentColor)}
                      onChange={(accentColor) => updateAppearance({ accentColor })}
                    />
                  </div>
                </fieldset>

                <fieldset className="settings-group">
                  <legend>布局预设</legend>
                  <div className="layout-presets">
                    {(["compact", "standard", "spacious"] as const).map(
                      (preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={
                            draft.appearance.layoutPreset === preset
                              ? "active"
                              : ""
                          }
                          onClick={() => choosePreset(preset)}
                        >
                          <span
                            className={`layout-preview layout-preview-${preset}`}
                          >
                            <i />
                            <i />
                            <i />
                          </span>
                          {preset === "compact"
                            ? "紧凑"
                            : preset === "standard"
                              ? "标准"
                              : "宽松"}
                        </button>
                      ),
                    )}
                  </div>
                </fieldset>

                <button
                  type="button"
                  className="advanced-toggle"
                  aria-expanded={advanced}
                  onClick={() => setAdvanced((value) => !value)}
                >
                  <SlidersHorizontal size={17} />
                  高级微调
                  <span>{advanced ? "收起" : "展开"}</span>
                </button>

                {advanced && (
                  <div className="advanced-editor">
                    <div
                      className="advanced-section-tabs"
                      role="tablist"
                      aria-label="高级微调分类"
                    >
                      {([
                        { value: "global" as const, label: "全局", icon: SlidersHorizontal },
                        { value: "brand" as const, label: "品牌", icon: PaintBrush },
                        { value: "header" as const, label: "顶栏搜索", icon: MagnifyingGlass },
                        { value: "groups" as const, label: "分组", icon: SquaresFour },
                        { value: "cards" as const, label: "卡片", icon: ImageIcon },
                      ]).map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            role="tab"
                            aria-selected={advancedSection === item.value}
                            className={advancedSection === item.value ? "active" : ""}
                            onClick={() => setAdvancedSection(item.value)}
                          >
                            <Icon size={16} />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div
                      className="advanced-controls"
                      role="tabpanel"
                      aria-label={`高级微调：${advancedSection}`}
                    >
                      <div className="advanced-controls-header">
                        <strong>
                          {advancedSection === "global"
                            ? "全局界面"
                            : advancedSection === "brand"
                              ? "品牌 Logo"
                              : advancedSection === "header"
                                ? "顶栏与搜索"
                                : advancedSection === "groups"
                                  ? "分组选择栏"
                                  : "网站卡片"}
                        </strong>
                        <button
                          type="button"
                          onClick={() => resetAdvancedSection(advancedSection)}
                        >
                          恢复本组默认值
                        </button>
                      </div>
                      {RANGE_FIELD_GROUPS[advancedSection].map((field) => (
                        <label key={field.key} className="range-control">
                          <span>
                            <span>
                              {field.label}
                              {field.description && <small>{field.description}</small>}
                            </span>
                            <output>
                              {draft.appearance[field.key]}
                              {field.suffix}
                            </output>
                          </span>
                          <input
                            type="range"
                            aria-label={field.label}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            value={draft.appearance[field.key]}
                            onChange={(event) =>
                              updateAppearance({
                                [field.key]: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="text-action"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      appearance: { ...DEFAULT_APPEARANCE },
                      themePreference: "system",
                    }))
                  }
                >
                  <ArrowCounterClockwise size={16} />
                  恢复默认外观
                </button>
              </div>
            )}

            {section === "wallpaper" && (
              <div className="settings-section">
                <div className="wallpaper-source-actions">
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={() => wallpaperFileRef.current?.click()}
                    disabled={isProcessing}
                  >
                    <UploadSimple size={17} />
                    {isProcessing ? "正在优化…" : "选择本地图片"}
                  </button>
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        wallpaper: { ...DEFAULT_WALLPAPER },
                      }))
                    }
                  >
                    <Trash size={17} />清除壁纸
                  </button>
                </div>
                <input
                  ref={wallpaperFileRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  onChange={chooseLocalWallpaper}
                />
                <label className="settings-field">
                  <span>网络图片地址</span>
                  <input
                    type="url"
                    placeholder="https://example.com/wallpaper.jpg"
                    value={
                      draft.wallpaper.source === "url"
                        ? (draft.wallpaper.url ?? "")
                        : ""
                    }
                    onChange={(event) => {
                      setWallpaperError("");
                      setDraft((current) => ({
                        ...current,
                        wallpaper: {
                          ...current.wallpaper,
                          source: event.target.value ? "url" : "none",
                          url: event.target.value,
                          localAssetId: undefined,
                        },
                      }));
                    }}
                  />
                </label>
                {wallpaperError && (
                  <p className="field-error" role="alert">
                    {wallpaperError}
                  </p>
                )}
                {!wallpaperError && wallpaperLoadError && (
                  <p className="field-error" role="alert">
                    {wallpaperLoadError}
                  </p>
                )}

                <fieldset className="settings-group">
                  <legend>填充方式</legend>
                  <div className="segmented-control">
                    {(["cover", "contain"] as const).map((fit) => (
                      <button
                        key={fit}
                        type="button"
                        className={draft.wallpaper.fit === fit ? "active" : ""}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            wallpaper: { ...current.wallpaper, fit },
                          }))
                        }
                      >
                        {fit === "cover" ? "铺满" : "完整显示"}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="wallpaper-position-actions">
                  <button
                    type="button"
                    className={`button secondary-button ${
                      wallpaperEditing ? "active" : ""
                    }`}
                    disabled={draft.wallpaper.source === "none"}
                    onClick={() => setWallpaperEditing((current) => !current)}
                  >
                    <ArrowsOutCardinal size={17} />
                    {wallpaperEditing ? "正在调整位置" : "在页面拖动调整"}
                  </button>
                  <button
                    type="button"
                    className="button secondary-button"
                    disabled={draft.wallpaper.source === "none"}
                    onClick={() =>
                      updateWallpaper({
                        positionX: 50,
                        positionY: 50,
                        zoom: 100,
                      })
                    }
                  >
                    <Crosshair size={17} />居中复位
                  </button>
                </div>

                <label className="range-control">
                  <span>
                    缩放
                    <output>{previewWallpaper.zoom}%</output>
                  </span>
                  <input
                    type="range"
                    aria-label="缩放"
                    min="50"
                    max="300"
                    step="1"
                    value={previewWallpaper.zoom}
                    onChange={(event) =>
                      updateWallpaper({ zoom: Number(event.target.value) })
                    }
                  />
                </label>

                <label className="range-control">
                  <span>
                    模糊
                    <output>{draft.wallpaper.blur}px</output>
                  </span>
                  <input
                    type="range"
                    aria-label="模糊"
                    min="0"
                    max="20"
                    value={draft.wallpaper.blur}
                    onChange={(event) =>
                      updateWallpaper({ blur: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="range-control">
                  <span>
                    明暗遮罩
                    <output>{draft.wallpaper.overlay}%</output>
                  </span>
                  <input
                    type="range"
                    aria-label="明暗遮罩"
                    min="0"
                    max="80"
                    value={draft.wallpaper.overlay}
                    onChange={(event) =>
                      updateWallpaper({ overlay: Number(event.target.value) })
                    }
                  />
                </label>

                <fieldset className="settings-group topbar-material-settings">
                  <legend>顶部栏玻璃效果</legend>
                  <label className="toggle-row">
                    <span>
                      <strong>模糊壁纸</strong>
                      <small>关闭后顶部栏保持透明材质</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={draft.wallpaper.topbarBlurEnabled}
                      onChange={(event) =>
                        updateWallpaper({
                          topbarBlurEnabled: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <label className="range-control">
                    <span>
                      模糊强度
                      <output>{draft.wallpaper.topbarBlur}px</output>
                    </span>
                      <input
                        type="range"
                        aria-label="模糊强度"
                        min="0"
                        max="30"
                      value={draft.wallpaper.topbarBlur}
                      disabled={!draft.wallpaper.topbarBlurEnabled}
                      onChange={(event) =>
                        updateWallpaper({ topbarBlur: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="range-control">
                    <span>
                      背景透明度
                      <output>{draft.wallpaper.topbarOpacity}%</output>
                    </span>
                  <input
                    type="range"
                    aria-label="背景透明度"
                    min="0"
                    max="100"
                      value={draft.wallpaper.topbarOpacity}
                      onChange={(event) =>
                        updateWallpaper({ topbarOpacity: Number(event.target.value) })
                      }
                    />
                  </label>
                </fieldset>
              </div>
            )}

            {section === "data" && (
              <div className="settings-section data-settings">
                <div className="settings-data-card">
                  <div>
                    <strong>导入与导出</strong>
                    <p>导出不包含搜索历史和本地壁纸文件。</p>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="button secondary-button"
                      onClick={onImport}
                    >
                      <UploadSimple size={17} />导入
                    </button>
                    <button
                      type="button"
                      className="button secondary-button"
                      onClick={onExport}
                    >
                      <DownloadSimple size={17} />导出
                    </button>
                  </div>
                </div>
                <div className="settings-data-card">
                  <div>
                    <strong>最近搜索</strong>
                    <p>当前保存 {state.searchHistory.length} 条，仅存于本设备。</p>
                  </div>
                  <button
                    type="button"
                    className="button secondary-button"
                    disabled={!state.searchHistory.length}
                    onClick={onClearHistory}
                  >
                    清空历史
                  </button>
                </div>
                <div className="settings-data-card trash-settings-card">
                  <div className="trash-settings-summary">
                    <div>
                      <strong>链接回收站</strong>
                      <p>
                        当前有 {state.deletedSites.length} 个链接，可手动恢复或永久删除。
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button secondary-button trash-toggle-button"
                      aria-expanded={trashOpen}
                      onClick={() => {
                        clearArmedTrashDelete();
                        setTrashOpen((current) => !current);
                      }}
                    >
                      {trashOpen ? <CaretUp size={16} /> : <CaretDown size={16} />}
                      {trashOpen ? "收起" : "查看"}
                    </button>
                  </div>
                  {trashOpen && (
                    <div className="trash-settings-content">
                      <label className="trash-retention-field">
                        <span>自动清理</span>
                        <select
                          aria-label="回收站自动清理期限"
                          value={state.trashRetentionDays ?? "never"}
                          onChange={(event) =>
                            onTrashRetentionChange(
                              event.target.value === "never"
                                ? null
                                : (Number(event.target.value) as TrashRetentionDays),
                            )
                          }
                        >
                          <option value="7">7 天后</option>
                          <option value="30">30 天后</option>
                          <option value="90">90 天后</option>
                          <option value="never">永不自动清理</option>
                        </select>
                      </label>

                      {state.deletedSites.length > 0 ? (
                        <>
                          <div className="trash-list" aria-label="已删除链接">
                            {state.deletedSites
                              .slice()
                              .sort(
                                (a, b) =>
                                  Date.parse(b.deletedAt) - Date.parse(a.deletedAt),
                              )
                              .map((entry) => {
                                const armed = armedTrashDeleteId === entry.site.id;
                                return (
                                  <div className="trash-item" key={entry.site.id}>
                                    <Favicon site={entry.site} size="normal" />
                                    <span className="trash-item-copy">
                                      <strong title={entry.site.name}>{entry.site.name}</strong>
                                      <small>
                                        {getHostname(entry.site.url)} · {entry.originalGroupName}
                                      </small>
                                      <small>
                                        {formatTrashDate(entry.deletedAt)} ·{" "}
                                        {getTrashRemainingLabel(
                                          entry.deletedAt,
                                          state.trashRetentionDays,
                                        )}
                                      </small>
                                    </span>
                                    <span className="trash-item-actions">
                                      <button
                                        type="button"
                                        className="icon-button"
                                        aria-label={`恢复 ${entry.site.name}`}
                                        title="恢复链接"
                                        onClick={() => onRestoreSite(entry.site.id)}
                                      >
                                        <ArrowCounterClockwise size={16} />
                                      </button>
                                      <button
                                        type="button"
                                        className={`icon-button danger-action ${
                                          armed ? "is-delete-armed" : ""
                                        }`}
                                        data-trash-delete-id={entry.site.id}
                                        aria-pressed={armed}
                                        aria-label={
                                          armed
                                            ? `再次点击永久删除 ${entry.site.name}`
                                            : `永久删除 ${entry.site.name}`
                                        }
                                        title={armed ? "再次点击永久删除" : "永久删除"}
                                        onClick={() =>
                                          requestTrashDelete(entry.site.id, () =>
                                            onPermanentDeleteSite(entry.site.id),
                                          )
                                        }
                                      >
                                        <Trash size={16} />
                                      </button>
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                          <div className="trash-bulk-actions">
                            <button
                              type="button"
                              className="button secondary-button"
                              onClick={onRestoreAllSites}
                            >
                              <ArrowCounterClockwise size={16} />全部恢复
                            </button>
                            <button
                              type="button"
                              className={`button destructive-button ${
                                armedTrashDeleteId === "__all__"
                                  ? "is-delete-armed"
                                  : ""
                              }`}
                              data-trash-delete-id="__all__"
                              aria-pressed={armedTrashDeleteId === "__all__"}
                              onClick={() =>
                                requestTrashDelete("__all__", onEmptyTrash)
                              }
                            >
                              <Trash size={16} />
                              {armedTrashDeleteId === "__all__"
                                ? "再次点击清空"
                                : "清空回收站"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="trash-empty-state">回收站是空的。</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="settings-data-card danger-zone">
                  <div>
                    <strong>恢复默认收藏</strong>
                    <p>只替换网站、分组和排序，保留当前外观与壁纸。</p>
                  </div>
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={onResetBookmarks}
                  >
                    <ArrowCounterClockwise size={17} />恢复默认
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="settings-footer">
            <button
              type="button"
              className="button secondary-button"
              onClick={closeWithoutSaving}
            >
              取消
            </button>
            <button
              type="button"
              className="button primary-button"
              onClick={saveAndClose}
            >
              保存设置
            </button>
          </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmDialog
        open={discardPromptOpen}
        title="放弃未保存的设置？"
        description="当前预览还没有保存。放弃后会恢复进入设置前的外观。"
        confirmLabel="放弃更改"
        cancelLabel="继续编辑"
        destructive
        onOpenChange={setDiscardPromptOpen}
        onConfirm={closeWithoutSaving}
      />
    </>
  );
}
