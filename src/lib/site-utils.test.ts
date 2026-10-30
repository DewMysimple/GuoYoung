import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState, DEFAULT_GROUPS, DEFAULT_SITES } from "../data/defaults";
import {
  filterSites,
  comparableSiteUrl,
  getFaviconCandidates,
  getFaviconUrl,
  getKnownNativeFaviconUrl,
  getSitesInGroup,
  inferSiteName,
  isDuplicateUrl,
  normalizeUrl,
  reorderGroupBlock,
  reorderGroups,
  reorderSites,
  reorderSitesGlobally,
  sortSitesByHeat,
} from "./site-utils";

describe("site utilities", () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
  });
  it("adds https and removes a root slash", () => {
    expect(normalizeUrl(" github.com/ ")).toBe("https://github.com");
  });

  it("rejects unsupported and incomplete URLs", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(
      "网站地址需要使用 http 或 https",
    );
    expect(() => normalizeUrl("localhost")).toThrow();
    for (const url of ["data:text/plain,hello", "file:///C:/example", "ftp://example.com"]) {
      expect(() => normalizeUrl(url)).toThrow();
    }
  });

  it.each([
    "https://example.com/docs#installation",
    "https://example.com/#/dashboard",
    "https://example.com/Guide",
    "https://example.com/guide",
    "https://example.com/?id=AbC",
    "https://example.com/docs/",
    "https://example.com/?next=/docs/",
    "https://example.com/docs#section/",
    "https://example.com/?x=1&x=2&B=AbC&a=%2f#Part%2F",
    "https://example.com/#:~:text=Hello%20World",
    "https://example.com/?",
    "https://example.com/#",
  ])("preserves navigation components and is idempotent: %s", (url) => {
    expect(normalizeUrl(` ${url} `)).toBe(url);
    expect(normalizeUrl(normalizeUrl(url))).toBe(url);
  });

  it("uses standard host/default-port and Unicode serialization without decoding existing escapes", () => {
    expect(normalizeUrl("HTTPS://EXAMPLE.COM:443/Guide?ID=AbC#安装"))
      .toBe("https://example.com/Guide?ID=AbC#%E5%AE%89%E8%A3%85");
    expect(normalizeUrl("https://example.com/文档/%2f?q=%2F#章节%2f"))
      .toBe("https://example.com/%E6%96%87%E6%A1%A3/%2f?q=%2F#%E7%AB%A0%E8%8A%82%2f");
  });

  it.each([
    ["https://example.com/Guide", "https://example.com/guide"],
    ["https://example.com/?id=AbC", "https://example.com/?id=abc"],
    ["https://example.com/?ID=abc", "https://example.com/?id=abc"],
    ["https://example.com/docs#Part", "https://example.com/docs#part"],
    ["https://example.com/docs", "https://example.com/docs/"],
    ["https://example.com/?a=1&b=2", "https://example.com/?b=2&a=1"],
    ["https://example.com/?a=1&a=2", "https://example.com/?a=2&a=1"],
    ["http://example.com", "https://example.com"],
    ["https://www.example.com", "https://example.com"],
    ["https://example.com:444", "https://example.com"],
    ["https://example.com/%2F", "https://example.com//"],
    ["https://github.com/#Part", "https://github.com"],
    ["https://github.com/?q=AbC", "https://github.com/?q=abc"],
    ["https://github.com/Owner/Repo#Readme", "https://github.com/owner/repo#readme"],
    ["https://github.com/Owner/Repo", "https://github.com/owner/repo"],
    ["https://github.com/Owner/Repo/", "https://github.com/owner/repo"],
    ["https://github.com/owner/repo/blob/main/File", "https://github.com/owner/repo/blob/main/file"],
    ["https://docs.github.com/Guide", "https://docs.github.com/guide"],
  ])("does not merge distinct navigation URLs: %s and %s", (first, second) => {
    expect(comparableSiteUrl(first)).not.toBe(comparableSiteUrl(second));
    const sites = [{ ...DEFAULT_SITES[0], url: first }];
    expect(isDuplicateUrl(sites, second)).toBe(false);
  });

  it.each([
    ["HTTPS://EXAMPLE.COM:443/", "https://example.com"],
    ["http://EXAMPLE.COM:80", "http://example.com/"],
    ["https://www.github.com/", "http://github.com"],
  ])("compares only supported equivalents: %s and %s", (first, second) => {
    expect(comparableSiteUrl(first)).toBe(comparableSiteUrl(second));
  });

  it("detects duplicate normalized URLs while allowing an edited item", () => {
    expect(isDuplicateUrl(DEFAULT_SITES, "github.com/")).toBe(true);
    expect(isDuplicateUrl(DEFAULT_SITES, "github.com", "github")).toBe(false);
  });

  it("infers familiar and generic names from a URL", () => {
    expect(inferSiteName("https://www.douyin.com/")).toBe("抖音");
    expect(inferSiteName("my-workspace.example.com")).toBe("Example");
    expect(inferSiteName("not a url")).toBeUndefined();
  });

  it("uses a custom icon before native and optional mirror sources on the web", () => {
    expect(
      getFaviconUrl({
        url: "https://example.com/path",
        customIconUrl: "https://cdn.example.com/icon.png",
      }),
    ).toBe("https://cdn.example.com/icon.png");
    expect(getFaviconUrl({ url: "https://example.com/path" })).toBe(
      "https://example.com/favicon.ico",
    );
    expect(getFaviconCandidates({ url: "https://example.com/path" })).toEqual([
      "https://example.com/favicon.ico",
      "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fexample.com%2Fpath&sz=256",
      "https://icons.duckduckgo.com/ip3/example.com.ico",
    ]);
    expect(getFaviconUrl({ url: "https://codepen.io" })).toBe(
      "https://codepen.io/favicon.ico",
    );
  });

  it("places an explicitly selected icon source before automatic fallbacks", () => {
    expect(
      getFaviconCandidates({
        url: "https://www.bilibili.com",
        iconSource: "root",
      }),
    ).toEqual([
      "https://www.bilibili.com/favicon.ico",
      "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fwww.bilibili.com&sz=256",
      "https://icons.duckduckgo.com/ip3/www.bilibili.com.ico",
    ]);
  });

  it("uses a site's declared native icon when favicon.ico is non-standard", () => {
    expect(
      getKnownNativeFaviconUrl(
        "https://promptpilot.volcengine.com/home?workspaceId=test",
      ),
    ).toContain("prompt-pilot.png");
    expect(getKnownNativeFaviconUrl("https://www.qianwen.com/chat")).toContain(
      "alicdn.com",
    );
    expect(getKnownNativeFaviconUrl("https://zh.z-lib.fm/book/1")).toBe(
      "https://zh.z-lib.fm/img/favicons/apple-touch-icon.png?v=1",
    );
    expect(getKnownNativeFaviconUrl("https://unknown.example")).toBeUndefined();
  });

  it("tries the site root before Chromium's exact-page and origin caches", () => {
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "test-extension",
        getURL: (path: string) => `chrome-extension://test-extension${path}`,
      },
    };

    expect(getFaviconCandidates({ url: "https://example.com/path" })).toEqual([
      "https://example.com/favicon.ico",
      "chrome-extension://test-extension/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fpath&size=64",
      "chrome-extension://test-extension/_favicon/?pageUrl=https%3A%2F%2Fexample.com&size=64",
      "https://icons.duckduckgo.com/ip3/example.com.ico",
      "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fexample.com%2Fpath&sz=256",
    ]);
  });

  it("matches a site's name, domain, or category", () => {
    expect(
      filterSites(DEFAULT_SITES, "git", DEFAULT_GROUPS).map((site) => site.id),
    ).toEqual(["github"]);
    expect(filterSites(DEFAULT_SITES, "学习", DEFAULT_GROUPS)).toHaveLength(2);
    expect(filterSites(DEFAULT_SITES, "", DEFAULT_GROUPS)).toHaveLength(12);
    expect(filterSites(DEFAULT_SITES, "", DEFAULT_GROUPS, "design")).toHaveLength(
      2,
    );
  });

  it("searches the URL when the caller supplies all workspace groups", () => {
    const state = createDefaultState();
    const githubSite = {
      ...state.sites[0],
      id: "github-repo-search",
      name: "工作仓库",
      url: "https://github.com/acme/secret-repo",
      groupId: "github-other",
      globalOrder: 99,
    };
    const allGroups = [...state.groups];

    expect(filterSites([...state.sites, githubSite], "secret-repo", allGroups)).toEqual([
      githubSite,
    ]);
    expect(
      filterSites([...state.sites, githubSite], "secret-repo", DEFAULT_GROUPS),
    ).toEqual([]);
    expect(
      filterSites([...state.sites, githubSite], "secret-repo", allGroups, "github-other"),
    ).toEqual([githubSite]);
  });

  it("sorts by persistent click heat and keeps manual order for ties", () => {
    const heated = DEFAULT_SITES.map((site) => ({
      ...site,
      clickCount:
        site.id === "wikipedia" ? 5 : site.id === "github" ? 5 : site.id === "google" ? 2 : 0,
    }));

    expect(sortSitesByHeat(heated).map((site) => site.id).slice(0, 4)).toEqual([
      "github",
      "wikipedia",
      "google",
      "bing",
    ]);
    expect(
      sortSitesByHeat(
        heated.filter((site) => site.groupId === "develop"),
        "develop",
      ).map((site) => site.id),
    ).toEqual(["github", "stackoverflow", "codepen"]);
  });

  it("reorders within a group and can move a site to another group", () => {
    const reordered = reorderSites(DEFAULT_SITES, "codepen", "github");
    expect(getSitesInGroup(reordered, "develop").map((site) => site.id)).toEqual([
      "codepen",
      "github",
      "stackoverflow",
    ]);

    const moved = reorderSites(reordered, "github", "google");
    expect(moved.find((site) => site.id === "github")?.groupId).toBe("search");
    expect(getSitesInGroup(moved, "search").map((site) => site.order)).toEqual([
      0, 1, 2,
    ]);
  });

  it("reorders adjacent sites forward as well as backward", () => {
    const movedForward = reorderSites(
      DEFAULT_SITES,
      "github",
      "stackoverflow",
    );
    expect(
      getSitesInGroup(movedForward, "develop").map((site) => site.id),
    ).toEqual(["stackoverflow", "github", "codepen"]);

    const movedBackward = reorderSites(
      DEFAULT_SITES,
      "codepen",
      "github",
    );
    expect(
      getSitesInGroup(movedBackward, "develop").map((site) => site.id),
    ).toEqual(["codepen", "github", "stackoverflow"]);
  });

  it("reorders the all-sites view without changing group membership", () => {
    const reordered = reorderSitesGlobally(DEFAULT_SITES, "wikipedia", "google");
    expect(
      filterSites(reordered, "", DEFAULT_GROUPS).slice(0, 3).map((site) => site.id),
    ).toEqual(["wikipedia", "google", "bing"]);
    expect(reordered.find((site) => site.id === "wikipedia")).toMatchObject({
      groupId: "learn",
      order: 1,
      globalOrder: 0,
    });
    expect(
      getSitesInGroup(reordered, "learn").map((site) => site.id),
    ).toEqual(["mdn", "wikipedia"]);
  });

  it("reorders ordinary groups while keeping the protected group last", () => {
    const reordered = reorderGroups(DEFAULT_GROUPS, "design", "search");
    expect(reordered[0].id).toBe("design");
    expect(reordered.at(-1)?.id).toBe("other");
    expect(reordered.at(-1)?.isProtected).toBe(true);
  });

  it("moves an ordinary group to the end before protected groups", () => {
    const reordered = reorderGroups(DEFAULT_GROUPS, "search", null);
    expect(reordered.at(-2)?.id).toBe("search");
    expect(reordered.at(-1)?.id).toBe("other");
  });

  it("moves non-contiguous selected groups as one stable block", () => {
    const reordered = reorderGroupBlock(
      DEFAULT_GROUPS,
      ["search", "design"],
      "media",
    );
    expect(reordered.map((group) => group.id)).toEqual([
      "develop",
      "search",
      "design",
      "media",
      "learn",
      "other",
    ]);
  });

  it("ignores protected groups in a block and keeps Other last", () => {
    const reordered = reorderGroupBlock(
      DEFAULT_GROUPS,
      ["other", "search"],
      null,
    );
    expect(reordered.at(-2)?.id).toBe("search");
    expect(reordered.at(-1)?.id).toBe("other");
  });


});
