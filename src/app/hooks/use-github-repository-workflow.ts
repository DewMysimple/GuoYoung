import { useState } from "react";
import type { GithubRefreshReport, GithubRefreshReportEntry } from "../../components/github-refresh-details-dialog";
import {
  createGithubRefreshNotice,
  deduplicateGithubRefreshSources,
  orderGithubRefreshEntries,
} from "../../features/github/model/repository-refresh";
import {
  fetchGithubOwnerRepositories,
  formatGithubRepositoryError,
  type GithubOwnerProfile,
  type GithubOwnerRepositories,
  type GithubRepositorySummary,
} from "../../lib/github-repository-api";
import { getGroupWorkspace } from "../../lib/github-workspace";
import type {
  GithubRepositoryBatchImport,
  GithubRepositoryBatchImportResult,
  GithubRepositoryImportResult,
} from "../../lib/site-state";
import type { SiteGroup } from "../../types";

export interface GithubRepositoryWorkflowOptions {
  groups: readonly SiteGroup[];
  importGithubRepositories: (
    owner: GithubOwnerProfile,
    repositories: GithubRepositorySummary[],
    selectedRepositoryIds?: Set<number>,
  ) => GithubRepositoryImportResult;
  importGithubRepositoryBatch: (imports: GithubRepositoryBatchImport[]) => GithubRepositoryBatchImportResult;
  onSelectGroup: (id: string) => void;
  onNotice: (notice: { kind: "success" | "error"; message: string }) => void;
  onCloseAddMenu: () => void;
}

/** useSiteHub owns collection data and saving; this Hook owns only the page workflow session. */
export function useGithubRepositoryWorkflow({
  groups,
  importGithubRepositories,
  importGithubRepositoryBatch,
  onSelectGroup,
  onNotice,
  onCloseAddMenu,
}: GithubRepositoryWorkflowOptions) {
  const [githubImportOpen, setGithubImportOpen] = useState(false);
  const [githubImportInitialUrl, setGithubImportInitialUrl] = useState("");
  const [githubImportPreview, setGithubImportPreview] = useState<GithubOwnerRepositories | null>(null);
  const [githubImportLoading, setGithubImportLoading] = useState(false);
  const [githubImportConfirming, setGithubImportConfirming] = useState(false);
  const [githubImportError, setGithubImportError] = useState<string | null>(null);
  const [githubBulkRefreshLoading, setGithubBulkRefreshLoading] = useState(false);
  const [githubRefreshReport, setGithubRefreshReport] = useState<GithubRefreshReport | null>(null);

  function openGithubRepositoryImport(profileUrl = "") {
    onCloseAddMenu();
    setGithubImportInitialUrl(profileUrl);
    setGithubImportPreview(null);
    setGithubImportError(null);
    setGithubImportOpen(true);
  }

  async function handleGithubRepositoryRead(input: string) {
    setGithubImportLoading(true);
    setGithubImportError(null);
    setGithubImportPreview(null);
    try {
      const result = await fetchGithubOwnerRepositories(input);
      if (result.repositories.length === 0) {
        setGithubImportError("这个作者或组织没有可导入的公开仓库。");
        return;
      }
      setGithubImportPreview(result);
    } catch (error) {
      setGithubImportError(formatGithubRepositoryError(error));
    } finally {
      setGithubImportLoading(false);
    }
  }

  function handleGithubRepositoryConfirm(selectedIds: Set<number>) {
    if (!githubImportPreview || selectedIds.size === 0) return;
    setGithubImportConfirming(true);
    try {
      const result = importGithubRepositories(
        githubImportPreview.owner,
        githubImportPreview.repositories,
        selectedIds,
      );
      setGithubImportOpen(false);
      setGithubImportPreview(null);
      setGithubImportError(null);
      onNotice({
        kind: "success",
        message: result.added > 0
          ? `已将 ${result.added} 个仓库添加到“${result.group?.name ?? githubImportPreview.owner.login}”，跳过 ${result.skipped} 个重复项。`
          : `没有新增仓库，已跳过 ${result.skipped} 个重复项。`,
      });
      if (result.group) onSelectGroup(result.group.id);
    } catch (error) {
      setGithubImportError(error instanceof Error ? error.message : "导入失败，请稍后重试。");
    } finally {
      setGithubImportConfirming(false);
    }
  }

  function closeGithubRepositoryImport(open: boolean) {
    setGithubImportOpen(open);
    if (!open) {
      setGithubImportPreview(null);
      setGithubImportError(null);
      setGithubImportInitialUrl("");
    }
  }

  function openGithubRefresh(group: SiteGroup) {
    const source = group.githubImportSource;
    if (!source) return;
    openGithubRepositoryImport(source.profileUrl);
  }

  async function handleGithubHomeRefresh() {
    if (githubBulkRefreshLoading) return;
    setGithubRefreshReport(null);
    const sources = deduplicateGithubRefreshSources(
      groups
        .filter(
          (group) =>
            getGroupWorkspace(group) === "github" && group.githubImportSource,
        )
        .map((group) => group.githubImportSource!),
    );

    if (sources.length === 0) {
      openGithubRepositoryImport();
      return;
    }

    setGithubBulkRefreshLoading(true);
    const imports: GithubRepositoryBatchImport[] = [];
    const failures: GithubRefreshReportEntry[] = [];
    try {
      for (const source of sources) {
        try {
          imports.push(await fetchGithubOwnerRepositories(source.profileUrl));
        } catch (error) {
          failures.push({
            owner: source,
            addedRepositories: [],
            skipped: 0,
            skippedActive: 0,
            skippedDeleted: 0,
            error: formatGithubRepositoryError(error),
          });
        }
      }

      if (imports.length === 0) {
        setGithubRefreshReport({
          refreshedAt: new Date().toISOString(),
          refreshedOwners: sources.length,
          added: 0,
          skipped: 0,
          failed: failures.length,
          entries: failures,
        });
        onNotice({
          kind: "error",
          message: `全部 ${sources.length} 个作者仓库刷新失败。`,
        });
        return;
      }

      const result = importGithubRepositoryBatch(imports);
      const entries = orderGithubRefreshEntries<GithubRefreshReportEntry>(
        sources,
        result.details,
        failures,
      );
      setGithubRefreshReport({
        refreshedAt: new Date().toISOString(),
        refreshedOwners: sources.length,
        added: result.added,
        skipped: result.skipped,
        failed: failures.length,
        entries,
      });
      onNotice(createGithubRefreshNotice(
        imports.length,
        result.added,
        result.skipped,
        failures.length,
      ));
    } finally {
      setGithubBulkRefreshLoading(false);
    }
  }

  function closeGithubRefreshReport(open: boolean) {
    if (!open) setGithubRefreshReport(null);
  }

  return {
    githubImportOpen,
    githubImportInitialUrl,
    githubImportPreview,
    githubImportLoading,
    githubImportConfirming,
    githubImportError,
    githubBulkRefreshLoading,
    githubRefreshReport,
    openGithubRepositoryImport,
    handleGithubRepositoryRead,
    handleGithubRepositoryConfirm,
    closeGithubRepositoryImport,
    openGithubRefresh,
    handleGithubHomeRefresh,
    closeGithubRefreshReport,
  };
}
