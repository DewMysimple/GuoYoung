import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../../data/defaults";
import {
  fetchGithubOwnerRepositories,
  type GithubOwnerRepositories,
} from "../../lib/github-repository-api";
import {
  importGithubRepositoriesToState,
  importGithubRepositoryBatchToState,
} from "../../lib/site-state";
import type { SiteCollectionState, SiteGroup } from "../../types";
import { useGithubRepositoryWorkflow, type GithubRepositoryWorkflowOptions } from "./use-github-repository-workflow";

vi.mock("../../lib/github-repository-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../lib/github-repository-api")>(),
  fetchGithubOwnerRepositories: vi.fn(),
}));

const fetchOwners = vi.mocked(fetchGithubOwnerRepositories);

function preview(login = "Alpha", names = ["new"]): GithubOwnerRepositories {
  return {
    owner: { login, profileUrl: `https://github.com/${login}`, entityType: "user" },
    repositories: names.map((name, index) => ({
      id: (login === "Alpha" ? 100 : 200) + index,
      name, fullName: `${login}/${name}`, htmlUrl: `https://github.com/${login}/${name}`,
      fork: false, archived: false,
    })),
  };
}

function sourceGroup(login: string, index: number, workspace: "main" | "github" = "github"): SiteGroup {
  return {
    ...createDefaultState().groups[0], id: `synthetic-${workspace}-${index}`, name: `${login}-${index}`,
    isProtected: false, workspace, order: index,
    githubImportSource: { login, profileUrl: `https://github.com/${login}`, entityType: "user" },
  };
}

function options(initial = createDefaultState()) {
  let state = initial;
  const imports = vi.fn<GithubRepositoryWorkflowOptions["importGithubRepositories"]>((owner, repositories, selected) => {
    const result = importGithubRepositoriesToState(state, owner, repositories, selected);
    state = result.state;
    return result;
  });
  const batch = vi.fn<GithubRepositoryWorkflowOptions["importGithubRepositoryBatch"]>((items) => {
    const result = importGithubRepositoryBatchToState(state, items);
    state = result.state;
    return result;
  });
  const input: GithubRepositoryWorkflowOptions = {
    groups: initial.groups, importGithubRepositories: imports, importGithubRepositoryBatch: batch,
    onSelectGroup: vi.fn(), onNotice: vi.fn(), onCloseAddMenu: vi.fn(),
  };
  return { input, imports, batch, state: () => state };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
}

function seedDuplicates(state: SiteCollectionState) {
  for (const login of ["Alpha", "Beta"]) {
    state.sites.push({ ...state.sites[0], id: `${login}-active`, url: `https://github.com/${login}/active` });
    state.deletedSites.push({
      site: { ...state.sites[0], id: `${login}-deleted`, url: `https://github.com/${login}/deleted` },
      deletedAt: "2026-11-01T00:00:00.000Z", originalGroupId: "github-other", originalGroupName: "Synthetic",
    });
  }
}

