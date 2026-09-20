import { Check, Plus } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent, type TouchEvent } from "react";
import type { SiteGroup } from "../types";
import { CompactIconButton } from "./compact-icon-button";

export type GroupInsertPosition = "before" | "after";
export const stopGroupSortPointer = (event: PointerEvent | MouseEvent | TouchEvent) => event.stopPropagation();

export function GroupInsertControl({ group, disabled, selectionActive, selected, onToggleSelected, onInsert }: {
  group: SiteGroup;
  disabled: boolean;
  selectionActive: boolean;
  selected: boolean;
  onToggleSelected: (shiftKey?: boolean) => void;
  onInsert: (position: GroupInsertPosition) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (disabled || selectionActive) setOpen(false);
  }, [disabled, selectionActive]);
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
    <div className={`group-add-control ${selectionActive ? "is-group-selection" : ""}`} ref={root}
      onPointerDown={stopGroupSortPointer} onMouseDown={stopGroupSortPointer} onTouchStart={stopGroupSortPointer}
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
      {selectionActive ? (
        <CompactIconButton className={`group-add-trigger group-selection-trigger ${selected ? "is-selected" : ""}`}
          disabled={group.isProtected} aria-label={`${selected ? "取消选择" : "选择"} ${group.name} 分组`}
          aria-pressed={selected} onClick={event => { event.stopPropagation(); onToggleSelected(event.shiftKey); }}>
          <span className="group-selection-mark">{selected && <Check size={12} weight="bold" aria-hidden="true" />}</span>
        </CompactIconButton>
      ) : (
        <CompactIconButton ref={trigger} className="group-add-trigger" disabled={disabled}
          aria-label={`在 ${group.name} 附近添加分组`} title="添加相邻分组"
          aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
          onClick={event => { event.stopPropagation(); setOpen(value => !value); }}>
          <Plus size={16} aria-hidden="true" />
        </CompactIconButton>
      )}
      {open && !selectionActive && (
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
