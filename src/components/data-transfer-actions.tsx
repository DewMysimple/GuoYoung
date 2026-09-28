import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";

/** Contextual shortcuts into the same transfer workspace. */
export function DataTransferActions({ onImport, onExport, group = false }: {
  onImport: () => void; onExport: () => void; group?: boolean;
}) {
  return <>
    <button type="button" className="button secondary-button" onClick={onImport} aria-label={group ? "导入资源" : "导入"}>
      <UploadSimple size={17} /><span className="group-action-label">导入</span>
    </button>
    <button type="button" className="button secondary-button" onClick={onExport} aria-label={group ? "导出资源" : "导出"}>
      <DownloadSimple size={17} /><span className="group-action-label">导出</span>
    </button>
  </>;
}