beforeEach(() => { fetchOwners.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("useGithubRepositoryWorkflow", () => {
  it("owns the dialog lifecycle and source prefill without fetching or persisting on mount in StrictMode", () => {
    const api = options();
    const { result } = renderHook(() => useGithubRepositoryWorkflow(api.input), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    expect(result.current).toMatchObject({
      githubImportOpen: false, githubImportInitialUrl: "", githubImportPreview: null,
      githubImportLoading: false, githubImportConfirming: false, githubImportError: null,
      githubBulkRefreshLoading: false, githubRefreshReport: null,
    });
    expect(fetchOwners).not.toHaveBeenCalled();
    expect(api.imports).not.toHaveBeenCalled();
    expect(api.batch).not.toHaveBeenCalled();
    act(() => result.current.openGithubRefresh(api.input.groups[0]));
    expect(result.current.githubImportOpen).toBe(false);
    const group = sourceGroup("Alpha", 1);
    group.githubImportSource!.profileUrl += "/";
    act(() => result.current.openGithubRefresh(group));
    expect(result.current.githubImportInitialUrl).toBe("https://github.com/Alpha/");
    expect(api.input.onCloseAddMenu).toHaveBeenCalledTimes(1);
    act(() => result.current.closeGithubRepositoryImport(false));
    expect(result.current).toMatchObject({ githubImportOpen: false, githubImportInitialUrl: "", githubImportPreview: null, githubImportError: null });
    act(() => result.current.openGithubRepositoryImport());
    expect(result.current).toMatchObject({ githubImportOpen: true, githubImportInitialUrl: "" });
  });

  it("clears old preview and errors for success, no public repositories, and formatted failure", async () => {
    const data = preview();
    fetchOwners.mockResolvedValueOnce(data).mockResolvedValueOnce(preview("Beta", [])).mockRejectedValueOnce(new Error("Synthetic network error"));
    const api = options();
    const { result } = renderHook(() => useGithubRepositoryWorkflow(api.input));
    act(() => result.current.openGithubRepositoryImport());
    await act(async () => { await result.current.handleGithubRepositoryRead("https://github.com/Alpha"); });
    expect(result.current.githubImportPreview).toBe(data);
    await act(async () => { await result.current.handleGithubRepositoryRead("https://github.com/Beta"); });
    expect(result.current).toMatchObject({ githubImportPreview: null, githubImportLoading: false, githubImportError: "这个作者或组织没有可导入的公开仓库。" });
    await act(async () => { await result.current.handleGithubRepositoryRead("https://github.com/Failed"); });
    expect(result.current).toMatchObject({ githubImportPreview: null, githubImportLoading: false, githubImportError: "Synthetic network error" });
    act(() => result.current.closeGithubRepositoryImport(false));
    act(() => result.current.openGithubRepositoryImport());
    expect(result.current.githubImportError).toBeNull();
    expect(api.imports).not.toHaveBeenCalled();
  });

  it("passes the selected IDs once to the existing command and keeps its notice and group activation", async () => {
    const data = preview("Alpha", ["first", "second"]);
    fetchOwners.mockResolvedValueOnce(data);
    const api = options();
    const { result } = renderHook(() => useGithubRepositoryWorkflow(api.input));
    act(() => result.current.handleGithubRepositoryConfirm(new Set([100])));
    expect(api.imports).not.toHaveBeenCalled();
    act(() => result.current.openGithubRepositoryImport("https://github.com/Alpha"));
    await act(async () => { await result.current.handleGithubRepositoryRead("https://github.com/Alpha"); });
    act(() => result.current.handleGithubRepositoryConfirm(new Set()));
    expect(api.imports).not.toHaveBeenCalled();
    const selected = new Set([101]);
    act(() => result.current.handleGithubRepositoryConfirm(selected));
    expect(api.imports).toHaveBeenCalledExactlyOnceWith(data.owner, data.repositories, selected);
    expect(api.state().sites.filter((site) => site.url === data.repositories[1].htmlUrl)).toHaveLength(1);
    expect(api.state().sites.some((site) => site.url === data.repositories[0].htmlUrl)).toBe(false);
    expect(api.input.onNotice).toHaveBeenCalledExactlyOnceWith({ kind: "success", message: "已将 1 个仓库添加到“Alpha”，跳过 0 个重复项。" });
    const group = api.state().groups.find((entry) => entry.githubImportSource?.login === "Alpha")!;
    expect(api.input.onSelectGroup).toHaveBeenCalledExactlyOnceWith(group.id);
    expect(result.current).toMatchObject({ githubImportOpen: false, githubImportPreview: null, githubImportError: null, githubImportConfirming: false });
    // Confirm does not add a new URL reset or persistence wait; the normal close/open path owns that.
    expect(result.current.githubImportInitialUrl).toBe("https://github.com/Alpha");
  });

  it("retains the zero-added single-import message without inventing a selected group", async () => {
    fetchOwners.mockResolvedValueOnce(preview());
    const api = options();
    api.imports.mockReturnValueOnce({ state: api.state(), added: 0, addedRepositories: [], skipped: 2, skippedActive: 1, skippedDeleted: 1 });
    const { result } = renderHook(() => useGithubRepositoryWorkflow(api.input));
    await act(async () => { await result.current.handleGithubRepositoryRead("https://github.com/Alpha"); });
    act(() => result.current.handleGithubRepositoryConfirm(new Set([100])));
    expect(api.input.onNotice).toHaveBeenCalledExactlyOnceWith({ kind: "success", message: "没有新增仓库，已跳过 2 个重复项。" });
    expect(api.input.onSelectGroup).not.toHaveBeenCalled();
  });

  it.each([new Error("Synthetic import failure"), "non-Error failure"])("leaves the preview open on a synchronous command error: %s", async (error) => {
    const data = preview();
    fetchOwners.mockResolvedValueOnce(data);
    const api = options();
    api.imports.mockImplementationOnce(() => { throw error; });
    const { result } = renderHook(() => useGithubRepositoryWorkflow(api.input));
    act(() => result.current.openGithubRepositoryImport());
    await act(async () => { await result.current.handleGithubRepositoryRead("https://github.com/Alpha"); });
    act(() => result.current.handleGithubRepositoryConfirm(new Set([100])));
    expect(result.current).toMatchObject({ githubImportOpen: true, githubImportPreview: data, githubImportConfirming: false,
      githubImportError: error instanceof Error ? error.message : "导入失败，请稍后重试。" });
    expect(api.input.onNotice).not.toHaveBeenCalled();
    expect(api.input.onSelectGroup).not.toHaveBeenCalled();
  });

  it("opens single-author import for zero eligible sources and ignores sources from the main workspace", async () => {
    const api = options();
    api.input.groups = [...api.input.groups, sourceGroup("Ignored", 9, "main")];
    const { result } = renderHook(() => useGithubRepositoryWorkflow(api.input));
    await act(async () => { await result.current.handleGithubHomeRefresh(); });
    expect(result.current).toMatchObject({ githubImportOpen: true, githubImportInitialUrl: "", githubBulkRefreshLoading: false, githubRefreshReport: null });
    expect(fetchOwners).not.toHaveBeenCalled();
    expect(api.batch).not.toHaveBeenCalled();
  });

  it.each(["all-success", "partial", "all-failed", "zero-new"] as const)("preserves ordered, case-deduplicated %s reports and one batch command", async (mode) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T02:30:00.000Z"));
    const state = createDefaultState();
    state.groups.push(sourceGroup("Alpha", 0), sourceGroup("Beta", 1), sourceGroup("alpha", 2), sourceGroup("Ignored", 3, "main"));
    seedDuplicates(state);
    const api = options(state);
    const initialState = api.state();
    fetchOwners.mockImplementation(async (source) => {
      const login = typeof source === "string" ? source.split("/").at(-1)! : source.login;
      if (mode === "all-failed" || (mode === "partial" && login === "Alpha")) throw new Error(`Failed ${login}`);
      return preview(login, mode === "zero-new" ? ["active", "deleted"] : ["new", "active", "deleted"]);
    });
    const { result } = renderHook(() => useGithubRepositoryWorkflow(api.input));
    await act(async () => { await result.current.handleGithubHomeRefresh(); });
    expect(fetchOwners.mock.calls.map(([source]) => source)).toEqual(["https://github.com/Alpha", "https://github.com/Beta"]);
    const added = mode === "all-success" ? 2 : mode === "partial" ? 1 : 0;
    const skipped = mode === "all-success" || mode === "zero-new" ? 4 : mode === "partial" ? 2 : 0;
    const failed = mode === "all-failed" ? 2 : mode === "partial" ? 1 : 0;
    expect(result.current.githubRefreshReport).toMatchObject({ refreshedAt: "2026-11-01T02:30:00.000Z", refreshedOwners: 2, added, skipped, failed });
    expect(result.current.githubRefreshReport!.entries.map((entry) => entry.owner.login)).toEqual(["Alpha", "Beta"]);
    for (const entry of result.current.githubRefreshReport!.entries) {
      expect(entry).toMatchObject(entry.error
        ? { addedRepositories: [], skipped: 0, skippedActive: 0, skippedDeleted: 0, error: `Failed ${entry.owner.login}` }
        : { skipped: 2, skippedActive: 1, skippedDeleted: 1 });
      expect(entry.addedRepositories).toHaveLength(entry.error || mode === "zero-new" ? 0 : 1);
    }
    expect(result.current.githubBulkRefreshLoading).toBe(false);
    if (mode === "all-failed") {
      expect(api.batch).not.toHaveBeenCalled();
      expect(api.state()).toBe(initialState);
      expect(api.input.onNotice).toHaveBeenCalledExactlyOnceWith({ kind: "error", message: "全部 2 个作者仓库刷新失败。" });
    } else {
      expect(api.batch).toHaveBeenCalledTimes(1);
      expect(api.batch.mock.calls[0][0].map((entry) => entry.owner.login)).toEqual(mode === "partial" ? ["Beta"] : ["Alpha", "Beta"]);
      expect(api.input.onNotice).toHaveBeenCalledExactlyOnceWith({
        kind: mode === "partial" ? "error" : "success",
        message: `已刷新 ${mode === "partial" ? 1 : 2} 个作者仓库，新增 ${added} 个，跳过 ${skipped} 个。${mode === "partial" ? "失败 1 个。" : ""}`,
      });
    }
    const report = result.current.githubRefreshReport;
    act(() => result.current.closeGithubRefreshReport(true));
    expect(result.current.githubRefreshReport).toBe(report);
    act(() => result.current.closeGithubRefreshReport(false));
    expect(result.current.githubRefreshReport).toBeNull();
    expect(api.input.onSelectGroup).not.toHaveBeenCalled();
  });

  it("keeps requests serial and rendered busy protection while the current groups change", async () => {
    const alpha = deferred<GithubOwnerRepositories>();
    const beta = deferred<GithubOwnerRepositories>();
    fetchOwners.mockReturnValueOnce(alpha.promise).mockReturnValueOnce(beta.promise);
    const api = options();
    api.input.groups = [sourceGroup("Alpha", 1), sourceGroup("Beta", 2)];
    const { result, rerender } = renderHook((input) => useGithubRepositoryWorkflow(input), { initialProps: api.input });
    let refreshing!: Promise<void>;
    act(() => { refreshing = result.current.handleGithubHomeRefresh(); });
    expect(result.current.githubBulkRefreshLoading).toBe(true);
    expect(fetchOwners).toHaveBeenCalledExactlyOnceWith("https://github.com/Alpha");
    rerender({ ...api.input, groups: [sourceGroup("NewContext", 3)] });
    await act(async () => { await result.current.handleGithubHomeRefresh(); });
    expect(fetchOwners).toHaveBeenCalledTimes(1);
    await act(async () => { alpha.resolve(preview("Alpha")); });
    expect(fetchOwners.mock.calls.map(([source]) => source)).toEqual(["https://github.com/Alpha", "https://github.com/Beta"]);
    expect(api.batch).not.toHaveBeenCalled();
    await act(async () => { beta.resolve(preview("Beta")); await refreshing; });
    expect(api.batch).toHaveBeenCalledTimes(1);
    expect(result.current.githubRefreshReport!.entries.map((entry) => entry.owner.login)).toEqual(["Alpha", "Beta"]);
    expect(api.input.onSelectGroup).not.toHaveBeenCalled();
    act(() => result.current.closeGithubRefreshReport(false));
    fetchOwners.mockResolvedValueOnce(preview("NewContext"));
    await act(async () => { await result.current.handleGithubHomeRefresh(); });
    expect(fetchOwners).toHaveBeenLastCalledWith("https://github.com/NewContext");
    expect(api.batch).toHaveBeenCalledTimes(2);
    expect(result.current.githubRefreshReport!.entries.map((entry) => entry.owner.login)).toEqual(["NewContext"]);
  });

  it("preserves existing late-read completion while closed and clears it on the next opening", async () => {
    const pending = deferred<GithubOwnerRepositories>();
    fetchOwners.mockReturnValueOnce(pending.promise);
    const api = options();
    const { result } = renderHook(() => useGithubRepositoryWorkflow(api.input));
    act(() => result.current.openGithubRepositoryImport("https://github.com/Alpha"));
    let reading!: Promise<void>;
    act(() => { reading = result.current.handleGithubRepositoryRead("https://github.com/Alpha"); });
    act(() => result.current.closeGithubRepositoryImport(false));
    expect(result.current.githubImportLoading).toBe(true);
    await act(async () => { pending.resolve(preview()); await reading; });
    expect(result.current.githubImportOpen).toBe(false);
    expect(result.current.githubImportPreview?.owner.login).toBe("Alpha");
    act(() => result.current.openGithubRepositoryImport());
    expect(result.current).toMatchObject({ githubImportOpen: true, githubImportInitialUrl: "", githubImportPreview: null, githubImportLoading: false });
  });
});
