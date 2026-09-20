import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./resize-handle.css";

interface ResizeHandleProps {
  label: string;
  axis: "x" | "y";
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  direction?: 1 | -1;
  step?: number;
  className?: string;
  style?: CSSProperties;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  onCancel?: () => void;
}

/** Pointer, keyboard and cancellation semantics shared by both page dividers. */
export function ResizeHandle({ label, axis, value, min, max, defaultValue, direction = 1,
  step = 4, className = "", style, onChange, onCommit, onCancel }: ResizeHandleProps) {
  const [resizing, setResizing] = useState(false);
  const session = useRef<{ id: number; origin: number; value: number; current: number; target: HTMLDivElement } | null>(null);
  const callbacks = useRef({ onChange, onCommit, onCancel });
  callbacks.current = { onChange, onCommit, onCancel };
  const clamp = (next: number) => Math.round(Math.min(max, Math.max(min, next)));

  function finish(cancel: boolean) {
    const active = session.current;
    if (!active) return;
    session.current = null;
    setResizing(false);
    document.documentElement.classList.remove(`resizing-${axis}`);
    const next = cancel ? active.value : active.current;
    callbacks.current.onChange(next);
    if (cancel) callbacks.current.onCancel?.();
    else callbacks.current.onCommit?.(next);
    if (active.target.hasPointerCapture?.(active.id)) active.target.releasePointerCapture(active.id);
  }

  useEffect(() => {
    const cancel = () => finish(true);
    const visibility = () => { if (document.visibilityState === "hidden") cancel(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && session.current) { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("keydown", key, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("keydown", key, true);
      document.removeEventListener("visibilitychange", visibility);
      session.current = null;
      document.documentElement.classList.remove(`resizing-${axis}`);
    };
  }, [axis]);

  function apply(next: number) {
    const clamped = clamp(next);
    onChange(clamped);
    onCommit?.(clamped);
  }

  return <div role="separator" tabIndex={0} aria-label={label}
    aria-orientation={axis === "x" ? "vertical" : "horizontal"}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} 像素`}
    title={`${label}，方向键微调，双击恢复默认`}
    className={`resize-handle resize-handle-${axis} ${className} ${resizing ? "is-resizing" : ""}`} style={style}
    onDoubleClick={() => apply(defaultValue)}
    onKeyDown={(event) => {
      const decrease = axis === "x" ? "ArrowLeft" : "ArrowUp";
      const increase = axis === "x" ? "ArrowRight" : "ArrowDown";
      if (![decrease, increase, "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      apply(event.key === "Home" ? min : event.key === "End" ? max : value + (event.key === increase ? 1 : -1) * direction * step);
    }}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      session.current = { id: event.pointerId, origin: axis === "x" ? event.clientX : event.clientY,
        value, current: value, target: event.currentTarget };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      document.documentElement.classList.add(`resizing-${axis}`);
      setResizing(true);
    }}
    onPointerMove={(event) => {
      const active = session.current;
      if (!active || active.id !== event.pointerId) return;
      active.current = clamp(active.value + ((axis === "x" ? event.clientX : event.clientY) - active.origin) * direction);
      onChange(active.current);
    }}
    onPointerUp={(event) => { if (session.current?.id === event.pointerId) finish(false); }}
    onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}>
    <span aria-hidden="true" />
  </div>;
}
