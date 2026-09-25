import { CaretDown } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/** Native disclosure keeps keyboard behavior and edits intact while collapsed. */
export function SettingsDisclosure({ title, summary, children, className = "" }: {
  title: string; summary?: string; children: ReactNode; className?: string;
}) {
  return <details className={`appearance-card settings-disclosure ${className}`}>
    <summary><span>{title}</span>{summary && <small>{summary}</small>}<CaretDown size={16} aria-hidden="true" /></summary>
    <div className="settings-disclosure-content">{children}</div>
  </details>;
}
