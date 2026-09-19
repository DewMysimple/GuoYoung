import { DialogNavigation } from "./dialog-navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, GithubLogo, LinkSimple, Spinner } from "@phosphor-icons/react";
import type { SiteCollectionState } from "../types";
import type {
  GithubOwnerRepositories,
} from "../lib/github-repository-api";
import {
  getGithubRepositoryStatuses,
  type GithubRepositoryStatus,
} from "../lib/site-state";

interface GithubRepositoryImportDialogProps {
  open: boolean;
  state: SiteCollectionState;
  preview: GithubOwnerRepositories | null;
  loading: boolean;
  error?: string | null;
  confirming?: boolean;
  initialInput?: string;
  onOpenChange: (open: boolean) => void;
  onRead: (input: string) => void;
  onConfirm: (selectedIds: Set<number>) => void;
}

function statusLabel(status: GithubRepositoryStatus): string {
  if (status === "active") return "已收藏";
  if (status === "deleted") return "回收站中";
  return "待添加";
}

export function GithubRepositoryImportDialog({
  open,
  state,
  preview,
  loading,
  error,
  confirming = false,
  initialInput = "",
  onOpenChange,
  onRead,
  onConfirm,
}: GithubRepositoryImportDialogProps) {
  const [input, setInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const titleId = useId();
  const previousPreview = useRef(preview);
  const wasOpen = useRef(false);
  const statuses = useMemo(
    () => getGithubRepositoryStatuses(state, preview?.repositories ?? []),
    [state.sites, state.deletedSites, preview],
  );

  useEffect(() => {
    if (!open) return;
    setInput(initialInput);
  }, [initialInput, open]);

  useEffect(() => {
    const initialize = open && (!wasOpen.current || preview !== previousPreview.current);
    wasOpen.current = open;
    previousPreview.current = preview;
    if (!open) return;
    setSelectedIds((current) => new Set(
      [...statuses].filter(([id, status]) => status === "new" && (initialize || current.has(id))).map(([id]) => id),
    ));
  }, [open, preview, statuses]);

  function submitInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRead(input);
  }

  function toggleRepository(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const counts = { new: 0, active: 0, deleted: 0 };
  statuses.forEach((status) => { counts[status] += 1; });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content github-import-dialog"
          aria-labelledby={titleId}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("github-owner-url")?.focus();
          }}
        >
          <div className="dialog-header">
            <div>
              <Dialog.Title id={titleId} className="dialog-title">
                导入作者仓库
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                输入 GitHub 作者或组织主页，读取公开仓库后再确认添加。
              </Dialog.Description>
            </div>
            <DialogNavigation />
          </div>

          <form className="github-import-form" onSubmit={submitInput}>
            <label htmlFor="github-owner-url">作者或组织主页</label>
            <div className="input-shell">
              <LinkSimple size={18} aria-hidden="true" />
              <input
                id="github-owner-url"
                inputMode="url"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://github.com/用户名"
                disabled={loading || confirming}
              />
              <button
                type="submit"
                className="button secondary-button github-import-read"
                disabled={loading || confirming || !input.trim()}
              >
                {loading ? <Spinner size={16} className="spin" /> : <GithubLogo size={16} />}
                {loading ? "读取中" : "读取仓库"}
              </button>
            </div>
            <p className="field-help">
              仅读取公开仓库，不需要登录；默认包括 fork 和归档仓库。
            </p>
          </form>

          {error && (
            <p className="field-error github-import-error" role="alert">
              {error}
            </p>
          )}

          {preview && !loading && (
            <section className="github-import-preview" aria-label="仓库导入预览">
              <div className="github-import-summary">
                <div className="github-import-owner">
                  <GithubLogo size={20} weight="fill" />
                  <div>
                    <strong>{preview.owner.name || preview.owner.login}</strong>
                    <span>
                      {preview.owner.entityType === "organization" ? "组织" : "作者"} · {preview.owner.login}
                    </span>
                  </div>
                </div>
                <span className="github-import-count">
                  {preview.repositories.length} 个公开仓库
                </span>
              </div>

              <div className="github-import-statuses">
                <span>可添加 {counts.new}</span>
                <span>已收藏 {counts.active}</span>
                <span>回收站 {counts.deleted}</span>
              </div>

              <div className="github-import-list">
                {preview.repositories.map((repository) => {
                  const status = statuses.get(repository.id)!;
                  const selectable = status === "new";
                  return (
                    <label
                      key={repository.id}
                      className={`github-import-row ${selectable ? "" : "is-skipped"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectable && selectedIds.has(repository.id)}
                        disabled={!selectable || confirming}
                        onChange={() => toggleRepository(repository.id)}
                      />
                      <span className="github-import-repo-copy">
                        <strong>{repository.name}</strong>
                        <small>{repository.fullName}</small>
                      </span>
                      <span className={`github-import-repo-status ${status}`}>
                        {status === "new" && selectedIds.has(repository.id) && (
                          <Check size={13} weight="bold" />
                        )}
                        {statusLabel(status)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          <div className="dialog-footer">
            <Dialog.Close asChild>
              <button type="button" className="button secondary-button" disabled={loading || confirming}>
                取消
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="button primary-button"
              disabled={!preview || selectedIds.size === 0 || loading || confirming}
              onClick={() => onConfirm(new Set(selectedIds))}
            >
              {confirming ? "保存中" : `确认添加${selectedIds.size ? ` ${selectedIds.size} 项` : ""}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
