import { describe, expect, it } from "vitest";
import { DEFAULT_SITES } from "../../../data/defaults";
import {
  comparableSiteUrl,
  getHostname,
  inferSiteName,
  isDuplicateUrl,
  isGithubHomeUrl,
  normalizeOptionalIconUrl,
  normalizeUrl,
} from "./site-url";

describe("collection site URL rules", () => {
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

  it("normalizes optional icon addresses with the same errors and navigation fidelity", () => {
    expect(normalizeOptionalIconUrl("   ")).toBeUndefined();
    expect(normalizeOptionalIconUrl(" cdn.example.com/Icon.png?v=AbC&v=%2f#Part "))
      .toBe("https://cdn.example.com/Icon.png?v=AbC&v=%2f#Part");
    expect(() => normalizeOptionalIconUrl("https://")).toThrow("请输入有效的网站地址");
    expect(() => normalizeOptionalIconUrl("data:image/png;base64,abc"))
      .toThrow("网站地址需要使用 http 或 https");
    expect(() => normalizeUrl("   ")).toThrow("请输入网站地址");
  });

  it("keeps hostname extraction and domain-specific name inference", () => {
    expect(getHostname("https://www.EXAMPLE.com:8443/Guide#Part")).toBe("example.com");
    expect(getHostname("https://docs.example.com")).toBe("docs.example.com");
    expect(() => getHostname("not a url")).toThrow();
    expect(inferSiteName("https://developer.mozilla.org/en-US/docs")).toBe("MDN Web Docs");
    expect(inferSiteName("https://docs.github.com/en")).toBe("GitHub");
    expect(inferSiteName("https://my-workspace.co.uk")).toBe("My Workspace");
    expect(inferSiteName("https://my_workspace.com.cn")).toBe("My Workspace");
  });

  it("compares invalid legacy values without rewriting them or merging them with valid addresses", () => {
    expect(comparableSiteUrl("  not a URL  ")).toBe("not a URL");
    expect(comparableSiteUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(comparableSiteUrl("not a URL")).not.toBe(comparableSiteUrl("https://example.com"));
  });

  it("recognizes only the GitHub root as the shared official homepage", () => {
    expect(isGithubHomeUrl("https://github.com")).toBe(true);
    expect(isGithubHomeUrl("https://www.github.com/")).toBe(true);
    expect(isGithubHomeUrl("HTTP://GITHUB.COM:80/")).toBe(true);
    expect(isGithubHomeUrl("https://github.com:443/")).toBe(true);
    expect(isGithubHomeUrl("https://github.com/openai/openai")).toBe(false);
    expect(isGithubHomeUrl("https://github.com.evil.example/")).toBe(false);
    expect(isGithubHomeUrl("https://github.io/")).toBe(false);
  });

  it.each([
    "https://github.com/#/dashboard",
    "https://github.com/?tab=stars",
    "https://github.com/?",
    "https://github.com/#",
    "https://github.com:8443/",
    "https://user:password@github.com/",
    "ftp://github.com/",
  ])("does not treat a distinct root target as the shared homepage: %s", (url) => {
    expect(isGithubHomeUrl(url)).toBe(false);
  });

});
