import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GROUPS, DEFAULT_SITES } from "../data/defaults";
import {
  filterSites,
  getFaviconCandidates,
  getFaviconUrl,
  getKnownNativeFaviconUrl,
  getSitesInGroup,
  inferSiteName,
  isDuplicateUrl,
  normalizeUrl,
  moveSitesToGroupEnd,
  reorderGroupBlock,
  reorderGroups,
  reorderSites,
  reorderSitesGlobally,
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

  it("moves multiple sites to a group end while preserving global order", () => {
    const originalGlobalOrder = new Map(
      DEFAULT_SITES.map((site) => [site.id, site.globalOrder]),
    );
    const moved = moveSitesToGroupEnd(
      DEFAULT_SITES,
      ["google", "github", "figma"],
      "design",
      ["github", "google", "figma"],
    );

    expect(getSitesInGroup(moved, "design").map((site) => site.id)).toEqual([
      "figma",
      "dribbble",
      "github",
      "google",
    ]);
    expect(moved.find((site) => site.id === "figma")?.order).toBe(0);
    for (const site of moved) {
      expect(site.globalOrder).toBe(originalGlobalOrder.get(site.id));
    }
  });

  it("treats a batch already in the destination group as a no-op", () => {
    expect(
      moveSitesToGroupEnd(DEFAULT_SITES, ["figma", "dribbble"], "design"),
    ).toBe(DEFAULT_SITES);
  });
});
