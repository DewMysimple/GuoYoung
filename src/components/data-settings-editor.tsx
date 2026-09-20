import { useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, CaretDown, CaretUp, DownloadSimple, Trash, UploadSimple } from "@phosphor-icons/react";
import type { SiteCollectionState, TrashRetentionDays } from "../types";
import { Favicon } from "./favicon";
import { getHostname } from "../lib/site-utils";
import "./settings-editors.css";

interface DataSettingsProps {
  state: SiteCollectionState;
  initialTrashOpen: boolean;
  onExport: () => void;
  onImport: () => void;
  onResetBookmarks: () => void;
  onClearHistory: () => void;
  onRestoreSite: (id: string) => void;
  onRestoreAllSites: () => void;
  onPermanentDeleteSite: (id: string) => void;
  onEmptyTrash: () => void;
  onTrashRetentionChange: (days: TrashRetentionDays) => void;
}

function formatTrashDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getTrashRemainingLabel(
  deletedAt: string,
  retention: TrashRetentionDays,
) {
  if (retention === null) return "不会自动清理";
  const elapsed = Math.max(0, Date.now() - Date.parse(deletedAt));
  const remaining = Math.max(
    0,
    Math.ceil((retention * 24 * 60 * 60 * 1000 - elapsed) / 86_400_000),
  );
  return `剩余 ${remaining} 天`;
}

