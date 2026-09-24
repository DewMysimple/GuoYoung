import { DataSettingsEditor } from "./data-settings-editor";
import { WallpaperSettingsEditor } from "./wallpaper-settings-editor";
import { useSettingsPanelWidth, DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH } from "../hooks/use-settings-panel-width";
import { ResizeHandle } from "./resize-handle";
import { TopbarResizeHandle } from "./topbar-resize-handle";
import { patchAppearance } from "../lib/appearance-settings";
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
  Crosshair,
  Image as ImageIcon,
  PaintBrush,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_BRAND,
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
  wallpaperPreviewUrl?: string;
}

export type SettingsSection = "appearance" | "wallpaper" | "data";

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
  wallpaperPreviewUrl,
}: SettingsPanelProps) {
  const titleId = useId();
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
  const [previousPreset, setPreviousPreset] = useState(state.appearance);
  const [section, setSection] = useState<SettingsSection>("appearance");
  const [logoError, setLogoError] = useState("");
  const logoImport = useImageImport(open);
  const logoProcessing = logoImport.pending;
  const [wallpaperError, setWallpaperError] = useState("");
  const wallpaperImport = useImageImport(open);
  const isProcessing = wallpaperImport.pending;
  const { width: panelWidth, maxWidth: panelMaxWidth, changeWidth, rememberWidth } = useSettingsPanelWidth(open);
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
    setPreviousPreset(nextDraft.appearance);
    setSection(initialSection ?? "appearance");
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
    if (open) onPreview(draft);
  }, [draft, open, onPreview]);

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
          <ResizeHandle label="调整设置栏宽度" axis="x" direction={-1} step={24}
            value={panelWidth} min={MIN_PANEL_WIDTH} max={panelMaxWidth} defaultValue={DEFAULT_PANEL_WIDTH}
            className="settings-resize-handle" onChange={changeWidth} onCommit={rememberWidth} />
          {!wallpaperEditing && <TopbarResizeHandle value={draft.appearance.topbarHeight} panelWidth={panelWidth}
            onChange={(topbarHeight) => setDraft((current) => ({ ...current, appearance: patchAppearance(current.appearance, { topbarHeight }) }))} />}
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
                <AppearanceSettingsEditor value={draft.appearance} previousPreset={previousPreset} onPresetChange={setPreviousPreset}
                  panelWidth={panelWidth} panelMaxWidth={panelMaxWidth} onPanelWidthChange={rememberWidth}
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

            {section === "wallpaper" && <WallpaperSettingsEditor value={previewWallpaper}
              imageUrl={wallpaperPreviewUrl} error={wallpaperError || wallpaperImport.error || wallpaperLoadError}
              processing={isProcessing} editing={wallpaperEditing}
              onChange={(patch) => { setWallpaperError(""); updateWallpaper(patch); }} onChoose={chooseLocalWallpaper}
              onToggleEditing={() => { commitWallpaperGesture(); setWallpaperEditing((current) => !current); }} />}

            {section === "data" && <DataSettingsEditor state={state} initialTrashOpen={initialTrashOpen}
              onExport={onExport} onImport={onImport} onResetBookmarks={onResetBookmarks} onClearHistory={onClearHistory} onRestoreSite={onRestoreSite} onRestoreAllSites={onRestoreAllSites} onPermanentDeleteSite={onPermanentDeleteSite} onEmptyTrash={onEmptyTrash} onTrashRetentionChange={onTrashRetentionChange} /> }
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
