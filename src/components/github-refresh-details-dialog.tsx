import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle, GithubLogo, X, WarningCircle } from "@phosphor-icons/react";
import { useId } from "react";
import type { GithubOwnerProfile, GithubRepositorySummary } from "../lib/github-repository-api";

export interface GithubRefreshReportEntry {
  owner: GithubOwnerProfile;
  addedRepositories: GithubRepositorySummary[];
  skipped: number;
  skippedActive: number;
  skippedDeleted: number;
  error?: string;
}

export interface GithubRefreshReport {
  refreshedAt: string;
  refreshedOwners: number;
  added: number;
  skipped: number;
  failed: number;
  entries: GithubRefreshReportEntry[];
}

interface GithubRefreshDetailsDialogProps {
  open: boolean;
  report: GithubRefreshReport | null;
  onOpenChange: (open: boolean) => void;
}

function formatRefreshedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚完成";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function skippedLabel(entry: GithubRefreshReportEntry): string {
  const parts: string[] = [];
  if (entry.skippedActive > 0) parts.push(`${entry.skippedActive} 个已收藏`);
  if (entry.skippedDeleted > 0) parts.push(`${entry.skippedDeleted} 个回收站`);
  const other = entry.skipped - entry.skippedActive - entry.skippedDeleted;
  if (other > 0) parts.push(`${other} 个无效项`);
  return parts.length ? `跳过 ${parts.join("、")}` : "没有重复项";
}

export function GithubRefreshDetailsDialog({
  open,
  report,
  onOpenChange,
}: GithubRefreshDetailsDialogProps) {
  const titleId = useId();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content github-refresh-dialog"
          aria-labelledby={titleId}
        >
          <div className="dialog-header">
            <div>
              <Dialog.Title id={titleId} className="dialog-title">
                GitHub 刷新详情
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                {report ? `完成于 ${formatRefreshedAt(report.refreshedAt)}` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="关闭">
                <X size={19} />
              </button>
            </Dialog.Close>
          </div>

          {report && (
            <>
              <div className="github-refresh-summary" aria-label="刷新汇总">
                <div className="github-refresh-stat">
                  <strong>{report.refreshedOwners}</strong>
                  <span>个作者</span>
                </div>
                <div className="github-refresh-stat is-success">
                  <strong>{report.added}</strong>
                  <span>新增仓库</span>
                </div>
                <div className="github-refresh-stat">
                  <strong>{report.skipped}</strong>
                  <span>跳过重复</span>
                </div>
                <div className={`github-refresh-stat ${report.failed ? "is-error" : "is-success"}`}>
                  <strong>{report.failed}</strong>
                  <span>刷新失败</span>
                </div>
              </div>

              <div className="github-refresh-details" aria-label="作者刷新详情">
                {report.entries.map((entry) => {
                  const failed = Boolean(entry.error);
                  return (
                    <article
                      className={`github-refresh-detail ${failed ? "is-error" : ""}`}
                      key={`${entry.owner.login}-${entry.owner.profileUrl}`}
                    >
                      <div className="github-refresh-detail-header">
                        <div className="github-refresh-owner">
                          <GithubLogo size={18} weight="fill" />
                          <div>
                            <strong>{entry.owner.name || entry.owner.login}</strong>
                            <span>@{entry.owner.login}</span>
                          </div>
                        </div>
                        <span className={`github-refresh-status ${failed ? "is-error" : "is-success"}`}>
                          {failed ? <WarningCircle size={15} /> : <CheckCircle size={15} />}
                          {failed ? "刷新失败" : `新增 ${entry.addedRepositories.length} 个`}
                        </span>
                      </div>

                      {failed ? (
                        <p className="github-refresh-error" role="alert">
                          {entry.error}
                        </p>
                      ) : (
                        <>
                          {entry.addedRepositories.length > 0 ? (
                            <ul className="github-refresh-repository-list">
                              {entry.addedRepositories.map((repository) => (
                                <li key={`${repository.id}-${repository.htmlUrl}`}>
                                  <a
                                    href={repository.htmlUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {repository.fullName}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="github-refresh-empty">没有新增仓库</p>
                          )}
                          <span className="github-refresh-skipped">{skippedLabel(entry)}</span>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>

              <div className="dialog-footer github-refresh-footer">
                <Dialog.Close asChild>
                  <button type="button" className="button primary-button">
                    知道了
                  </button>
                </Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
