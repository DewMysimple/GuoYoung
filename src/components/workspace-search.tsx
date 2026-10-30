import { ArrowBendDownLeft, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useId, useRef, type ComponentProps, type ReactNode } from "react";

interface WorkspaceSearchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  clearLabel?: string;
  description?: string;
  inputProps?: Pick<ComponentProps<"input">, "id" | "onFocus" | "onBlur" | "onKeyDown">;
  onSubmit?: ComponentProps<"form">["onSubmit"];
  children?: ReactNode;
}

/** A stable shell across workspaces; the background filter must never sit below
 * an entering opacity layer. Input and IME behavior stay shared. */
export function WorkspaceSearch({ value, onChange, label, placeholder = label, clearLabel = "清空搜索", description, inputProps, onSubmit, children }: WorkspaceSearchProps) {
  const composing = useRef(false);
  const descriptionId = useId();
  return <section className="workspace-intro">
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
          aria-label={label} aria-describedby={description ? descriptionId : undefined} placeholder={placeholder} autoComplete="off" />
        <div className="search-trailing-actions">
          {value && <button type="button" className="clear-search" aria-label={clearLabel} onClick={() => onChange("")}><X size={17} /></button>}
          {onSubmit && <button type="submit" className="search-submit" disabled={!value.trim()}
            aria-label="搜索网页"><ArrowBendDownLeft size={15} weight="bold" aria-hidden="true" /><span className="search-submit-label">搜索网页</span><span className="search-submit-key" aria-hidden="true">Enter</span></button>}
        </div>
      </form>
      {description && <p className="search-description" id={descriptionId}>{description}</p>}
      {children}
    </div>
  </section>;
}
