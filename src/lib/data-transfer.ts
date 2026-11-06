import { GROUP_ICON_OPTIONS } from "../data/group-icons";
import { getSitesInGroup, normalizeOptionalIconUrl, normalizeUrl } from "./site-utils";
import type {
  CategoryIcon,
  CollectionEntryId,
  SiteCollectionState,
  SiteGroup,
  SiteIconSource,
  SiteItem,
  SiteWorkspace,
} from "../types";
import { getGroupWorkspace } from "./github-workspace";
import { folderEntryId, getChildGroups, siteEntryId } from "./group-hierarchy";
import { parseStoredState } from "./storage";
import { normalizeSiteNote } from "./site-notes";

export const SITE_HUB_EXPORT_FORMAT = "site-hub-export";
export const SITE_HUB_EXPORT_VERSION = 1;
export const SITE_HUB_GROUP_EXPORT_FORMAT = "site-hub-group-export";
export const SITE_HUB_GROUP_EXPORT_VERSION = 1;
export const SITE_HUB_HIERARCHICAL_GROUP_EXPORT_VERSION = 2;

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
  note?: string;
  url: string;
  customIconUrl?: string;
  iconSource?: SiteIconSource;
  order: number;
}

export interface PortableGroup {
  group: {
    name: string;
    icon: CategoryIcon;
  };
  sites: GroupExportSite[];
}

export interface PortableGroupEntry {
  kind: "site" | "folder";
  index: number;
}

export type GroupExportPayload = PortableGroup & {
  format: typeof SITE_HUB_GROUP_EXPORT_FORMAT;
  exportedAt: string;
  workspace?: SiteWorkspace;
} & (
  | { exportVersion: typeof SITE_HUB_GROUP_EXPORT_VERSION }
  | {
      exportVersion: typeof SITE_HUB_HIERARCHICAL_GROUP_EXPORT_VERSION;
      children: PortableGroup[];
      entryOrder: PortableGroupEntry[];
    }
);

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
  const { githubMigration: _githubMigration, ...stateWithoutMigration } = state;
  const exportableState: SiteCollectionState = {
    ...stateWithoutMigration,
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
  const date = new Date().toISOString().slice(0, 10);
  downloadJson(serializeExport(state), `site-hub-${date}.json`, documentRef);
}

export function downloadJson(text: string, filename: string, documentRef: Document = document): void {
  const blob = new Blob([text], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    const link = documentRef.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createGroupExportPayload(
  state: SiteCollectionState,
  groupId: string,
  exportedAt = new Date().toISOString(),
): GroupExportPayload {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) throw new Error("找不到要导出的分组");

  const sites = getSitesInGroup(state.sites, group.id);
  const children = getChildGroups(state.groups, group.id);
  const portable = {
    format: SITE_HUB_GROUP_EXPORT_FORMAT as typeof SITE_HUB_GROUP_EXPORT_FORMAT,
    exportedAt,
    workspace: getGroupWorkspace(group),
    ...createPortableGroup(group, sites),
  };
  if (!children.length) return { ...portable, exportVersion: SITE_HUB_GROUP_EXPORT_VERSION };

  const positions = new Map<CollectionEntryId, PortableGroupEntry>([
    ...sites.map((site, index) => [siteEntryId(site.id), { kind: "site", index }] as const),
    ...children.map((child, index) => [folderEntryId(child.id), { kind: "folder", index }] as const),
  ]);
  return {
    ...portable,
    exportVersion: SITE_HUB_HIERARCHICAL_GROUP_EXPORT_VERSION,
    children: children.map(child => createPortableGroup(child, getSitesInGroup(state.sites, child.id))),
    entryOrder: normalizePortableOrder((group.entryOrder ?? []).map(id => positions.get(id)), sites.length, children.length),
  };
}

function createPortableGroup(group: SiteGroup, sites: SiteItem[]): PortableGroup {
  return {
    group: {
      name: group.name,
      icon: group.icon,
    },
    sites: sites.map((site, order) => ({
      name: site.name,
      ...(site.note ? { note: site.note } : {}),
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

export function normalizePortableOrder(order: unknown, siteCount: number, folderCount: number): PortableGroupEntry[] {
  const sites = Array.from({ length: siteCount }, (_, index) => ({ kind: "site", index } as const));
  const folders = Array.from({ length: folderCount }, (_, index) => ({ kind: "folder", index } as const));
  const seen = new Set<PortableGroupEntry>();
  if (Array.isArray(order)) {
    for (const entry of order) {
      if (!entry || typeof entry !== "object" || !Number.isInteger(entry.index)) continue;
      const matching = entry.kind === "site" ? sites[entry.index] : entry.kind === "folder" ? folders[entry.index] : undefined;
      if (matching) seen.add(matching);
    }
  }
  for (const entry of [...sites, ...folders]) seen.add(entry);
  return [...seen];
}

function parsePortableGroup(candidate: Record<string, unknown>): PortableGroup {
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
    const note = normalizeSiteNote(site.note);
    return {
      name: site.name.trim(),
      ...(note ? { note } : {}),
      url,
      ...(customIconUrl ? { customIconUrl } : {}),
      ...(site.iconSource
        ? { iconSource: site.iconSource as SiteIconSource }
        : {}),
      order: index,
    };
  });

  return {
    group: {
      name: rawGroup.name.trim(),
      icon: rawGroup.icon,
    },
    sites,
  };
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
    (candidate.exportVersion !== SITE_HUB_GROUP_EXPORT_VERSION &&
      candidate.exportVersion !== SITE_HUB_HIERARCHICAL_GROUP_EXPORT_VERSION)
  ) {
    throw new Error("这不是受支持的分组资源包");
  }
  const workspace: SiteWorkspace | undefined = candidate.workspace === "main" || candidate.workspace === "github" ? candidate.workspace : undefined;
  const portable = {
    format: SITE_HUB_GROUP_EXPORT_FORMAT as typeof SITE_HUB_GROUP_EXPORT_FORMAT,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : new Date().toISOString(),
    ...(workspace ? { workspace } : {}),
    ...parsePortableGroup(candidate),
  };
  if (candidate.exportVersion === SITE_HUB_GROUP_EXPORT_VERSION) {
    return { ...portable, exportVersion: SITE_HUB_GROUP_EXPORT_VERSION };
  }
  if (!Array.isArray(candidate.children)) throw new Error("分组资源包缺少子分组列表");
  const children = candidate.children.map(child => {
    if (!child || typeof child !== "object" || "children" in child) {
      throw new Error("分组资源包中的子分组无效");
    }
    return parsePortableGroup(child);
  });
  return {
    ...portable,
    exportVersion: SITE_HUB_HIERARCHICAL_GROUP_EXPORT_VERSION,
    children,
    entryOrder: normalizePortableOrder(candidate.entryOrder, portable.sites.length, children.length),
  };
}

export function downloadGroupExport(
  state: SiteCollectionState,
  groupId: string,
  documentRef: Document = document,
): void {
  const payload = createGroupExportPayload(state, groupId);
  const date = new Date().toISOString().slice(0, 10);
  const safeName = payload.group.name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .trim()
    .slice(0, 48) || "分组";
  downloadJson(
    JSON.stringify(payload, null, 2),
    `site-hub-group-${safeName}-${date}.json`,
    documentRef,
  );
}
