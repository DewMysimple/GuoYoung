import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState, DEFAULT_GROUPS, DEFAULT_SITES } from "../data/defaults";
import * as collectionUrl from "../features/collection/model/site-url";
import { isGithubHomeUrl as workspaceGithubHomeUrl } from "./github-workspace";
import * as legacySiteUtils from "./site-utils";
import {
  filterSites,
  getFaviconCandidates,
  getFaviconSourceUrl,
  getFaviconUrl,
  getKnownNativeFaviconUrl,
  getSitesInGroup,
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
  it("preserves the legacy URL exports and GitHub workspace re-export", () => {
    for (const name of [
      "comparableSiteUrl",
      "getHostname",
      "inferSiteName",
      "isDuplicateUrl",
      "isGithubHomeUrl",
      "normalizeOptionalIconUrl",
      "normalizeUrl",
    ] as const) {
      expect(legacySiteUtils[name]).toBe(collectionUrl[name]);
    }
    expect(workspaceGithubHomeUrl).toBe(collectionUrl.isGithubHomeUrl);
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
      "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fexample.com&sz=256",
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

  it.each([
    ["https://example.com/Private/Report?token=FAKE_TOKEN&x=AbC&x=%2f#section-2", "https://example.com"],
    ["https://FAKE_USER:FAKE_PASSWORD@example.com:8443/Encoded%2FPath?token=FAKE_TOKEN#Part", "https://example.com:8443"],
    ["HTTPS://EXAMPLE.COM:443/Guide?ID=AbC#Part", "https://example.com"],
    ["http://example.com:8080/Guide/?x=1&x=2#Part", "http://example.com:8080"],
  ])("limits mirror queries without changing navigation or custom resources: %s", (navigation, origin) => {
    const customIconUrl = "https://cdn.example.com/Images/Icon.png?signature=FAKE_SIGNATURE&v=AbC#image";
    const site = { url: navigation, customIconUrl };
    const google = new URL(getFaviconSourceUrl(site, "google")!);
    expect([...google.searchParams]).toEqual([["domain_url", origin], ["sz", "256"]]);
    const duckduckgo = new URL(getFaviconSourceUrl(site, "duckduckgo")!);
    expect(duckduckgo.pathname).toBe(`/ip3/${new URL(navigation).hostname}.ico`);
    expect(duckduckgo.search).toBe("");
    expect(duckduckgo.hash).toBe("");
    expect(getFaviconSourceUrl(site, "custom")).toBe(customIconUrl);
    expect(site.url).toBe(navigation);
    const candidates = getFaviconCandidates({ ...site, iconSource: "google" });
    expect(candidates[0]).toBe(google.href);
    expect(candidates.filter(candidate => candidate === google.href)).toHaveLength(1);
  });

  it("keeps full-page local favicon lookup separate from minimized third-party queries", () => {
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "test-extension",
        getURL: (path: string) => `chrome-extension://test-extension${path}`,
      },
    };
    const url = "https://example.com:8443/Private/Report?token=FAKE_TOKEN&x=AbC&x=%2f#section-2";
    const candidates = getFaviconCandidates({ url });
    const local = candidates.filter(candidate => candidate.startsWith("chrome-extension:"));
    expect(local.map(candidate => new URL(candidate).searchParams.get("pageUrl")))
      .toEqual([url, "https://example.com:8443"]);
    expect(new URL(getFaviconSourceUrl({ url }, "browser")!).searchParams.get("pageUrl")).toBe(url);
    expect(new URL(candidates.find(candidate => candidate.startsWith("https://www.google.com"))!).searchParams.get("domain_url"))
      .toBe("https://example.com:8443");
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
      "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fexample.com&sz=256",
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
