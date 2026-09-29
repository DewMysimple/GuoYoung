import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./help-tip.css";

/** Shared, keyboard-accessible help. Portals escape scrolling settings panels. */
export function HelpTip({ label = "说明", children }: { label?: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const cancel = () => clearTimeout(timer.current);
  const show = () => { cancel(); setOpen(true); };
  const hide = () => { cancel(); timer.current = setTimeout(() => setOpen(false), 140); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const panel = bubble.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      // Windows' stable root gutter offsets fixed portals from viewport x=0.
      const origin = panel.left - parseFloat(bubble.current!.style.left || "0");
      setPosition({ left: Math.max(12, Math.min(anchor.left, innerWidth - panel.width - 12)) - origin,
        top: Math.max(12, anchor.bottom + panel.height + 20 > innerHeight ? anchor.top - panel.height - 8 : anchor.bottom + 8) });
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); } };
    place();
    const observer = new ResizeObserver(place);
    if (bubble.current) observer.observe(bubble.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  return <span className="help-tip">
    <button ref={trigger} type="button" className="help-tip-trigger" aria-label={label}
      aria-describedby={open ? id : undefined} onMouseEnter={show} onMouseLeave={hide}
      onFocus={show} onBlur={hide} onClick={event => { event.preventDefault(); event.stopPropagation(); show(); }}>?</button>
    {open && createPortal(<div ref={bubble} id={id} role="tooltip" className="help-tip-bubble"
      style={position} onMouseEnter={cancel} onMouseLeave={hide}>{children}</div>, document.body)}
  </span>;
}
