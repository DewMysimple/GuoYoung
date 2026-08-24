import { GROUP_ICON_OPTIONS } from "../data/group-icons";
import { normalizeOptionalIconUrl, normalizeUrl } from "./site-utils";
import type {
  CategoryIcon,
  SiteCollectionState,
  SiteIconSource,
} from "../types";
import { parseStoredState } from "./storage";

export const SITE_HUB_EXPORT_FORMAT = "site-hub-export";
export const SITE_HUB_EXPORT_VERSION = 1;
export const SITE_HUB_GROUP_EXPORT_FORMAT = "site-hub-group-export";
export const SITE_HUB_GROUP_EXPORT_VERSION = 1;

const SITE_ICON_SOURCES: SiteIconSource[] = [
  "auto",
  "browser",
  "google",
  "root",
  "duckduckgo",
  "brand",
  "custom",
];

export interface GroupExportSite {
  name: string;
  url: string;
  customIconUrl?: string;
  iconSource?: SiteIconSource;
  order: number;
}

export interface GroupExportPayload {
  format: typeof SITE_HUB_GROUP_EXPORT_FORMAT;
  exportVersion: typeof SITE_HUB_GROUP_EXPORT_VERSION;
  exportedAt: string;
  group: {
    name: string;
    icon: CategoryIcon;
  };
  sites: GroupExportSite[];
}

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

export function createGroupExportPayload(
  state: SiteCollectionState,
  groupId: string,
  exportedAt = new Date().toISOString(),
): GroupExportPayload {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) throw new Error("找不到要导出的分组");

  return {
    format: SITE_HUB_GROUP_EXPORT_FORMAT,
    exportVersion: SITE_HUB_GROUP_EXPORT_VERSION,
    exportedAt,
    group: {
      name: group.name,
      icon: group.icon,
    },
    sites: state.sites
      .filter((site) => site.groupId === groupId)
      .sort((a, b) => a.order - b.order)
      .map((site, order) => ({
        name: site.name,
        url: site.url,
        ...(site.customIconUrl ? { customIconUrl: site.customIconUrl } : {}),
        ...(site.iconSource ? { iconSource: site.iconSource } : {}),
        order,
      })),
  };
}

export function serializeGroupExport(
  state: SiteCollectionState,
  groupId: string,
): string {
  return JSON.stringify(createGroupExportPayload(state, groupId), null, 2);
}

function isCategoryIcon(value: unknown): value is CategoryIcon {
  return GROUP_ICON_OPTIONS.some((option) => option.value === value);
}

function isSiteIconSource(value: unknown): value is SiteIconSource {
  return SITE_ICON_SOURCES.includes(value as SiteIconSource);
}

export function parseGroupImportFile(text: string): GroupExportPayload {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON 格式");
  }

  if (!value || typeof value !== "object") {
    throw new Error("文件中没有可识别的分组资源");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.format !== SITE_HUB_GROUP_EXPORT_FORMAT ||
    candidate.exportVersion !== SITE_HUB_GROUP_EXPORT_VERSION
  ) {
    throw new Error("这不是受支持的分组资源包");
  }
  if (!candidate.group || typeof candidate.group !== "object") {
    throw new Error("分组资源包缺少来源分组信息");
  }
  const rawGroup = candidate.group as Record<string, unknown>;
  if (
    typeof rawGroup.name !== "string" ||
    !rawGroup.name.trim() ||
    !isCategoryIcon(rawGroup.icon)
  ) {
    throw new Error("分组资源包中的分组信息无效");
  }
  if (!Array.isArray(candidate.sites)) {
    throw new Error("分组资源包缺少网站列表");
  }

  const sites = candidate.sites.map((rawSite, index): GroupExportSite => {
    if (!rawSite || typeof rawSite !== "object") {
      throw new Error(`分组资源包中的第 ${index + 1} 个网站无效`);
    }
    const site = rawSite as Record<string, unknown>;
    if (typeof site.name !== "string" || !site.name.trim()) {
      throw new Error(`分组资源包中的第 ${index + 1} 个网站缺少名称`);
    }
    if (typeof site.url !== "string") {
      throw new Error(`分组资源包中的第 ${index + 1} 个网站缺少地址`);
    }
    let url: string;
    try {
      url = normalizeUrl(site.url);
    } catch {
      throw new Error(`分组资源包中的第 ${index + 1} 个网站地址无效`);
    }
    let customIconUrl: string | undefined;
    if (site.customIconUrl !== undefined) {
      if (typeof site.customIconUrl !== "string") {
        throw new Error(`分组资源包中的第 ${index + 1} 个图标地址无效`);
      }
      try {
        customIconUrl = normalizeOptionalIconUrl(site.customIconUrl);
      } catch {
        throw new Error(`分组资源包中的第 ${index + 1} 个图标地址无效`);
      }
    }
    if (site.iconSource !== undefined && !isSiteIconSource(site.iconSource)) {
      throw new Error(`分组资源包中的第 ${index + 1} 个图标来源无效`);
    }
    return {
      name: site.name.trim(),
      url,
      ...(customIconUrl ? { customIconUrl } : {}),
      ...(site.iconSource
        ? { iconSource: site.iconSource as SiteIconSource }
        : {}),
      order: index,
    };
  });

  return {
    format: SITE_HUB_GROUP_EXPORT_FORMAT,
    exportVersion: SITE_HUB_GROUP_EXPORT_VERSION,
    exportedAt:
      typeof candidate.exportedAt === "string"
        ? candidate.exportedAt
        : new Date().toISOString(),
    group: {
      name: rawGroup.name.trim(),
      icon: rawGroup.icon,
    },
    sites,
  };
}

export function downloadGroupExport(
  state: SiteCollectionState,
  groupId: string,
  documentRef: Document = document,
): void {
  const payload = createGroupExportPayload(state, groupId);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  const safeName = payload.group.name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .trim()
    .slice(0, 48) || "分组";
  link.href = url;
  link.download = `site-hub-group-${safeName}-${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
