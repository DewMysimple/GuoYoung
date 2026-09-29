import { useId } from "react";
import { HelpTip } from "./help-tip";

/** Help is a sibling of the label, never another labelable control inside it. */
export function SettingsToggle({ label, help, checked, disabled, onChange }: {
  label: string; help?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return <div className="toggle-row">
    <span className="settings-toggle-label"><label htmlFor={id}><strong>{label}</strong></label>
      {help && <HelpTip label={`${label}说明`}>{help}</HelpTip>}</span>
    <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
  </div>;
}
