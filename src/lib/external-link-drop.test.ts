import { describe, expect, it } from "vitest";
import { readDroppedSite } from "./external-link-drop";

function transfer(values: Record<string, string>) {
  return {
    getData: (type: string) => values[type] ?? "",
  };
}

describe("readDroppedSite", () => {
  it("reads a browser uri-list and ignores comments", () => {
    expect(
      readDroppedSite(
        transfer({
          "text/uri-list": "# SourceURL\nhttps://example.com/docs\n",
        }),
      ),
    ).toEqual({ url: "https://example.com/docs", name: undefined });
  });

  it("uses an HTML link title when the dropped link provides one", () => {
    expect(
      readDroppedSite(
        transfer({
          "text/html": '<a href="https://www.xiaohongshu.com/explore">小红书 - 你的生活指南</a>',
          "text/plain": "https://www.xiaohongshu.com/explore",
        }),
      ),
    ).toEqual({
      url: "https://www.xiaohongshu.com/explore",
      name: "小红书 - 你的生活指南",
    });
  });

  it("rejects non-http content", () => {
    expect(
      readDroppedSite(
        transfer({
          "text/uri-list": "file:///C:/secret.txt",
          "text/plain": "javascript:alert(1)",
        }),
      ),
    ).toBeUndefined();
  });
});
