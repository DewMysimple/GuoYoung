import { normalizeUrl } from "./site-utils";

export interface DroppedSitePreview {
  url: string;
  name?: string;
}

type DataTransferReader = Pick<DataTransfer, "getData">;

function firstHttpUrl(value: string): string | undefined {
  const candidate = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && /^https?:\/\//i.test(line));
  if (candidate) return candidate;
  return value.match(/https?:\/\/[^\s<>"']+/i)?.[0];
}

function cleanTitle(value: string | null | undefined, url: string): string | undefined {
  const title = value?.replace(/\s+/g, " ").trim();
  if (!title || title.length > 160 || title === url) return undefined;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (title.toLocaleLowerCase("zh-CN") === hostname.toLocaleLowerCase("zh-CN")) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return title;
}

export function readDroppedSite(dataTransfer: DataTransferReader): DroppedSitePreview | undefined {
  const uriList = dataTransfer.getData("text/uri-list");
  const html = dataTransfer.getData("text/html");
  const plain = dataTransfer.getData("text/plain");
  let htmlHref: string | undefined;
  let htmlTitle: string | undefined;

  if (html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const anchor = document.querySelector<HTMLAnchorElement>("a[href]");
    htmlHref = anchor?.href;
    htmlTitle = anchor?.textContent ?? anchor?.title;
  }

  const rawUrl = firstHttpUrl(uriList) ?? htmlHref ?? firstHttpUrl(plain);
  if (!rawUrl) return undefined;

  let url: string;
  try {
    url = normalizeUrl(rawUrl);
  } catch {
    return undefined;
  }

  const plainLines = plain
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const plainTitle = plainLines.find((line) => !/^https?:\/\//i.test(line));
  return {
    url,
    name: cleanTitle(htmlTitle ?? plainTitle, url),
  };
}