export function DataSettingsEditor({ state, initialTrashOpen, onExport, onImport, onResetBookmarks, onClearHistory, onRestoreSite, onRestoreAllSites, onPermanentDeleteSite, onEmptyTrash, onTrashRetentionChange }: DataSettingsProps) {
  const [trashOpen, setTrashOpen] = useState(initialTrashOpen);
  const [armedTrashDeleteId, setArmedTrashDeleteId] = useState<string | null>(
    null,
  );
  const armedTrashTimerRef = useRef<number | null>(null);

  function clearArmedTrashDelete() {
    if (armedTrashTimerRef.current !== null) {
      window.clearTimeout(armedTrashTimerRef.current);
      armedTrashTimerRef.current = null;
    }
    setArmedTrashDeleteId(null);
  }

  function requestTrashDelete(id: string, action: () => void) {
    if (armedTrashDeleteId === id) {
      clearArmedTrashDelete();
      action();
      return;
    }
    clearArmedTrashDelete();
    setArmedTrashDeleteId(id);
    armedTrashTimerRef.current = window.setTimeout(() => {
      armedTrashTimerRef.current = null;
      setArmedTrashDeleteId(null);
    }, 2000);
  }

  useEffect(() => {
    if (!armedTrashDeleteId) return;
    const handlePointer = (event: globalThis.PointerEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-trash-delete-id]")
          : null;
      if (target?.dataset.trashDeleteId !== armedTrashDeleteId) {
        clearArmedTrashDelete();
      }
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") clearArmedTrashDelete();
    };
    window.addEventListener("pointerdown", handlePointer, true);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointer, true);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, [armedTrashDeleteId]);

  useEffect(
    () => () => {
      if (armedTrashTimerRef.current !== null) {
        window.clearTimeout(armedTrashTimerRef.current);
      }
    },
    [],
  );

  return (
              <div className="settings-section data-settings">
                <div className="data-overview" aria-label="收藏数据概况">
                  <span><strong>{state.sites.length}</strong>个收藏</span>
                  <span><strong>{state.groups.length}</strong>个分组</span>
                  <span><strong>{state.deletedSites.length}</strong>个待恢复</span>
                </div>
                <div className="settings-data-card">
                  <div>
                    <strong>导入与导出</strong>
                    <p>保存收藏、分组与外观的 JSON 备份。回收站、搜索历史和本地壁纸文件不包含在内。</p>
                  </div>
                  <div className="settings-inline-actions">
                    <button
                      type="button"
                      className="button secondary-button"
                      onClick={onImport}
                    >
                      <UploadSimple size={17} />导入
                    </button>
                    <button
                      type="button"
                      className="button secondary-button"
                      onClick={onExport}
                    >
                      <DownloadSimple size={17} />导出
                    </button>
                  </div>
                </div>
                <div className="settings-data-card">
                  <div>
                    <strong>最近搜索</strong>
                    <p>当前保存 {state.searchHistory.length} 条，仅存于本设备。</p>
                  </div>
                  <button
                    type="button"
                    className="button secondary-button"
                    disabled={!state.searchHistory.length}
                    onClick={onClearHistory}
                  >
                    清空历史
                  </button>
                </div>
                <div className="settings-data-card trash-settings-card">
                  <div className="trash-settings-summary">
                    <div>
                      <strong>链接回收站</strong>
                      <p>
                        当前有 {state.deletedSites.length} 个链接，可手动恢复或永久删除。
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button secondary-button trash-toggle-button"
                      aria-expanded={trashOpen}
                      onClick={() => {
                        clearArmedTrashDelete();
                        setTrashOpen((current) => !current);
                      }}
                    >
                      {trashOpen ? <CaretUp size={16} /> : <CaretDown size={16} />}
                      {trashOpen ? "收起" : "查看"}
                    </button>
                  </div>
                  {trashOpen && (
                    <div className="trash-settings-content">
                      <label className="trash-retention-field">
                        <span>自动清理</span>
                        <select
                          aria-label="回收站自动清理期限"
                          value={state.trashRetentionDays ?? "never"}
                          onChange={(event) =>
                            onTrashRetentionChange(
                              event.target.value === "never"
                                ? null
                                : (Number(event.target.value) as TrashRetentionDays),
                            )
                          }
                        >
                          <option value="7">7 天后</option>
                          <option value="30">30 天后</option>
                          <option value="90">90 天后</option>
                          <option value="never">永不自动清理</option>
                        </select>
                      </label>

                      {state.deletedSites.length > 0 ? (
                        <>
                          <div className="trash-list" aria-label="已删除链接">
                            {state.deletedSites
                              .slice()
                              .sort(
                                (a, b) =>
                                  Date.parse(b.deletedAt) - Date.parse(a.deletedAt),
                              )
                              .map((entry) => {
                                const armed = armedTrashDeleteId === entry.site.id;
                                return (
                                  <div className="trash-item" key={entry.site.id}>
                                    <Favicon site={entry.site} size="normal" />
                                    <span className="trash-item-copy">
                                      <strong title={entry.site.name}>{entry.site.name}</strong>
                                      <small>
                                        {getHostname(entry.site.url)} · {entry.originalGroupName}
                                      </small>
                                      <small>
                                        {formatTrashDate(entry.deletedAt)} ·{" "}
                                        {getTrashRemainingLabel(
                                          entry.deletedAt,
                                          state.trashRetentionDays,
                                        )}
                                      </small>
                                    </span>
                                    <span className="trash-item-actions">
                                      <button
                                        type="button"
                                        className="icon-button"
                                        aria-label={`恢复 ${entry.site.name}`}
                                        title="恢复链接"
                                        onClick={() => onRestoreSite(entry.site.id)}
                                      >
                                        <ArrowCounterClockwise size={16} />
                                      </button>
                                      <button
                                        type="button"
                                        className={`icon-button danger-action ${
                                          armed ? "is-delete-armed" : ""
                                        }`}
                                        data-trash-delete-id={entry.site.id}
                                        aria-pressed={armed}
                                        aria-label={
                                          armed
                                            ? `再次点击永久删除 ${entry.site.name}`
                                            : `永久删除 ${entry.site.name}`
                                        }
                                        title={armed ? "再次点击永久删除" : "永久删除"}
                                        onClick={() =>
                                          requestTrashDelete(entry.site.id, () =>
                                            onPermanentDeleteSite(entry.site.id),
                                          )
                                        }
                                      >
                                        <Trash size={16} />
                                      </button>
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                          <div className="trash-bulk-actions">
                            <button
                              type="button"
                              className="button secondary-button"
                              onClick={onRestoreAllSites}
                            >
                              <ArrowCounterClockwise size={16} />全部恢复
                            </button>
                            <button
                              type="button"
                              className={`button destructive-button ${
                                armedTrashDeleteId === "__all__"
                                  ? "is-delete-armed"
                                  : ""
                              }`}
                              data-trash-delete-id="__all__"
                              aria-pressed={armedTrashDeleteId === "__all__"}
                              onClick={() =>
                                requestTrashDelete("__all__", onEmptyTrash)
                              }
                            >
                              <Trash size={16} />
                              {armedTrashDeleteId === "__all__"
                                ? "再次点击清空"
                                : "清空回收站"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="trash-empty-state">回收站是空的。</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="settings-data-card danger-zone">
                  <div>
                    <strong>恢复默认收藏</strong>
                    <p>只替换网站、分组和排序，保留当前外观与壁纸。</p>
                  </div>
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={onResetBookmarks}
                  >
                    <ArrowCounterClockwise size={17} />恢复默认
                  </button>
                </div>
              </div>
  );
}
