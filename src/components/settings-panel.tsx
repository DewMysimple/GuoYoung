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
  ArrowLeft,
  ArrowCounterClockwise,
  ArrowsOutCardinal,
  CaretDown,
  CaretUp,
  Crosshair,
  DownloadSimple,
  Image as ImageIcon,
  PaintBrush,
  SlidersHorizontal,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_BRAND,
  DEFAULT_WALLPAPER,
} from "../data/defaults";
import {
  isHttpImageUrl,
  prepareBrandLogo,
} from "../lib/brand-logo";
import {
  prepareWallpaper,
  saveWallpaperBlob,
} from "../lib/wallpaper-store";
import type {
  AppearanceSettings,
  BrandSettings,
  SiteCollectionState,
  TrashRetentionDays,
  WallpaperSettings,
} from "../types";
import { useImageImport } from "../hooks/use-image-import";
import { ConfirmDialog } from "./confirm-dialog";
import { AppearanceSettingsEditor } from "./appearance-settings";
import { BrandSettingsEditor } from "./brand-settings-editor";
import { Favicon } from "./favicon";
import { getHostname } from "../lib/site-utils";

export interface SettingsDraft {
  brand: BrandSettings;
  appearance: AppearanceSettings;
  wallpaper: WallpaperSettings;
}

interface SettingsPanelProps {
  open: boolean;
  state: SiteCollectionState;
  initialSection?: SettingsSection;
  initialTrashOpen?: boolean;
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

export type SettingsSection = "appearance" | "wallpaper" | "data";

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

function cloneDraft(state: SiteCollectionState): SettingsDraft {
  return {
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
  initialSection,
  initialTrashOpen = false,
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
  const [section, setSection] = useState<SettingsSection>("appearance");
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
  const logoImport = useImageImport(open);
  const logoProcessing = logoImport.pending;
  const [wallpaperError, setWallpaperError] = useState("");
  const wallpaperImport = useImageImport(open);
  const isProcessing = wallpaperImport.pending;
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
    setSection(initialSection ?? "appearance");
    setTrashOpen(initialTrashOpen);
    setLogoError("");
    setWallpaperError("");
    setWallpaperEditing(false);
    setDiscardPromptOpen(false);
  }, [open, initialSection, initialTrashOpen]);

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

  function updateBrand(patch: Partial<BrandSettings>) {
    if (patch.logoSource !== undefined) logoImport.cancel();
    setLogoError("");
    setDraft((current) => ({
      ...current,
      brand: { ...current.brand, ...patch },
    }));
  }

  async function chooseLocalLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setLogoError("");
    await logoImport.run(() => prepareBrandLogo(file), (logoDataUrl) => {
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
    });
  }

  function updateWallpaper(patch: Partial<WallpaperSettings>) {
    if (patch.source !== undefined) wallpaperImport.cancel();
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
    await wallpaperImport.run(async () => {
      const blob = await prepareWallpaper(file);
      const id = crypto.randomUUID();
      await saveWallpaperBlob(id, blob);
      return id;
    }, (id) => {
      setDraft((current) => ({
        ...current,
        wallpaper: {
          ...current.wallpaper,
          source: "local",
          localAssetId: id,
          url: undefined,
        },
      }));
    });
  }

  function closeWithoutSaving() {
    logoImport.cancel();
    wallpaperImport.cancel();
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
      !isHttpImageUrl(draft.wallpaper.url)
    ) {
      setSection("wallpaper");
      setWallpaperError("网络壁纸地址需要以 http:// 或 https:// 开头");
      return;
    }
    const pendingWallpaper = wallpaperGestureValue.current;
    logoImport.cancel();
    wallpaperImport.cancel();
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
            <div className="panel-header-actions">
              <button
                type="button"
                className="panel-back-button"
                aria-label="返回收藏主页"
                onClick={closeWithoutSaving}
              >
                <ArrowLeft size={16} />
                返回
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭设置"
                onClick={closeWithoutSaving}
              >
                <X size={19} />
              </button>
            </div>
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
              <div className="settings-section appearance-settings">
                <AppearanceSettingsEditor value={draft.appearance}
                  onChange={(appearance) => setDraft((current) => ({ ...current, appearance }))} />
                <BrandSettingsEditor value={draft.brand}
                  error={logoError || logoImport.error} logoProcessing={logoProcessing}
                  onChange={updateBrand} onChooseLogo={chooseLocalLogo} onError={setLogoError}
                  onReset={() => updateBrand({ ...DEFAULT_BRAND, logoUrl: undefined, logoDataUrl: undefined })} />
                <button type="button" className="text-action appearance-reset"
                  onClick={() => setDraft((current) => ({ ...current, appearance: { ...DEFAULT_APPEARANCE } }))}>
                  <ArrowCounterClockwise size={16} />恢复默认外观
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
                    onClick={() => updateWallpaper({ ...DEFAULT_WALLPAPER })}
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
                      updateWallpaper({
                        source: event.target.value ? "url" : "none",
                        url: event.target.value,
                        localAssetId: undefined,
                      });
                    }}
                  />
                </label>
                {(wallpaperError || wallpaperImport.error) && (
                  <p className="field-error" role="alert">
                    {wallpaperError || wallpaperImport.error}
                  </p>
                )}
                {!wallpaperError && !wallpaperImport.error && wallpaperLoadError && (
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
