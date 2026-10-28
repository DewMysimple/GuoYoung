import { useContext, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { SlidersHorizontal, CaretDown, ArrowCounterClockwise } from "@phosphor-icons/react";
import { GROUP_NAVIGATION_GAP } from "../data/defaults";
import { RangeControl } from "./range-control";
import type { SiteGroup } from "../types";
import { CategoryIcon } from "./category-icon";
import "./group-section-nav.css";
import { fixedViewportOriginX } from "../lib/viewport-geometry";
import { getMinimumCardWidth } from "../lib/layout";
import { LayoutSettingsContext } from "./site-grid-layout";
import { createGroupNavigationScroll } from "../lib/group-navigation-scroll";

/** A reading position, independent of the selected group and all sorting state. */
export function GroupSectionNav({ groups, containerRef, disabled, gap, settingsDisabled, onGapChange, hasNotes = false }: {
  groups: SiteGroup[];
  containerRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  gap: number;
  settingsDisabled: boolean;
  onGapChange: (gap: number) => void;
  hasNotes?: boolean;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const adjustmentId = useId();
  const adjustmentTrigger = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | undefined>(groups[0]?.id);
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const navigateTo = useRef<(id: string) => void>(() => {});
  const order = JSON.stringify(groups.map(group => group.id));
  // Text/icon preferences can change the safe width without resizing the grid.
  const safeCardWidth = getMinimumCardWidth(useContext(LayoutSettingsContext), hasNotes);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const nav = navRef.current;
    if (!container || !nav) return;
    const main = container.closest("main")!;
    const shell = main.closest<HTMLElement>(".app-shell")!;
    let frame = 0;
    let layoutDirty = true;
    let visible = false;
    let sectionPositions: { id: string; top: number }[] = [];
    let readingOffset = 0;
    let maxScroll = 0;
    let destination: { id: string; top: number } | null = null;
    const motion = createGroupNavigationScroll();
    // Absolute positions stay valid while scrolling. Re-read layout only when
    // it changes, keeping animation frames free of document geometry reads.
    const measureLayout = () => {
      const shellStyle = getComputedStyle(shell);
      const navWidth = parseFloat(getComputedStyle(nav).width);
      const physicalGap = parseFloat(shellStyle.getPropertyValue("--group-nav-gap")) || gap;
      const pagePadding = Math.max(12, parseFloat(shellStyle.getPropertyValue("--page-padding")));
      const minimumCardWidth = parseFloat(shellStyle.getPropertyValue("--card-safe-width"));
      const availableWidth = shell.clientWidth - parseFloat(shellStyle.paddingRight);
      const compact = availableWidth < pagePadding * 2 + navWidth + physicalGap + minimumCardWidth;
      nav.toggleAttribute("data-compact", compact);
      visible = Boolean(nav.getClientRects().length);
      if (!visible) return;
      const left = `${Math.max(12, main.getBoundingClientRect().left - navWidth - physicalGap) - fixedViewportOriginX()}px`;
      const scrollY = window.scrollY;
      readingOffset = (document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0) + 24;
      sectionPositions = [...container.querySelectorAll<HTMLElement>("[data-group-sort-section-id]")]
        .map(section => ({ id: section.dataset.groupSortSectionId!, top: scrollY + section.getBoundingClientRect().top }));
      maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      // Finish layout reads before changing the rail's position.
      if (nav.style.left !== left) nav.style.left = left;
    };
    const targetTop = (section: { top: number }) => Math.max(0, Math.min(section.top - readingOffset, maxScroll));
    const scrollTo = (top: number) => motion.to(top,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const update = () => {
      frame = 0;
      if (layoutDirty) {
        layoutDirty = false;
        measureLayout();
        // An observer's first notification must not discard the clicked target.
        // A real layout change retargets it only if its landing point moved.
        const target = destination;
        const section = target && sectionPositions.find(section => section.id === target.id);
        if (target && section) {
          const top = targetTop(section);
          if (Math.abs(top - target.top) > 1) {
            target.top = top;
            scrollTo(top);
          }
        }
      }
      if (disabled || !visible) {
        motion.cancel();
        destination = null;
        return;
      }
      const scrollY = window.scrollY;
      let current = sectionPositions[0];
      for (const section of sectionPositions) {
        if (section.top <= scrollY + readingOffset + 1) current = section;
      }
      // The last short section cannot always reach the reading line.
      if (scrollY > 0 && scrollY >= maxScroll - 2) current = sectionPositions.at(-1)!;
      setActiveId(destination?.id ?? current?.id);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const cancelDestination = () => {
      const target = destination;
      destination = null;
      motion.cancel();
      return Boolean(target);
    };
    const releaseDestination = () => { if (cancelDestination()) schedule(); };
    const isNavigationButton = (target: EventTarget | null) => target instanceof Element
      && Boolean(target.closest(".group-section-nav ol button"));
    const onPointerDown = (event: PointerEvent) => {
      // The following click replaces the target. Releasing here briefly shows
      // the reading group (often the last short group) between down and click.
      if (!isNavigationButton(event.target)) releaseDestination();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isNavigationButton(event.target) && ["Enter", " "].includes(event.key)) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Escape"].includes(event.key)) releaseDestination();
    };
    const onVisibilityChange = () => { if (document.hidden) releaseDestination(); };
    const layoutChanged = () => { layoutDirty = true; schedule(); };
    navigateTo.current = id => {
      if (disabled) return;
      measureLayout();
      layoutDirty = false;
      const section = sectionPositions.find(section => section.id === id);
      if (!section) return;
      const top = targetTop(section);
      destination = { id, top };
      setActiveId(id);
      // Start at the actual position; a new request cancels the previous frame.
      scrollTo(top);
    };
    const observer = new ResizeObserver(layoutChanged);
    observer.observe(container);
    observer.observe(main);
    observer.observe(shell);
    const topbar = document.querySelector(".topbar");
    if (topbar) observer.observe(topbar);
    for (const section of container.children) observer.observe(section);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", layoutChanged);
    window.addEventListener("wheel", releaseDestination, { passive: true });
    window.addEventListener("touchstart", releaseDestination, { passive: true });
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", releaseDestination);
    document.addEventListener("visibilitychange", onVisibilityChange);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", layoutChanged);
      window.removeEventListener("wheel", releaseDestination);
      window.removeEventListener("touchstart", releaseDestination);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", releaseDestination);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelDestination();
      navigateTo.current = () => {};
    };
  }, [containerRef, order, disabled, gap, safeCardWidth]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !active) return;
    const bounds = list.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top + 8;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom + 8;
  }, [activeId, adjusting]);

  if (!groups.length) return null;
  return <nav ref={navRef} className="group-section-nav" aria-label="分组定位" data-selection-surface="group-navigation">
    <div className="group-section-nav-panel">
      <div className="group-section-nav-caption">分组定位 <span>{groups.length}</span></div>
      <ol ref={listRef}>
        {groups.map(group => <li key={group.id}>
          <button type="button" title={group.name} disabled={disabled}
            aria-label={`定位到 ${group.name}`} aria-current={activeId === group.id ? "location" : undefined}
            onClick={() => navigateTo.current(group.id)}>
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
