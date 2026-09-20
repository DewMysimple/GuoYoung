import { describe, expect, it } from "vitest";
import { collectionSearchScore } from "./collection-search";
import { filterSites } from "./site-utils";
import { DEFAULT_GROUPS, DEFAULT_SITES } from "../data/defaults";

describe("collection search relevance", () => {
  it.each(["k'i'mi", "ＫＩＭＩ", "KIMI", "ki’mi"])("finds English names from IME text %s", query => {
    expect(collectionSearchScore("Kimi", "https://kimi.com", "AI", query)).toBeGreaterThan(0);
  });
  it.each(["blbl", "bilibili", "bi'li'bi'li", "bilib", "哔哩"])("matches Chinese names by %s", query => {
    expect(filterSites(DEFAULT_SITES, query, DEFAULT_GROUPS).map(site => site.id)).toContain("bilibili");
  });
  it("supports phrase pronunciation, mixed prefixes, English acronyms and multiple fields", () => {
    expect(collectionSearchScore("重庆银行", "https://example.com", "金融", "cqyh")).toBeGreaterThan(0);
    expect(collectionSearchScore("网页设计", "https://example.com", "设计", "wangysj")).toBeGreaterThan(0);
    expect(collectionSearchScore("UI动效库", "https://example.com", "设计", "uidxk")).toBeGreaterThan(0);
    expect(collectionSearchScore("Stack Overflow", "https://example.com", "开发", "so")).toBeGreaterThan(0);
    expect(collectionSearchScore("Kimi", "https://example.com", "AI", "km")).toBeGreaterThan(0);
    expect(collectionSearchScore("Figma", "https://figma.com", "设计", "sj figma")).toBeGreaterThan(0);
  });
  it("ranks exact names above group matches and rejects absent tokens and single-letter guesses", () => {
    const direct = collectionSearchScore("设计", "https://example.com", "工具", "设计");
    expect(direct).toBeGreaterThan(collectionSearchScore("Figma", "https://figma.com", "设计", "设计"));
    expect(collectionSearchScore("维基百科", "https://example.com", "工具", "w")).toBe(0);
    expect(collectionSearchScore("Figma", "https://figma.com", "设计", "设计 missing")).toBe(0);
    expect(collectionSearchScore("Figma", "https://figma.com", "设计", "''' ")).toBe(0);
  });
  it("reindexes renamed text and preserves the group boundary and manual order without a query", () => {
    const site = { ...DEFAULT_SITES[0], name: "网页设计" };
    expect(filterSites([site], "wysj", DEFAULT_GROUPS)).toHaveLength(1);
    expect(filterSites([{ ...site, name: "新名称" }], "wysj", DEFAULT_GROUPS)).toHaveLength(0);
    expect(filterSites([site], "wysj", DEFAULT_GROUPS, "design")).toHaveLength(0);
    expect(filterSites(DEFAULT_SITES, "", DEFAULT_GROUPS)).toEqual([...DEFAULT_SITES].sort((a,b) => a.globalOrder-b.globalOrder));
  });
});
