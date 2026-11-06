import { ArrowClockwise, BookmarkSimple, FolderSimple, Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DataImportOperation } from "../hooks/use-site-hub";
import {
  deleteBookmarkSelection, getBrowserBookmarkRoots, getDescendantIds, indexBookmarkTree,
  summarizeBookmarkDeletion, type BookmarkDeleteSummary, type BookmarkImportOptions,
} from "../lib/bookmark-manager";
import type { BrowserBookmarksApi, BrowserBookmarkTreeNode } from "../lib/browser-runtime";
import { applyDataImport, type BookmarkImportRequest, type ImportRequest } from "../lib/data-workspace";
import { getWorkspaceGroups } from "../lib/github-workspace";
import { getGroupPath, getGroupsInTreeOrder } from "../lib/group-hierarchy";
import type { SiteCollectionState } from "../types";
import { ConfirmDialog } from "./confirm-dialog";
import { SelectMenu } from "./select-menu";
import "./bookmark-data-workspace.css";

interface Props {
  api?: BrowserBookmarksApi;
  state: SiteCollectionState;
  onImport: (request: ImportRequest) => DataImportOperation;
  importOperation: DataImportOperation | null;
  onRetrySave: () => Promise<boolean>;
}

type Notice = { kind: "status" | "alert"; text: string };

interface TreeItemProps {
  node: BrowserBookmarkTreeNode;
  ancestors: string[];
  selection: Map<string, { size: number; selected: number }>;
  disabled: boolean;
  onToggle: (node: BrowserBookmarkTreeNode) => void;
}

function BookmarkTreeItem({ node, ancestors, selection, disabled, onToggle }: TreeItemProps) {
  const title = node.title.trim() || (node.url ? "未命名书签" : "未命名文件夹");
  const path = [...ancestors, title];
  const counts = selection.get(node.id)!;
  const checked = counts.selected === counts.size;
  const row = <>
    <input type="checkbox" aria-label={`选择 ${path.join(" / ")}`} checked={checked} disabled={disabled}
      ref={input => { if (input) input.indeterminate = !checked && counts.selected > 0; }}
      onChange={() => onToggle(node)} />
    {node.url ? <BookmarkSimple aria-hidden="true" size={17} /> : <FolderSimple aria-hidden="true" size={17} />}
    <span title={node.url || title}>{title}</span>
    {node.url && <small title={node.url}>{node.url}</small>}
  </>;
  return <li>
    {node.children?.length ? <details open={!ancestors.length || undefined}>
      <summary><span className="bookmark-data-row">{row}</span></summary>
      <ul>{node.children.map(child => <BookmarkTreeItem key={child.id} node={child} ancestors={path}
        selection={selection} disabled={disabled} onToggle={onToggle} />)}</ul>
    </details> : <div className="bookmark-data-leaf bookmark-data-row">{row}</div>}
  </li>;
}

function getTreeSelection(roots: BrowserBookmarkTreeNode[], selectedIds: ReadonlySet<string>) {
  const result = new Map<string, { size: number; selected: number }>();
  function visit(node: BrowserBookmarkTreeNode) {
    const counts = { size: 1, selected: Number(selectedIds.has(node.id)) };
    for (const child of node.children ?? []) {
      const nested = visit(child);
      counts.size += nested.size;
      counts.selected += nested.selected;
    }
    result.set(node.id, counts);
    return counts;
  }
  roots.forEach(visit);
  return result;
}

function getDeletionFingerprint(summary: BookmarkDeleteSummary) {
  return [...indexBookmarkTree(summary.roots).values()].map(({ node }) =>
    JSON.stringify([node.id, node.parentId, node.title, node.url]),
  ).sort();
}

