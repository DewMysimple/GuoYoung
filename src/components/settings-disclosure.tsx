import { CaretDown } from "@phosphor-icons/react";
import { useSettingsDisclosure } from "./settings-location";
import type { ReactNode } from "react";
import { HelpTip } from "./help-tip";

/** Native disclosure keeps keyboard behavior and edits intact while collapsed. */
export function SettingsDisclosure({ title, summary, help, children, className = "" }: {
  title: string; summary?: string; help?: string; children: ReactNode; className?: string;
}) {
  const [open, setOpen] = useSettingsDisclosure(title);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className={`appearance-card settings-disclosure ${className}`}>
    <summary><span>{title}{help && <HelpTip label={`${title}说明`}>{help}</HelpTip>}</span>{summary && <small>{summary}</small>}<CaretDown size={16} aria-hidden="true" /></summary>
    <div className="settings-disclosure-content">{children}</div>
  </details>;
}
