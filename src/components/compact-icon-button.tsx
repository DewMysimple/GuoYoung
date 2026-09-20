import type { ButtonHTMLAttributes, Ref } from "react";

/** One visual/hit-area contract for compact group actions. */
export function CompactIconButton({ className = "", ref, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
}) {
  return <button type="button" ref={ref} className={`compact-icon-button ${className}`} {...props} />;
}
