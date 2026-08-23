import type { SiteGroup, SiteIconSource, SiteItem } from "../types";
import { getBrowserFaviconUrl, getBrowserFaviconUrls } from "./browser-runtime";

/**
 * Some sites publish their real icon at a non-standard path while returning
 * HTML or 404 from `/favicon.ico`. Keep a small registry of the site's own
 * declared icons so automatic mode can still stay on first-party/CDN assets.
 */
const knownNativeFaviconUrls: Record<
  string,
  string | ((url: URL) => string)
> = {
  "promptpilot.volcengine.com":
    "https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/autope/logo/prompt-pilot.png",
  "qianwen.com":
    "https://img.alicdn.com/imgextra/i2/O1CN01taBbMS1CfyJoOt0lB_!!6000000000109-2-tps-80-80.png",
  "subhd.tv": (url) => `${url.origin}/public/images/apple-touch-icon.png`,
  "z-lib.fm": (url) =>
    `${url.origin}/img/favicons/apple-touch-icon.png?v=1`,
};

const knownSiteNames: Record<string, string> = {
  "google.com": "Google",
  "bing.com": "Bing",
  "github.com": "GitHub",
  "stackoverflow.com": "Stack Overflow",
  "codepen.io": "CodePen",
  "figma.com": "Figma",
  "dribbble.com": "Dribbble",
  "bilibili.com": "哔哩哔哩",
  "youtube.com": "YouTube",
  "douban.com": "豆瓣",
  "developer.mozilla.org": "MDN Web Docs",
  "mozilla.org": "Mozilla",
  "wikipedia.org": "维基百科",
  "douyin.com": "抖音",
  "openai.com": "OpenAI",
  "notion.so": "Notion",
  "x.com": "X",
  "twitter.com": "X",
};

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入网站地址");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("请输入有效的网站地址");
  }

  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
    throw new Error("网站地址需要使用 http 或 https");
  }

  url.hash = "";
  if (url.pathname === "/") {
    url.pathname = "";
  }
  return url.toString().replace(/\/$/, "");
}

export function normalizeOptionalIconUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return normalizeUrl(trimmed);
}

