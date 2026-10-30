import { describe, expect, it } from "vitest";
import { createDefaultState } from "../data/defaults";
import { createGroupExportPayload, parseGroupImportFile } from "./data-transfer";
import { findGithubHomeSite } from "./github-workspace";
import { addSiteToState, findSiteByUrl, mergeGroupImportIntoState } from "./site-state";

describe("GitHub navigation targets", () => {
  it("adds a root hash route to a GitHub group without replacing the official homepage", () => {
    const initial = createDefaultState();
    const url = "https://github.com/#/dashboard/";
    const next = addSiteToState(initial, {
      name: "GitHub dashboard", url, groupId: "github-tools",
      customIconUrl: "", iconSource: "auto",
    }, "github-dashboard");

    expect(next.sites.find((site) => site.id === "github-dashboard"))
      .toMatchObject({ url, groupId: "github-tools" });
    expect(findSiteByUrl(next.sites, url)?.id).toBe("github-dashboard");
    expect(findSiteByUrl(next.sites, "https://github.com")?.id).toBe("github");
    expect(findGithubHomeSite(next.sites)?.id).toBe("github");
    expect(initial.sites.some((site) => site.id === "github-dashboard")).toBe(false);
  });

  it("imports distinct GitHub root targets while retaining the bare-home restriction and exact deduplication", () => {
    const initial = createDefaultState();
    const urls = [
      "https://github.com/#/dashboard/",
      "https://github.com/?tab=stars",
      "https://github.com/",
      "https://github.com/#/dashboard/",
    ];
    const payload = createGroupExportPayload(initial, "design");
    payload.sites = urls.map((url, order) => ({ name: `Root target ${order}`, url, order }));
    const parsed = parseGroupImportFile(JSON.stringify(payload));
    const result = mergeGroupImportIntoState(initial, "github-tools", parsed);

    expect(result).toMatchObject({ added: 2, skipped: 2 });
    const imported = result.state.sites.filter((site) => site.groupId === "github-tools");
    expect(imported.map((site) => site.url)).toEqual(urls.slice(0, 2));
    expect(findGithubHomeSite(result.state.sites)?.id).toBe("github");
    expect(() => addSiteToState(initial, {
      name: "Bare homepage", url: "https://github.com", groupId: "github-tools",
      customIconUrl: "", iconSource: "auto",
    })).toThrow("GitHub 官方主页请通过顶部入口管理");
  });
});
