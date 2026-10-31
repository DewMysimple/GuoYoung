import type { SiteItem } from "../../../types";

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

  const serialized = url.toString();
  // Preserve every navigation component. Only keep the existing display
  // convention for a bare root, never trim a path, query or fragment slash.
  return url.pathname === "/" && serialized.endsWith("/") && !url.search && !url.hash
    ? serialized.slice(0, -1)
    : serialized;
}

/** Only the bare official root shares the special GitHub homepage entry. */
export function isGithubHomeUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "github.com" || url.hostname === "www.github.com") &&
      !url.port &&
      url.href === `${url.origin}/`
    );
  } catch {
    return false;
  }
}

/** A comparison key only; never save this value as a site's navigation URL. */
export function comparableSiteUrl(input: string): string {
  let normalized: string;
  try {
    normalized = normalizeUrl(input);
  } catch {
    // Invalid legacy values remain readable without guessing equivalences.
    return input.trim();
  }
  if (isGithubHomeUrl(normalized)) return "https://github.com";
  return normalized;
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

export function isDuplicateUrl(
  sites: SiteItem[],
  url: string,
  ignoreId?: string,
): boolean {
  const target = comparableSiteUrl(url);
  return sites.some(
    (site) => site.id !== ignoreId && comparableSiteUrl(site.url) === target,
  );
}