export function BookmarkDataWorkspace({ api, state, onImport, importOperation, onRetrySave }: Props) {
  const [roots, setRoots] = useState<BrowserBookmarkTreeNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<NonNullable<BookmarkImportOptions["mode"]>>("preserve");
  const [targetId, setTargetId] = useState<string>();
  const [reading, setReading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [confirmation, setConfirmation] = useState<"import" | "delete">();
  const [attempt, setAttempt] = useState<DataImportOperation>();
  const generation = useRef(0);
  const actionPending = useRef(false);

  const active = attempt && importOperation?.id === attempt.id ? importOperation : attempt;
  const busy = reading || deleting || active?.status === "saving" || active?.status === "failed";
  const groups = useMemo(() => getGroupsInTreeOrder(getWorkspaceGroups(state.groups, "main")), [state.groups]);
  const targetGroupId = targetId ?? (groups.find(group => group.isProtected) ?? groups[0])?.id ?? "";
  const index = useMemo(() => indexBookmarkTree(roots), [roots]);
  const treeSelection = useMemo(() => getTreeSelection(roots, selectedIds), [roots, selectedIds]);
  const selectedLinks = [...selectedIds].filter(id => Boolean(index.get(id)?.node.url)).length;
  const request = useMemo<BookmarkImportRequest | null>(() => selectedIds.size
    ? { bookmarks: { roots, selectedIds, targetGroupId, mode } }
    : null, [roots, selectedIds, targetGroupId, mode]);
  const preview = useMemo(() => {
    if (!request) return null;
    try { return { result: applyDataImport(state, request) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "无法预览书签" }; }
  }, [request, state]);
  const removal = useMemo(() => summarizeBookmarkDeletion(roots, selectedIds), [roots, selectedIds]);

  const reload = useCallback(async () => {
    if (!api) return;
    const token = ++generation.current;
    setReading(true);
    setNotice(undefined);
    try {
      const tree = getBrowserBookmarkRoots(await api.getTree());
      if (token !== generation.current) return;
      setRoots(tree);
      setSelectedIds(new Set());
    } catch {
      if (token === generation.current) setNotice({ kind: "alert", text: "无法读取浏览器书签，请重试。" });
    } finally {
      if (token === generation.current) setReading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
    return () => { generation.current++; };
  }, [reload]);

  useEffect(() => {
    if (!active || active.status === "saving" || active.status === "failed") return;
    actionPending.current = false;
    if (active.status === "saved") setSelectedIds(new Set());
  }, [active]);

  function toggleNode(node: BrowserBookmarkTreeNode) {
    const ids = getDescendantIds(node);
    setSelectedIds(current => {
      const next = new Set(current);
      if (ids.some(id => !current.has(id))) ids.forEach(id => next.add(id));
      else {
        ids.forEach(id => next.delete(id));
        index.get(node.id)?.ancestorIds.forEach(id => next.delete(id));
      }
      return next;
    });
    setAttempt(undefined);
  }

  function confirmImport() {
    if (!request || actionPending.current) return;
    actionPending.current = true;
    setNotice(undefined);
    try { setAttempt(onImport(request)); }
    catch (error) {
      actionPending.current = false;
      setNotice({ kind: "alert", text: error instanceof Error ? error.message : "导入书签失败。" });
    }
  }

  async function confirmDeletion() {
    if (!api || actionPending.current || !removal.roots.length) return;
    actionPending.current = true;
    setDeleting(true);
    setNotice(undefined);
    setAttempt(undefined);
    const token = generation.current;
    try {
      const latest = getBrowserBookmarkRoots(await api.getTree());
      if (token !== generation.current) return;
      const currentRemoval = summarizeBookmarkDeletion(latest, selectedIds);
      const before = getDeletionFingerprint(removal);
      const current = getDeletionFingerprint(currentRemoval);
      if (before.length !== current.length || before.some((id, index) => id !== current[index])) {
        setRoots(latest);
        setSelectedIds(new Set());
        setNotice({ kind: "alert", text: "浏览器书签已变化，请重新选择并确认删除。" });
        return;
      }
      const result = await deleteBookmarkSelection(api, currentRemoval);
      if (token !== generation.current) return;
      setSelectedIds(new Set());
      const text = `浏览器书签已删除 ${result.deleted} 项，失败 ${result.failed} 项。`;
      try {
        const refreshed = getBrowserBookmarkRoots(await api.getTree());
        if (token !== generation.current) return;
        setRoots(refreshed);
        setNotice({ kind: result.failed ? "alert" : "status", text });
      } catch {
        if (token !== generation.current) return;
        setRoots([]);
        setNotice({ kind: "alert", text: `${text}无法刷新列表，请重新读取书签。` });
      }
    } catch {
      if (token === generation.current) setNotice({ kind: "alert", text: "无法读取最新书签，删除操作未执行。" });
    } finally {
      actionPending.current = false;
      if (token === generation.current) setDeleting(false);
    }
  }

  const result = preview?.result;
  const stats = result?.bookmarkStats;
  const finished = active?.result.bookmarkStats;
  const completedText = active?.status === "saved" && finished
    ? `已导入 ${active.result.added} 个网站，跳过 ${active.result.skipped} 个重复链接，${finished.failed} 个链接无效。新建 ${finished.createdRoots} 个一级组、${finished.createdChildren} 个子分组。`
    : undefined;

  if (!api) return <div className="data-card"><h2>浏览器书签</h2><p>请在 Mysimple 浏览器扩展中打开数据页来读取浏览器书签。</p></div>;

  return <>
    {notice && <div className={`data-notice ${notice.kind === "alert" ? "is-error" : ""}`} role={notice.kind}>{notice.text}</div>}
    {completedText && <div className="data-notice" role="status">{completedText}</div>}
    {active?.status === "saving" && <div className="data-notice" role="status">正在保存书签导入结果…</div>}
    {active?.status === "failed" && <div className="data-notice is-error" role="alert">导入结果已在当前页面，尚未确认保存成功。请重试保存。
      <button type="button" className="button secondary-button" onClick={() => void onRetrySave()}>重试保存导入结果</button>
    </div>}
    {active?.status === "superseded" && <div className="data-notice is-error" role="alert">本次导入结果已被后续数据替换，请重新预览。</div>}
    <div className="data-page-grid">
      <section className="data-card" aria-label="浏览器原始书签树">
        <div className="data-section-heading"><span>01</span><div><h2>选择浏览器书签</h2><p>展开文件夹查看原始路径，也可选择整个文件夹。</p></div></div>
        <div className="data-picker-summary bookmark-data-toolbar">
          <span>已选 {selectedLinks} 个网站</span>
          <button type="button" className="data-text-button" disabled={busy || !roots.length} onClick={() => { setAttempt(undefined); setSelectedIds(new Set(index.keys())); }}>全选</button>
          <button type="button" className="data-text-button" disabled={busy || !selectedIds.size} onClick={() => { setAttempt(undefined); setSelectedIds(new Set()); }}>清空选择</button>
          <button type="button" className="button secondary-button" disabled={busy} onClick={() => { setAttempt(undefined); void reload(); }}><ArrowClockwise size={16} />刷新书签</button>
        </div>
        {reading ? <p role="status">正在读取浏览器书签…</p> : roots.length ?
          <ul className="bookmark-data-tree">{roots.map(node => <BookmarkTreeItem key={node.id} node={node} ancestors={[]} selection={treeSelection} disabled={busy} onToggle={toggleNode} />)}</ul>
          : <p>没有可显示的书签。</p>}
        <label className="data-field"><span>导入方式</span><SelectMenu ariaLabel="书签导入方式" disabled={busy} value={mode} onChange={setMode} options={[
          { value: "preserve", label: "保留文件夹路径" }, { value: "target", label: "全部复制到一个分组" },
        ]} /></label>
        <label className="data-field"><span>{mode === "preserve" ? "散放书签" : "目标分组"}</span><SelectMenu ariaLabel="书签目标分组" disabled={busy}
          value={targetGroupId} onChange={setTargetId} options={groups.map(group => ({ value: group.id, label: getGroupPath(groups, group.id) }))}
          renderTrigger={selected => selected?.label ?? "请选择目标分组"} /></label>
        <div className="data-footnote bookmark-data-native-actions">
          <div><strong>原生书签管理</strong><p>删除会修改浏览器书签，Mysimple 已收藏的网站会保留。</p></div>
          <button type="button" className="button secondary-button" disabled={busy || !removal.roots.length} onClick={() => setConfirmation("delete")}><Trash size={17} />删除所选书签</button>
        </div>
      </section>
      <aside className="data-card data-review" aria-label="书签导入预览">
        <span className="data-eyebrow">导入预览</span><h2>复制到 Mysimple</h2>
        {preview?.error && <p role="alert">{preview.error}</p>}
        {result && stats ? <>
          <dl><div><dt>新增网站</dt><dd>{result.added}</dd></div><div><dt>重复跳过</dt><dd>{result.skipped}</dd></div><div><dt>无效链接</dt><dd>{stats.failed}</dd></div>
            <div><dt>新建一级组</dt><dd>{stats.createdRoots}</dd></div><div><dt>新建子分组</dt><dd>{stats.createdChildren}</dd></div></dl>
          {stats.mappings.length > 0 && <ul className="bookmark-data-mappings" aria-label="导入目标路径">{stats.mappings.map(mapping => <li key={JSON.stringify([mapping.sourcePath, mapping.targetPath])}>
            <span>{mapping.sourcePath.join(" / ") || "散放书签"}</span><strong>{mapping.targetPath}</strong>
            <small>{mapping.links} 个网站{mapping.combined ? " · 深层路径合并" : ""}</small>
          </li>)}</ul>}
        </> : <p>选择书签后可查看目标路径、新建分组和网站数量。</p>}
        <button type="button" className="button primary-button" disabled={busy || !result || (result.added + result.created === 0)} onClick={() => setConfirmation("import")}>预览并导入书签</button>
        <div className="data-footnote"><p>导入会复制网站到 Mysimple。路径超过两级时，较深的文件夹名称会合并在二级分组中。</p><p>具体 GitHub 链接会归到 GitHub 工作区的「其他」。</p></div>
      </aside>
    </div>
    <ConfirmDialog open={confirmation === "import"} onOpenChange={open => { if (!open) setConfirmation(undefined); }}
      title="导入浏览器书签？" description={`新增 ${result?.added ?? 0} 个网站和 ${result?.created ?? 0} 个分组。浏览器原始书签会保留。`}
      confirmLabel="确认导入书签" onConfirm={confirmImport} />
    <ConfirmDialog open={confirmation === "delete"} onOpenChange={open => { if (!open) setConfirmation(undefined); }} destructive
      title="删除浏览器书签？" description={`将从浏览器移除 ${removal.bookmarkCount} 个书签、${removal.folderCount} 个文件夹。此操作无法在 Mysimple 中撤销。`}
      confirmLabel="确认删除书签" onConfirm={() => void confirmDeletion()} />
  </>;
}
