import type { SiteCollectionState } from "../types";
import { parseStoredState } from "./storage";

export const SITE_HUB_EXPORT_FORMAT = "site-hub-export";
export const SITE_HUB_EXPORT_VERSION = 1;

export interface SiteHubExport {
  format: typeof SITE_HUB_EXPORT_FORMAT;
  exportVersion: typeof SITE_HUB_EXPORT_VERSION;
  exportedAt: string;
  state: SiteCollectionState;
}

export function createExportPayload(
  state: SiteCollectionState,
  exportedAt = new Date().toISOString(),
): SiteHubExport {
  const exportableState: SiteCollectionState = {
    ...state,
    deletedSites: [],
    searchHistory: [],
    wallpaper:
      state.wallpaper.source === "local"
        ? {
            ...state.wallpaper,
            source: "none",
            localAssetId: undefined,
          }
        : { ...state.wallpaper },
  };
  return {
    format: SITE_HUB_EXPORT_FORMAT,
    exportVersion: SITE_HUB_EXPORT_VERSION,
    exportedAt,
    state: exportableState,
  };
}

export function serializeExport(state: SiteCollectionState): string {
  return JSON.stringify(createExportPayload(state), null, 2);
}

export function parseImportFile(text: string): SiteCollectionState {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON 格式");
  }

  if (!value || typeof value !== "object") {
    throw new Error("文件中没有可识别的收藏数据");
  }

  const candidate = value as Record<string, unknown>;
  let rawState: unknown = value;
  if ("format" in candidate || "exportVersion" in candidate || "state" in candidate) {
    if (
      candidate.format !== SITE_HUB_EXPORT_FORMAT ||
      candidate.exportVersion !== SITE_HUB_EXPORT_VERSION ||
      !candidate.state
    ) {
      throw new Error("导出文件格式或版本不受支持");
    }
    rawState = candidate.state;
  }

  const loaded = parseStoredState(JSON.stringify(rawState));
  if (loaded.recovered) {
    throw new Error("收藏数据结构无效，未导入任何内容");
  }
  return loaded.state.wallpaper.source === "local"
    ? {
        ...loaded.state,
        wallpaper: {
          ...loaded.state.wallpaper,
          source: "none",
          localAssetId: undefined,
        },
      }
    : loaded.state;
}

export function downloadExport(
  state: SiteCollectionState,
  documentRef: Document = document,
): void {
  const blob = new Blob([serializeExport(state)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `site-hub-${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
