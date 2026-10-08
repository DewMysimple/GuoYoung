import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type Ref } from "react";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import { getGridLayout } from "../lib/layout";

/** React context shares the settings draft with collection and history grids, including portals. */
export const LayoutSettingsContext = createContext(DEFAULT_APPEARANCE);

export function SiteGridLayout({ ref, style, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  const appearance = useContext(LayoutSettingsContext);
  const element = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const setElement = useCallback((node: HTMLDivElement | null) => {
    element.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  useLayoutEffect(() => {
    const grid = element.current;
    if (!grid) return;
    setWidth(grid.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  const layout = getGridLayout(appearance, width);
  return <div {...props} ref={setElement} data-card-shape={appearance.cardShape} style={{
    ...style,
    ...(width > 0 ? { "--grid-columns": layout.columns, "--grid-card-size": `${layout.cardWidth}px`, "--card-grid-min-width": `${layout.minCardWidth}px` } : {}),
  } as CSSProperties} />;
}