export function getHostname(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

export function inferSiteName(input: string): string | undefined {
  let hostname: string;
  try {
    hostname = getHostname(normalizeUrl(input)).toLocaleLowerCase("en-US");
  } catch {
    return undefined;
  }

  const exactName = knownSiteNames[hostname];
  if (exactName) return exactName;

  const matchedDomain = Object.keys(knownSiteNames).find(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (matchedDomain) return knownSiteNames[matchedDomain];

  const parts = hostname.split(".");
  const twoPartSuffixes = new Set(["co.uk", "com.cn", "com.au", "co.jp"]);
  const suffix = parts.slice(-2).join(".");
  const label =
    twoPartSuffixes.has(suffix) && parts.length >= 3
      ? parts.at(-3)
      : parts.length >= 2
        ? parts.at(-2)
        : parts[0];

  if (!label) return undefined;
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("en-US") + word.slice(1))
    .join(" ");
}

export function resolveSiteIconSource(
  site: Pick<SiteItem, "customIconUrl" | "iconSource">,
): SiteIconSource {
  if (site.iconSource) {
    return site.iconSource === "custom" && !site.customIconUrl
      ? "auto"
      : site.iconSource;
  }
  return site.customIconUrl ? "custom" : "auto";
}

export function getFaviconSourceUrl(
  site: Pick<SiteItem, "url" | "customIconUrl">,
  source: Exclude<SiteIconSource, "auto" | "brand">,
): string | undefined {
  const url = new URL(site.url);
  const hostname = url.hostname;
  if (source === "custom") return site.customIconUrl;
  if (source === "browser") return getBrowserFaviconUrl(site.url, 64);
  if (source === "google") {
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(site.url)}&sz=256`;
  }
  if (source === "root") return `${url.origin}/favicon.ico`;
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`;
}

export function getKnownNativeFaviconUrl(siteUrl: string): string | undefined {
  const url = new URL(siteUrl);
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const matchedDomain = Object.keys(knownNativeFaviconUrls).find(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (!matchedDomain) return undefined;

  const source = knownNativeFaviconUrls[matchedDomain];
  return typeof source === "function" ? source(url) : source;
}

function getAutomaticFaviconCandidates(
  site: Pick<SiteItem, "url" | "customIconUrl">,
): string[] {
  const browserFavicons = getBrowserFaviconUrls(site.url, 64);
  const declaredNativeFavicon = getKnownNativeFaviconUrl(site.url);
  const rootFavicon = getFaviconSourceUrl(site, "root");
  const candidates = browserFavicons.length > 0
    ? [
        declaredNativeFavicon,
        rootFavicon,
        ...browserFavicons,
        // Mirrors are deliberately late fallbacks in the extension. This keeps
        // normal and domestic sites on their own assets, but prevents a usable
        // icon shown in the picker from being ignored and replaced by a letter.
        getFaviconSourceUrl(site, "duckduckgo"),
        getFaviconSourceUrl(site, "google"),
      ]
    : [
        declaredNativeFavicon,
        rootFavicon,
        getFaviconSourceUrl(site, "google"),
        getFaviconSourceUrl(site, "duckduckgo"),
      ];
  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

export function getFaviconCandidates(
  site: Pick<SiteItem, "url" | "customIconUrl" | "iconSource">,
): string[] {
  const automaticCandidates = getAutomaticFaviconCandidates(site);
  const preferredSource = resolveSiteIconSource(site);
  const preferredUrl =
    preferredSource === "auto" || preferredSource === "brand"
      ? undefined
      : getFaviconSourceUrl(site, preferredSource);
  const candidates = [preferredUrl, ...automaticCandidates].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  return [...new Set(candidates)];
}

export function getFaviconUrl(
  site: Pick<SiteItem, "url" | "customIconUrl" | "iconSource">,
): string {
  return getFaviconCandidates(site)[0];
}

export function isDuplicateUrl(
  sites: SiteItem[],
  url: string,
  ignoreId?: string,
): boolean {
  const target = normalizeUrl(url).toLowerCase();
  return sites.some(
    (site) => site.id !== ignoreId && normalizeUrl(site.url).toLowerCase() === target,
  );
}

export function filterSites(
  sites: SiteItem[],
  query: string,
  groups: SiteGroup[],
  groupId: string | "all" = "all",
): SiteItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  return [...sites]
    .sort((a, b) =>
      groupId === "all"
        ? a.globalOrder - b.globalOrder
        : a.order - b.order,
    )
    .filter((site) => groupId === "all" || site.groupId === groupId)
    .filter((site) => {
      if (!normalizedQuery) return true;
      const groupName = groupNames.get(site.groupId) ?? "";
      return [site.name, getHostname(site.url), groupName].some((value) =>
        value.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
      );
    });
}

export function reorderGroups(
  groups: SiteGroup[],
  activeId: string,
  beforeGroupId: string | null,
): SiteGroup[] {
  return reorderGroupBlock(groups, [activeId], beforeGroupId);
}

export function reorderGroupBlock(
  groups: SiteGroup[],
  activeIds: string[],
  beforeGroupId: string | null,
): SiteGroup[] {
  const protectedGroups = groups
    .filter((group) => group.isProtected)
    .sort((a, b) => a.order - b.order);
  const ordinaryGroups = groups
    .filter((group) => !group.isProtected)
    .sort((a, b) => a.order - b.order);
  const activeSet = new Set(activeIds);
  const moved = ordinaryGroups.filter((group) => activeSet.has(group.id));
  if (moved.length === 0) {
    return [...ordinaryGroups, ...protectedGroups].map((group, order) => ({
      ...group,
      order,
    }));
  }
  const remaining = ordinaryGroups.filter((group) => !activeSet.has(group.id));
  const to =
    beforeGroupId === null
      ? remaining.length
      : remaining.findIndex((group) => group.id === beforeGroupId);
  if (to < 0) {
    return [...ordinaryGroups, ...protectedGroups].map((group, order) => ({
      ...group,
      order,
    }));
  }
  const now = new Date().toISOString();
  remaining.splice(
    to,
    0,
    ...moved.map((group) => ({ ...group, updatedAt: now })),
  );
  return [...remaining, ...protectedGroups].map((group, order) => ({
    ...group,
    order,
  }));
}

export function getSitesInGroup(sites: SiteItem[], groupId: string): SiteItem[] {
  return sites
    .filter((site) => site.groupId === groupId)
    .sort((a, b) => a.order - b.order);
}

export function reindexSites(sites: SiteItem[]): SiteItem[] {
  [...sites]
    .sort((a, b) => a.globalOrder - b.globalOrder)
    .forEach((site, globalOrder) => {
      site.globalOrder = globalOrder;
    });

  const groups = new Map<string, SiteItem[]>();
  for (const site of sites) {
    const groupSites = groups.get(site.groupId) ?? [];
    groupSites.push(site);
    groups.set(site.groupId, groupSites);
  }
  for (const groupSites of groups.values()) {
    groupSites
      .sort((a, b) => a.order - b.order)
      .forEach((site, order) => {
        site.order = order;
      });
  }
  return sites;
}

export function reorderSites(
  sites: SiteItem[],
  activeId: string,
  overId: string,
): SiteItem[] {
  const active = sites.find((site) => site.id === activeId);
  const over = sites.find((site) => site.id === overId);
  if (!active || !over || active.id === over.id) return sites;

  const next = sites.map((site) => ({ ...site }));
  const moved = next.find((site) => site.id === activeId)!;
  const sourceGroupId = moved.groupId;
  const targetGroupId = over.groupId;

  if (sourceGroupId === targetGroupId) {
    const groupSites = getSitesInGroup(next, sourceGroupId);
    const fromIndex = groupSites.findIndex((site) => site.id === activeId);
    const toIndex = groupSites.findIndex((site) => site.id === overId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return sites;

    const [reorderedSite] = groupSites.splice(fromIndex, 1);
    reorderedSite.updatedAt = new Date().toISOString();
    // Preserve the destination index from the original list. This gives both
    // drag directions the same arrayMove behavior instead of inserting a
    // forward-moving card back before its target.
    groupSites.splice(toIndex, 0, reorderedSite);
    groupSites.forEach((site, order) => {
      site.order = order;
    });
    const reordered = new Map(groupSites.map((site) => [site.id, site]));
    return next.map((site) => reordered.get(site.id) ?? site);
  }

  const sourceSites = getSitesInGroup(next, sourceGroupId).filter(
    (site) => site.id !== activeId,
  );
  const targetSites = getSitesInGroup(next, targetGroupId);
  const targetIndex = Math.max(
    0,
    targetSites.findIndex((site) => site.id === overId),
  );

  moved.groupId = targetGroupId;
  moved.updatedAt = new Date().toISOString();
  targetSites.splice(targetIndex, 0, moved);

  sourceSites.forEach((site, order) => {
    site.order = order;
  });
  targetSites.forEach((site, order) => {
    site.order = order;
  });

  const affected = new Map(
    [...sourceSites, ...targetSites].map((site) => [site.id, site]),
  );
  return next.map((site) => affected.get(site.id) ?? site);
}

export function moveSiteToGroupEnd(
  sites: SiteItem[],
  activeId: string,
  targetGroupId: string,
): SiteItem[] {
  const active = sites.find((site) => site.id === activeId);
  if (!active) return sites;
  const next = sites.map((site) => ({ ...site }));
  const moved = next.find((site) => site.id === activeId)!;
  const sourceGroupId = moved.groupId;
  const sourceSites = getSitesInGroup(next, sourceGroupId).filter(
    (site) => site.id !== activeId,
  );
  const targetSites =
    sourceGroupId === targetGroupId
      ? sourceSites
      : getSitesInGroup(next, targetGroupId);

  moved.groupId = targetGroupId;
  moved.updatedAt = new Date().toISOString();
  targetSites.push(moved);
  sourceSites.forEach((site, order) => {
    site.order = order;
  });
  targetSites.forEach((site, order) => {
    site.order = order;
  });
  const affected = new Map(
    [...sourceSites, ...targetSites].map((site) => [site.id, site]),
  );
  return next.map((site) => affected.get(site.id) ?? site);
}

export function moveSitesToGroupEnd(
  sites: SiteItem[],
  activeIds: Iterable<string>,
  targetGroupId: string,
  orderedIds?: Iterable<string>,
): SiteItem[] {
  const selectedIds = new Set(activeIds);
  const preferredOrder = orderedIds ? [...orderedIds] : [...selectedIds];
  const byId = new Map(sites.map((site) => [site.id, site]));
  const movedIds = preferredOrder.filter((id) => {
    const site = byId.get(id);
    return selectedIds.has(id) && site && site.groupId !== targetGroupId;
  });

  for (const id of selectedIds) {
    const site = byId.get(id);
    if (site && site.groupId !== targetGroupId && !movedIds.includes(id)) {
      movedIds.push(id);
    }
  }
  if (movedIds.length === 0) return sites;

  const movedIdSet = new Set(movedIds);
  const next = sites.map((site) => ({ ...site }));
  const affectedGroupIds = new Set<string>([targetGroupId]);
  const now = new Date().toISOString();

  for (const site of next) {
    if (!movedIdSet.has(site.id)) continue;
    affectedGroupIds.add(site.groupId);
    site.groupId = targetGroupId;
    site.updatedAt = now;
  }

  for (const groupId of affectedGroupIds) {
    const groupSites = next
      .filter((site) => site.groupId === groupId && !movedIdSet.has(site.id))
      .sort((a, b) => a.order - b.order);
    if (groupId === targetGroupId) {
      for (const id of movedIds) {
        const moved = next.find((site) => site.id === id);
        if (moved) groupSites.push(moved);
      }
    }
    groupSites.forEach((site, order) => {
      site.order = order;
    });
  }

  return next;
}

export function reorderSitesGlobally(
  sites: SiteItem[],
  activeId: string,
  overId: string,
): SiteItem[] {
  const ordered = sites
    .map((site) => ({ ...site }))
    .sort((a, b) => a.globalOrder - b.globalOrder);
  const from = ordered.findIndex((site) => site.id === activeId);
  const to = ordered.findIndex((site) => site.id === overId);
  if (from < 0 || to < 0 || from === to) return sites;

  const [moved] = ordered.splice(from, 1);
  moved.updatedAt = new Date().toISOString();
  ordered.splice(to, 0, moved);
  return ordered.map((site, globalOrder) => ({ ...site, globalOrder }));
}

export function getSiteInitial(name: string, url: string): string {
  const value = name.trim() || getHostname(url);
  return Array.from(value)[0]?.toLocaleUpperCase("zh-CN") ?? "?";
}
