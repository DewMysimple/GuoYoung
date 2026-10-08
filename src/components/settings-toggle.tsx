import { useId } from "react";
import { HelpTip } from "./help-tip";
import { SettingsCheckbox } from "./settings-options";

/** Help is a sibling of the label, never another labelable control inside it. */
export function SettingsToggle({ label, help, checked, disabled, className, onChange }: {
  label: string; help?: string; checked: boolean; disabled?: boolean; className?: string; onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return <div className={["toggle-row", className].filter(Boolean).join(" ")}>
    <span className="settings-toggle-label"><label htmlFor={id}><strong>{label}</strong></label>
      {help && <HelpTip label={`${label}说明`}>{help}</HelpTip>}</span>
    <SettingsCheckbox id={id} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
  </div>;
}
