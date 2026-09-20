import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { ResizeHandle } from "./resize-handle";

export function TopbarResizeHandle({ value, panelWidth = 0, onChange, onCommit, onCancel }: {
  value: number;
  panelWidth?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  onCancel?: () => void;
}) {
  return createPortal(<ResizeHandle label="调整顶栏高度" axis="y" value={value} min={48} max={96}
    defaultValue={DEFAULT_APPEARANCE.topbarHeight} className="topbar-resize-portal"
    style={{ "--topbar-height": `${value}px`, "--resize-panel-width": `${panelWidth}px` } as CSSProperties}
    onChange={onChange} onCommit={onCommit} onCancel={onCancel} />, document.body);
}
