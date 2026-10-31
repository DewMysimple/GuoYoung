import { collectionSearchScore } from "./collection-search";
import type { SiteGroup, SiteIconSource, SiteItem } from "../types";
import { getBrowserFaviconUrl, getBrowserFaviconUrls } from "./browser-runtime";
import { getHostname } from "../features/collection/model/site-url";

// Keep legacy callers on the same collection URL rules during the transition.
export {
  comparableSiteUrl,
  getHostname,
  inferSiteName,
  isDuplicateUrl,
  isGithubHomeUrl,
  normalizeOptionalIconUrl,
  normalizeUrl,
} from "../features/collection/model/site-url";

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
    // This is a third-party site lookup, not a navigation or local page-cache
    // lookup. Keep paths, query strings, fragments and credentials out of it.
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url.origin)}&sz=256`;
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

export function filterSites(
  sites: SiteItem[],
  query: string,
  groups: SiteGroup[],
  groupId: string | "all" = "all",
): SiteItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  const eligible = [...sites]
    .sort((a, b) =>
      groupId === "all"
        ? a.globalOrder - b.globalOrder
        : a.order - b.order,
    )
    .filter(
      (site) =>
        groups.some((group) => group.id === site.groupId) &&
        (groupId === "all" || site.groupId === groupId),
    )
    ;
  if (!normalizedQuery) return eligible;
  return eligible.map(site => ({ site, score: collectionSearchScore(site.name, site.url,
    groupNames.get(site.groupId) ?? "", normalizedQuery, site.note) }))
    .filter(result => result.score > 0).sort((a, b) => b.score - a.score).map(result => result.site);
}

export function sortSitesByHeat(
  sites: SiteItem[],
  groupId: string | "all" = "all",
): SiteItem[] {
  return [...sites].sort(
    (a, b) =>
      b.clickCount - a.clickCount ||
      (groupId === "all"
        ? a.globalOrder - b.globalOrder
        : a.order - b.order),
  );
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

export function reorderSitesGlobally(
  sites: SiteItem[],
  activeId: string,
  overId: string,
  allowedGroupIds?: Set<string>,
): SiteItem[] {
  const eligible = allowedGroupIds
    ? sites.filter((site) => allowedGroupIds.has(site.groupId))
    : sites;
  const ordered = eligible
    .map((site) => ({ ...site }))
    .sort((a, b) => a.globalOrder - b.globalOrder);
  const from = ordered.findIndex((site) => site.id === activeId);
  const to = ordered.findIndex((site) => site.id === overId);
  if (from < 0 || to < 0 || from === to) return sites;

  const [moved] = ordered.splice(from, 1);
  moved.updatedAt = new Date().toISOString();
  ordered.splice(to, 0, moved);
  const slots = eligible
    .slice()
    .sort((a, b) => a.globalOrder - b.globalOrder)
    .map((site) => site.globalOrder);
  const nextById = new Map(
    ordered.map((site, index) => [site.id, { ...site, globalOrder: slots[index] }]),
  );
  return sites.map((site) => nextById.get(site.id) ?? { ...site });
}

export function getSiteInitial(name: string, url: string): string {
  const value = name.trim() || getHostname(url);
  return Array.from(value)[0]?.toLocaleUpperCase("zh-CN") ?? "?";
}
