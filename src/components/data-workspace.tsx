import { HelpTip } from "./help-tip";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Database, DownloadSimple, FileArrowUp, FolderSimple, UploadSimple } from "@phosphor-icons/react";
import type { SiteCollectionState, SiteWorkspace } from "../types";
import { applyDataImport, collectionTransferGroups, createSelectedGroupsExport, parseTransferFile, type ImportRequest, type TransferFile, type TransferGroup } from "../lib/data-workspace";
import { downloadExport, downloadJson } from "../lib/data-transfer";
import { getGroupWorkspace } from "../lib/github-workspace";
import { SelectMenu } from "./select-menu";
import { ConfirmDialog } from "./confirm-dialog";
import "./data-workspace.css";

export interface DataWorkspaceContext { mode: "import" | "export"; groupId?: string }
interface Props {
  state: SiteCollectionState; context: DataWorkspaceContext; onBack: () => void;
  onImport: (request: ImportRequest) => ReturnType<typeof applyDataImport>;
}

function GroupChoices({ groups, selected, onChange }: { groups: TransferGroup[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <div className="data-group-picker">
    <div className="data-picker-summary"><span>已选择 {groups.filter(group => selected.includes(group.key)).length} / {groups.length} 个分组</span>
      <button type="button" className="data-text-button" onClick={() => onChange(groups.map(group => group.key))}>全选</button>
      <button type="button" className="data-text-button" onClick={() => onChange([])}>清空选择</button>
    </div>
    <div className="data-group-list">{groups.map(group => <label key={group.key} className={`data-group-choice ${selected.includes(group.key) ? "is-selected" : ""}`}>
      <input type="checkbox" checked={selected.includes(group.key)} onChange={event => onChange(event.target.checked ? [...selected, group.key] : selected.filter(id => id !== group.key))} />
      <FolderSimple size={20} /><span><strong>{group.payload.group.name}</strong><small>{group.workspace === "github" ? "GitHub" : "收藏主页"} · {group.payload.sites.length} 个链接</small></span>
    </label>)}</div>
  </div>;
}

export function DataWorkspace({ state, context, onBack, onImport }: Props) {
  const [mode, setMode] = useState(context.mode);
  const [exportScope, setExportScope] = useState(context.groupId ? "groups" : "all");
  const [exportIds, setExportIds] = useState<string[]>(context.groupId ? [context.groupId] : []);
  const [file, setFile] = useState<TransferFile | null>(null);
  const [filename, setFilename] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [destination, setDestination] = useState<"new" | "existing" | "replace">(context.groupId ? "existing" : "new");
  const [targetId, setTargetId] = useState(context.groupId ?? "");
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState<"source" | SiteWorkspace>("source");
  const [notice, setNotice] = useState<{ error?: boolean; text: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { heading.current?.focus(); }, []);
  const groups = useMemo(() => collectionTransferGroups(state), [state]);
  const request = useMemo<ImportRequest | null>(() => file ? ({ file, keys: sourceIds, destination: destination === "existing" ? { kind: "existing", groupId: targetId }
    : destination === "replace" ? { kind: "replace" } : { kind: "new", name, workspace: workspace === "source" ? undefined : workspace } }) : null,
    [file, sourceIds, destination, targetId, name, workspace]);
  const preview = useMemo(() => {
    if (!request) return null;
    try { return { result: applyDataImport(state, request) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "无法预览" }; }
  }, [state, request]);

  async function readFile(value: File) {
    const token = ++generation.current;
    setReading(true); setNotice(null); setFile(null); setFilename(""); setConfirming(false);
    try {
      const parsed = parseTransferFile(await value.text());
      if (token !== generation.current) return;
      setFile(parsed); setFilename(value.name); setSourceIds(parsed.groups.map(group => group.key));
      setName(parsed.groups.length === 1 ? parsed.groups[0].payload.group.name : "");
      setDestination(context.groupId ? "existing" : "new"); setWorkspace("source");
    } catch (error) {
      if (token === generation.current) setNotice({ error: true, text: error instanceof Error ? error.message : "无法读取文件" });
    } finally { if (token === generation.current) setReading(false); }
  }
  function exportData() {
    try {
      if (exportScope === "all") downloadExport(state);
      else downloadJson(JSON.stringify(createSelectedGroupsExport(state, exportIds), null, 2), `site-hub-groups-${new Date().toISOString().slice(0, 10)}.json`);
      setNotice({ text: "已生成 JSON 文件，请在浏览器下载中查看。" });
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "导出失败，请检查下载权限。" }); }
  }
  const result = preview?.result;
  return <section className="data-workspace" aria-label="数据页面">
    <header className="data-page-heading">
      <button type="button" className="icon-button" aria-label="返回收藏" onClick={onBack}><ArrowLeft size={20} /></button>
      <div><span className="data-eyebrow">你的收藏，自由迁移</span><h1 ref={heading} tabIndex={-1}><Database size={28} />数据</h1><p>备份全部收藏，或挑选分组与另一台设备分享。</p></div>
      <div className="data-page-count"><strong>{state.sites.length}</strong><span>个链接 · {state.groups.length} 个分组</span></div>
    </header>
    <div className="data-mode-switch" aria-label="数据操作">
      <button type="button" aria-pressed={mode === "import"} onClick={() => { setMode("import"); setNotice(null); }}><UploadSimple size={19} />导入</button>
      <button type="button" aria-pressed={mode === "export"} onClick={() => { setMode("export"); setNotice(null); }}><DownloadSimple size={19} />导出</button>
    </div>
    {notice && <div className={`data-notice ${notice.error ? "is-error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.text}</div>}
    <div className="data-page-grid"><div className="data-card">
      {mode === "import" ? <>
        <div className="data-section-heading"><span>01</span><div><h2>选择要导入的文件</h2><p>支持整库备份、单个分组和分组集合。</p></div></div>
        <button type="button" className="data-file-drop" disabled={reading} onClick={() => input.current?.click()}><FileArrowUp size={32} /><strong>{reading ? "正在读取…" : filename || "选择 JSON 文件"}</strong><span>{file ? "点击更换文件" : "先预览内容，再决定放在哪里"}</span></button>
        <input ref={input} className="visually-hidden" type="file" accept=".json,application/json" aria-label="选择要导入的数据文件" onChange={event => { const value = event.target.files?.[0]; event.target.value = ""; if (value) void readFile(value); }} />
        {file && <>
          <div className="data-section-heading"><span>02</span><div><h2>选择内容与位置</h2><p>{file.backup ? "整库备份也可以只取出其中的分组。" : "选择需要的分组，按你的方式归档。"}</p></div></div>
          {destination !== "replace" && <GroupChoices groups={file.groups} selected={sourceIds} onChange={setSourceIds} />}
          <label className="data-field"><span>导入方式</span><SelectMenu ariaLabel="导入方式" value={destination} onChange={setDestination} options={[
            { value: "new", label: "新建分组导入" }, { value: "existing", label: "追加到已有分组" }, ...(file.backup ? [{ value: "replace" as const, label: "替换全局数据" }] : []),
          ]} /></label>
          {destination === "existing" && <label className="data-field"><span>目标分组</span><SelectMenu ariaLabel="目标分组" value={targetId} onChange={setTargetId} options={state.groups.map(group => ({ value: group.id, label: `${getGroupWorkspace(group) === "github" ? "GitHub" : "收藏主页"} / ${group.name}` }))} renderTrigger={selected => selected?.label ?? "请选择目标分组"} /></label>}
          {destination === "new" && <>
            {sourceIds.length === 1 && <label className="data-field"><span>新分组名称</span><input value={name} placeholder="沿用来源分组名称" onChange={event => setName(event.target.value)} maxLength={100} /></label>}
            <label className="data-field"><span>创建位置</span><SelectMenu ariaLabel="创建位置" value={workspace} onChange={setWorkspace} options={[{ value: "source", label: "沿用来源工作区" }, { value: "main", label: "收藏主页" }, { value: "github", label: "GitHub" }]} /></label>
          </>}
        </>}
      </> : <>
        <div className="data-section-heading"><span>01</span><div><h2>选择导出范围</h2><p>用于迁移备份，或只分享你挑选的收藏。</p></div></div>
        <div className="data-scope-options">
          <button type="button" aria-pressed={exportScope === "all"} onClick={() => setExportScope("all")}><Database size={25} /><strong>全局备份</strong><span>全部链接、分组与外观设置</span></button>
          <button type="button" aria-pressed={exportScope === "groups"} onClick={() => setExportScope("groups")}><FolderSimple size={25} /><strong>指定分组</strong><span>自由选择一个或多个分组</span></button>
        </div>
        {exportScope === "groups" && <GroupChoices groups={groups} selected={exportIds} onChange={setExportIds} />}
      </>}
    </div><aside className="data-card data-review">
      <span className="data-eyebrow">{mode === "import" ? "导入预览" : "导出概况"}</span>
      <h2>{mode === "import" ? (destination === "replace" ? "替换前，确认一下" : "让收藏各就各位") : "一份随时可用的副本"}</h2>
      {mode === "import" ? <>
        {!file && <p>选取文件后，这里会显示本次新增、跳过的链接与分组数量。</p>}
        {preview?.error && <p role="alert">{preview.error}</p>}
        {result && <><dl><div><dt>{destination === "replace" ? "导入链接" : "新增链接"}</dt><dd>{result.added}</dd></div><div><dt>跳过链接</dt><dd>{result.skipped}</dd></div><div><dt>{destination === "replace" ? "导入分组" : "新建分组"}</dt><dd>{destination === "replace" ? file?.backup?.groups.length : result.created}</dd></div></dl>
          <p>{destination === "replace" ? "将替换所有收藏、分组和外观设置；本机回收站与搜索历史保留。" : "现有收藏和外观保持不变。相同网址自动跳过，同名新分组自动编号。"}</p></>}
        <button type="button" className="button primary-button" disabled={!result || reading} onClick={() => setConfirming(true)}>预览并导入</button>
      </> : <>
        <dl><div><dt>导出分组</dt><dd>{exportScope === "all" ? state.groups.length : groups.filter(group => exportIds.includes(group.key)).length}</dd></div><div><dt>导出链接</dt><dd>{exportScope === "all" ? state.sites.length : groups.filter(group => exportIds.includes(group.key)).reduce((sum, group) => sum + group.payload.sites.length, 0)}</dd></div><div><dt>外观设置</dt><dd>{exportScope === "all" ? "包含" : "不包含"}</dd></div></dl>
        <button type="button" className="button primary-button" disabled={exportScope === "groups" && !groups.some(group => exportIds.includes(group.key))} onClick={exportData}><DownloadSimple size={18} />导出 JSON</button>
      </>}
      <div className="data-footnote"><strong>关于数据</strong><HelpTip label="备份范围说明">备份不包含回收站、搜索历史、浏览器历史与本地壁纸文件。</HelpTip>{mode === "import" && <p>具体 GitHub 链接会按工作区规则归类；GitHub 组不接收普通网址和 GitHub 根入口，不符合的链接计入跳过。</p>}</div>
    </aside></div>
    <ConfirmDialog destructive={destination === "replace"} open={confirming} title={destination === "replace" ? "导入并替换收藏？" : "导入分组资源？"} description={destination === "replace" ? `将替换当前 ${state.sites.length} 个收藏及外观设置，导入 ${result?.added ?? 0} 个网站。建议先导出全局备份。` : `新增 ${result?.added ?? 0} 个网站，跳过 ${result?.skipped ?? 0} 个重复或不符合工作区的链接，新建 ${result?.created ?? 0} 个分组。`} confirmLabel="确认导入" onOpenChange={setConfirming} onConfirm={() => {
      if (!request) return;
      try { const imported = onImport(request); setNotice({ text: `已导入 ${imported.added} 个网站，跳过 ${imported.skipped} 个链接，新建 ${imported.created} 个分组。` }); setFile(null); setFilename(""); }
      catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "导入失败" }); }
      setConfirming(false);
    }} />
  </section>;
}
