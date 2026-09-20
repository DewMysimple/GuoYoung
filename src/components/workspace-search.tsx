import { ArrowBendDownLeft, MagnifyingGlass, X } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
import { useRef, type ComponentProps, type ReactNode } from "react";

interface WorkspaceSearchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  clearLabel?: string;
  inputProps?: Pick<ComponentProps<"input">, "id" | "onFocus" | "onBlur" | "onKeyDown">;
  onSubmit?: ComponentProps<"form">["onSubmit"];
  children?: ReactNode;
}

/** The shell, animation and input behavior are identical across workspaces. */
export function WorkspaceSearch({ value, onChange, label, placeholder = label, clearLabel = "清空搜索", inputProps, onSubmit, children }: WorkspaceSearchProps) {
  const reduceMotion = useReducedMotion();
  const composing = useRef(false);
  return <motion.section className="workspace-intro"
    initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
    <div className="search-panel">
      <form className="search-input" role="search" onSubmit={event => { if (composing.current || !onSubmit) event.preventDefault(); else onSubmit(event); }}>
        <MagnifyingGlass size={21} aria-hidden="true" />
        <input {...inputProps} type="search" value={value} onChange={(event) => onChange(event.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={event => { composing.current = false; onChange(event.currentTarget.value); }}
          onKeyDown={event => {
            if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
              // Let the IME own candidate keys; block the form's implicit Enter submission.
              if (event.key === "Enter") event.preventDefault();
              return;
            }
            inputProps?.onKeyDown?.(event);
          }}
          aria-label={label} placeholder={placeholder} autoComplete="off" />
        <div className="search-trailing-actions">
          {value && <button type="button" className="clear-search" aria-label={clearLabel} onClick={() => onChange("")}><X size={17} /></button>}
          {onSubmit && <button type="submit" className="search-submit" disabled={!value.trim()}
            aria-label="使用默认搜索引擎搜索" title="使用默认搜索引擎搜索"><ArrowBendDownLeft size={15} weight="bold" /><span>Enter</span></button>}
        </div>
      </form>
      {children}
    </div>
  </motion.section>;
}
