import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { SlidersHorizontal, CaretDown, ArrowCounterClockwise } from "@phosphor-icons/react";
import { GROUP_NAVIGATION_GAP } from "../data/defaults";
import { RangeControl } from "./range-control";
import type { SiteGroup } from "../types";
import { CategoryIcon } from "./category-icon";
import "./group-section-nav.css";

/** A reading position, independent of the selected group and all sorting state. */
export function GroupSectionNav({ groups, containerRef, disabled, gap, settingsDisabled, onGapChange }: {
  groups: SiteGroup[];
  containerRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  gap: number;
  settingsDisabled: boolean;
  onGapChange: (gap: number) => void;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const adjustmentId = useId();
  const adjustmentTrigger = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | undefined>(groups[0]?.id);
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const destination = useRef<{ id: string; top: number } | null>(null);
  const order = JSON.stringify(groups.map(group => group.id));

  useLayoutEffect(() => {
    const container = containerRef.current;
    const nav = navRef.current;
    if (!container || !nav) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!nav.getClientRects().length) return;
      const main = container.closest("main")!;
      // Fixed offsets start inside the root scrollbar gutter on Windows.
      const origin = nav.getBoundingClientRect().left - parseFloat(nav.style.left || "0");
      const left = `${Math.max(12, main.getBoundingClientRect().left - nav.offsetWidth - gap) - origin}px`;
      let nextActiveId: string | undefined;
      if (!disabled) {
        const sections = [...container.querySelectorAll<HTMLElement>("[data-group-sort-section-id]")];
        const offset = (document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0) + 24;
        let current: HTMLElement | undefined = sections[0];
        for (const section of sections) {
          if (section.getBoundingClientRect().top <= offset + 1) current = section;
        }
        // The last short section cannot always reach the reading line.
        const root = document.documentElement;
        if (window.scrollY > 0 && window.scrollY + window.innerHeight >= root.scrollHeight - 2) {
          current = sections.at(-1);
        }
        const target = destination.current;
        nextActiveId = target && Math.abs(window.scrollY - target.top) < 2 ? target.id : current?.dataset.groupSortSectionId;
      }
      // Finish layout reads before changing the rail's position.
      if (nav.style.left !== left) nav.style.left = left;
      if (!disabled) setActiveId(nextActiveId);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    // Input cancels a clicked destination. Only an actual scroll or layout
    // change needs a new measurement; typing and Portal input do not move groups.
    const releaseDestination = () => { destination.current = null; };
    const layoutChanged = () => { releaseDestination(); schedule(); };
    const observer = new ResizeObserver(layoutChanged);
    observer.observe(container);
    observer.observe(container.closest("main")!);
    const topbar = document.querySelector(".topbar");
    if (topbar) observer.observe(topbar);
    for (const section of container.children) observer.observe(section);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", layoutChanged);
    window.addEventListener("wheel", releaseDestination, { passive: true });
    window.addEventListener("touchstart", releaseDestination, { passive: true });
    window.addEventListener("pointerdown", releaseDestination);
    window.addEventListener("keydown", releaseDestination);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", layoutChanged);
      window.removeEventListener("wheel", releaseDestination);
      window.removeEventListener("touchstart", releaseDestination);
      window.removeEventListener("pointerdown", releaseDestination);
      window.removeEventListener("keydown", releaseDestination);
      destination.current = null;
    };
  }, [containerRef, order, disabled, gap]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !active) return;
    const bounds = list.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top + 8;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom + 8;
  }, [activeId, adjusting]);

  function navigate(id: string) {
    const section = [...(containerRef.current?.querySelectorAll<HTMLElement>("[data-group-sort-section-id]") ?? [])]
      .find(element => element.dataset.groupSortSectionId === id);
    if (!section) return;
    const offset = (document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0) + 24;
    const top = Math.max(0, Math.min(window.scrollY + section.getBoundingClientRect().top - offset,
      document.documentElement.scrollHeight - window.innerHeight));
    destination.current = { id, top };
    if (Math.abs(window.scrollY - top) < 2) setActiveId(id);
    window.scrollTo({ top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  if (!groups.length) return null;
  return <nav ref={navRef} className="group-section-nav" aria-label="分组定位" data-selection-surface="group-navigation">
    <div className="group-section-nav-panel">
      <div className="group-section-nav-caption">分组定位 <span>{groups.length}</span></div>
      <ol ref={listRef}>
        {groups.map(group => <li key={group.id}>
          <button type="button" title={group.name} disabled={disabled}
            aria-label={`定位到 ${group.name}`} aria-current={activeId === group.id ? "location" : undefined}
            onClick={() => navigate(group.id)}>
            <span className="group-section-nav-icon"><CategoryIcon name={group.icon} size={17} /></span>
            <span className="group-section-nav-name">{group.name}</span>
          </button>
        </li>)}
      </ol>
      <div className="group-section-nav-footer" onKeyDown={event => {
        if (event.key === "Escape" && adjusting) {
          event.stopPropagation();
          setAdjusting(false);
          adjustmentTrigger.current?.focus();
        }
      }}>
        <button type="button" ref={adjustmentTrigger} className="group-section-nav-adjust"
          aria-expanded={adjusting} aria-controls={adjustmentId} disabled={disabled}
          onClick={() => setAdjusting(value => !value)}>
          <SlidersHorizontal size={16} /><span>间距调节</span><CaretDown size={12} />
        </button>
        <div id={adjustmentId} hidden={!adjusting} className="group-section-nav-settings">
          <RangeControl label="内容间距" value={gap} min={GROUP_NAVIGATION_GAP.min} max={GROUP_NAVIGATION_GAP.max}
            disabled={disabled || settingsDisabled} onChange={onGapChange} />
          <div className="group-section-nav-setting-actions">
            <span>{settingsDisabled ? "关闭设置后可调节" : "自动保存"}</span>
            <button type="button" aria-label="恢复默认间距" title="恢复默认间距"
              disabled={disabled || settingsDisabled || gap === GROUP_NAVIGATION_GAP.default}
              onClick={() => onGapChange(GROUP_NAVIGATION_GAP.default)}><ArrowCounterClockwise size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  </nav>;
}
