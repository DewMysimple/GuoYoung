import { DotsThree, DownloadSimple, Trash, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import "./select-menu.css";

interface GroupManagerActionsProps {
  groupId: string;
  onImport: () => void;
  onExport: () => void;
  /** Return true while a second activation is required. */
  onDelete?: () => boolean;
  deleteArmed: boolean;
  clearDelete: () => void;
}

export function GroupManagerActions({ groupId, onImport, onExport, onDelete, deleteArmed, clearDelete }: GroupManagerActionsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[focusLast.current ? items.length - 1 : 0]?.focus();
    focusLast.current = false;
    function closeOnPointerOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    window.addEventListener("pointerdown", closeOnPointerOutside);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerOutside);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  function choose(action: () => boolean | void) {
    if (action() === true) return;
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      clearDelete();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const focused = items.findIndex(item => item === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : (focused + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <div className="select-menu-root group-editor-menu" ref={rootRef}
      onBlur={event => {
        if (!event.relatedTarget || event.currentTarget.contains(event.relatedTarget)) return;
        clearDelete();
        setOpen(false);
      }}
    >
      <button type="button" ref={triggerRef}
        className={`view-control-button group-editor-menu-trigger ${open ? "is-open" : ""}`}
        aria-label="更多分组操作" title="更多分组操作" aria-haspopup="menu"
        aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) clearDelete();
          setOpen(!open);
        }}
        onKeyDown={event => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          focusLast.current = event.key === "ArrowUp";
          setOpen(true);
        }}
      >
        <DotsThree size={22} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div ref={menuRef} id={menuId} className="select-menu-popover" role="menu"
          aria-label="分组操作" onKeyDown={moveFocus}
        >
          <button type="button" tabIndex={-1} role="menuitem" className="select-menu-option"
            onClick={() => choose(onImport)}>
            <UploadSimple size={17} aria-hidden="true" />导入资源
          </button>
          <button type="button" tabIndex={-1} role="menuitem" className="select-menu-option"
            onClick={() => choose(onExport)}>
            <DownloadSimple size={17} aria-hidden="true" />导出资源
          </button>
          {onDelete && (
            <>
              <div className="group-editor-menu-divider" role="separator" />
              <button type="button" tabIndex={-1} role="menuitem"
                className={`select-menu-option group-editor-delete ${deleteArmed ? "is-delete-armed" : ""}`}
                aria-label={deleteArmed ? "再次点击删除这个分组" : "删除这个分组"}
                data-delete-group-id={groupId}
                onClick={() => choose(onDelete)}>
                <Trash size={17} aria-hidden="true" />
                {deleteArmed ? "确认删除" : "删除分组"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
