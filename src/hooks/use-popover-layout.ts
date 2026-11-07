import { useLayoutEffect, useState, type RefObject } from "react";

/** Fit a local popover into both the viewport and its real scroll/clipping
 * ancestors. Keeping it in the dialog retains Radix focus trapping. Material
 * painting lives on a sibling layer, so this is not a nested Backdrop Root. */
export function usePopoverLayout(open: boolean, root: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>, preferred: "top" | "bottom" = "bottom") {
  const [layout, setLayout] = useState<{ placement: "top" | "bottom"; maxHeight?: number }>({ placement: preferred });
  useLayoutEffect(() => {
    if (!open || !root.current || !menu.current) return;
    function update() {
      const anchor = root.current;
      const popover = menu.current;
      if (!anchor || !popover) return;
      let top = 8;
      let bottom = window.innerHeight - 8;
      for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
        const rect = parent.getBoundingClientRect();
        top = Math.max(top, rect.top + parent.clientTop + 8);
        bottom = Math.min(bottom, rect.top + parent.clientTop + parent.clientHeight - 8);
      }
      const rect = anchor.getBoundingClientRect();
      const above = Math.max(0, rect.top - top - 7);
      const below = Math.max(0, bottom - rect.bottom - 7);
      const needed = Math.min(360, popover.scrollHeight);
      const placement = preferred === "top"
        ? above >= needed || above >= below ? "top" : "bottom"
        : below >= needed || below >= above ? "bottom" : "top";
      const maxHeight = Math.floor(Math.min(360, placement === "top" ? above : below));
      setLayout(current => current.placement === placement && current.maxHeight === maxHeight ? current : { placement, maxHeight });
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root.current);
    observer.observe(menu.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, root, menu, preferred]);
  return layout;
}
