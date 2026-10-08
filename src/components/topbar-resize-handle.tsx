import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { ResizeHandle } from "./resize-handle";

export function TopbarResizeHandle({ value, scale = 1, panelWidth = 0, onChange, onCommit, onCancel }: {
  value: number;
  scale?: number;
  panelWidth?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  onCancel?: () => void;
}) {
  return createPortal(<ResizeHandle label="调整顶栏高度" axis="y" value={value} min={48} max={96} coordinateScale={scale}
    defaultValue={DEFAULT_APPEARANCE.topbarHeight} className="topbar-resize-portal"
    style={{ "--topbar-height": `${value * scale}px`, "--resize-panel-width": `${panelWidth}px` } as CSSProperties}
    onChange={onChange} onCommit={onCommit} onCancel={onCancel} />, document.body);
}
