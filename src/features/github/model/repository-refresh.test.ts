import { describe, expect, it } from "vitest";
import type { GithubImportSource } from "../../../types";
import {
  createGithubRefreshNotice,
  deduplicateGithubRefreshSources,
  orderGithubRefreshEntries,
} from "./repository-refresh";

const source = (login: string): GithubImportSource => ({
  login,
  profileUrl: `https://github.com/${login}`,
  entityType: "user",
});

interface Entry {
  owner: { login: string };
  addedRepositories: { id: number }[];
  skipped: number;
  skippedActive: number;
  skippedDeleted: number;
  error?: string;
}

const entry = (login: string, overrides: Partial<Entry> = {}): Entry => ({
  owner: { login },
  addedRepositories: [],
  skipped: 0,
  skippedActive: 0,
  skippedDeleted: 0,
  ...overrides,
});

describe("GitHub repository refresh calculations", () => {
  it("keeps the first case-insensitive en-US source and its exact object in source order", () => {
    const first = source("Alpha");
    const second = { ...source("alpha"), entityType: "organization" as const };
    const beta = source("Beta");
    const dotted = source("İ");
    const plainI = source("I");
    const sources = Object.freeze([first, beta, second, dotted, plainI, source("i")]);

    const result = deduplicateGithubRefreshSources(sources);

    expect(result).toEqual([first, beta, dotted, plainI]);
    expect(result[0]).toBe(first);
    expect(result[1]).toBe(beta);
    expect(result).not.toBe(sources);
    expect(sources).toHaveLength(6);
  });

  it("returns an empty selection without making a report or inventing a source", () => {
    expect(deduplicateGithubRefreshSources([])).toEqual([]);
    expect(orderGithubRefreshEntries([], [entry("Alpha")], [])).toEqual([]);
  });

  it("restores all-success details to source order without cloning or recounting", () => {
    const alpha = entry("ALPHA", { addedRepositories: [{ id: 1 }], skipped: 4, skippedActive: 2, skippedDeleted: 1 });
    const beta = entry("beta", { skipped: 2, skippedDeleted: 2 });
    const details = Object.freeze([beta, alpha]);

    const result = orderGithubRefreshEntries([source("Alpha"), source("Beta")], details, []);

    expect(result).toEqual([alpha, beta]);
    expect(result[0]).toBe(alpha);
    expect(result[1]).toBe(beta);
    expect(details).toEqual([beta, alpha]);
  });

  it("interleaves partial failures at their original source position and keeps the reason", () => {
    const alpha = entry("alpha");
    const gamma = entry("Gamma");
    const failed = entry("BETA", { error: "Synthetic rate limit" });

    expect(orderGithubRefreshEntries(
      [source("Alpha"), source("Beta"), source("Gamma")],
      [gamma, alpha],
      [failed],
    )).toEqual([alpha, failed, gamma]);
    expect(failed.error).toBe("Synthetic rate limit");
  });

  it("keeps only failures for an all-failed source list without manufacturing successes", () => {
    const alpha = entry("alpha", { error: "Request A failed" });
    const beta = entry("Beta", { error: "Request B failed" });

    expect(orderGithubRefreshEntries([source("Beta"), source("Alpha")], [], [alpha, beta]))
      .toEqual([beta, alpha]);
  });

  it("uses the last duplicate detail in each Map and prefers success over failure", () => {
    const firstSuccess = entry("Alpha", { skipped: 1 });
    const lastSuccess = entry("ALPHA", { skipped: 5 });
    const shadowedFailure = entry("alpha", { error: "Shadowed" });
    const firstFailure = entry("Beta", { error: "First failure" });
    const lastFailure = entry("BETA", { error: "Last failure" });

    const result = orderGithubRefreshEntries(
      [source("Alpha"), source("Beta")],
      [firstSuccess, lastSuccess],
      [shadowedFailure, firstFailure, lastFailure],
    );

    expect(result).toEqual([lastSuccess, lastFailure]);
    expect(result[0]).toBe(lastSuccess);
    expect(result[1]).toBe(lastFailure);
  });

  it("filters missing details and unrelated entries without guessing or sorting", () => {
    const beta = entry("Beta");
    expect(orderGithubRefreshEntries(
      [source("Missing"), source("Beta"), source("OtherMissing")],
      [entry("Outsider"), beta],
      [entry("OtherOutsider", { error: "Ignored" })],
    )).toEqual([beta]);
  });

  it.each([
    [2, 3, 4, 0, "success", "已刷新 2 个作者仓库，新增 3 个，跳过 4 个。"],
    [2, 3, 4, 1, "error", "已刷新 2 个作者仓库，新增 3 个，跳过 4 个。失败 1 个。"],
    [2, 0, 6, 0, "success", "已刷新 2 个作者仓库，新增 0 个，跳过 6 个。"],
  ] as const)("preserves summary counts and visible text (%i owners, %i added, %i skipped, %i failed)", (owners, added, skipped, failed, kind, message) => {
    expect(createGithubRefreshNotice(owners, added, skipped, failed)).toEqual({ kind, message });
  });
});
