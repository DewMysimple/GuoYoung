import { ArrowUpRight, Check, Minus } from "@phosphor-icons/react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";

export function CardSurface({ className = "", ...props }: ComponentProps<"article">) {
  return <article {...props} className={`site-card ${className}`} />;
}

export function CardContent({ icon, actions, name, domain, detail, footer, external = false }: {
  icon: ReactNode; actions?: ReactNode; name: string; domain: string;
  detail?: ReactNode; footer: ReactNode; external?: boolean;
}) {
  return <>
    <div className="site-card-topline">{icon}{actions}</div>
    <div className="site-card-link">
      <span className="site-name-row"><span className="site-name" title={name}>{name}</span>
        {external && <ArrowUpRight className="open-arrow" size={18} weight="regular" />}</span>
      <span className="site-domain" title={domain}>{domain}</span>
      {detail}
    </div>
    {footer}
  </>;
}

export function CardSelectionToggle({ selected, indeterminate = false, label, disabled = false, onToggle, className = "" }: {
  selected: boolean; indeterminate?: boolean; label: string; disabled?: boolean;
  onToggle: (shiftKey: boolean) => void; className?: string;
}) {
  return <button type="button" className={`site-selection-toggle ${className}`} aria-label={label}
    aria-pressed={selected} data-indeterminate={indeterminate || undefined} disabled={disabled}
    onMouseDown={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); onToggle(event.shiftKey); }}>
    {indeterminate ? <Minus size={14} weight="bold" /> : selected ? <Check size={14} weight="bold" /> : null}
  </button>;
}

/** Navigation is native for links; selection and blocked interactions never navigate. */
export function CardOpenAction({ href, label, title, className = "", disabled = false, selected, onSelect, onOpen }: {
  href?: string; label: string; title?: string; className?: string; disabled?: boolean;
  selected?: boolean; onSelect?: (shiftKey: boolean) => void; onOpen?: () => void;
}) {
  const click = (event: MouseEvent) => {
    if (disabled || onSelect) {
      event.preventDefault();
      event.stopPropagation();
      if (!disabled) onSelect?.(event.shiftKey);
    } else onOpen?.();
  };
  const common = { className: `site-card-full-link ${className}`, "aria-label": label, title, onClick: click };
  return href && !onSelect
    ? <a {...common} href={disabled || onSelect ? undefined : href} target="_blank" rel="noopener noreferrer" draggable={false} aria-disabled={disabled || undefined} />
    : <button {...common} type="button" disabled={disabled} aria-pressed={onSelect ? selected : undefined} />;
}
