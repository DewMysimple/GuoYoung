import { Plus } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import type { SiteGroup } from "../types";
import { CompactIconButton } from "./compact-icon-button";

export type GroupInsertPosition = "before" | "after";

export function GroupInsertControl({ group, disabled, onInsert }: {
  group: SiteGroup;
  disabled: boolean;
  onInsert: (position: GroupInsertPosition) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [open]);
  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  return (
    <div className="group-add-control" ref={root}
      onKeyDown={event => {
        if (!open) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === "Tab") close(false);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
            : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}>
        <CompactIconButton ref={trigger} className="group-add-trigger" disabled={disabled}
          aria-label={`在 ${group.name} 附近添加分组`} title="添加相邻分组"
          aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
          onClick={event => { event.stopPropagation(); setOpen(value => !value); }}>
          <Plus size={16} aria-hidden="true" />
        </CompactIconButton>
      {open && !disabled && (
        <div className="group-add-menu" role="menu" id={menuId} aria-label={`添加到 ${group.name} 附近`}>
          {(["before", ...(!group.isProtected ? ["after"] : [])] as GroupInsertPosition[]).map(position => (
            <button key={position} type="button" role="menuitem" onClick={event => {
              event.stopPropagation(); close(false); onInsert(position);
            }}>在“{group.name}”{position === "before" ? "前" : "后"}添加</button>
          ))}
        </div>
      )}
    </div>
  );
}
