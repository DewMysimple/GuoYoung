import { useEffect, useRef, type HTMLAttributes } from "react";
import { SITE_DRAG_ACTIVATION_DISTANCE } from "../lib/collection-drag-sensors";

export function useSiteClickGuard() {
  const suppressSiteClickRef = useRef(false);
  const suppressSiteClickTimerRef = useRef<number | null>(null);
  const suppressedSiteLinkRef = useRef<{
    element: HTMLAnchorElement;
    href: string;
  } | null>(null);
  const sitePointerGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    crossedDragThreshold: boolean;
    action: HTMLElement;
  } | null>(null);
  function armSiteClickSuppression() {
    suppressSiteClickRef.current = true;
    if (suppressSiteClickTimerRef.current !== null) {
      window.clearTimeout(suppressSiteClickTimerRef.current);
    }
    suppressSiteClickTimerRef.current = window.setTimeout(() => {
      clearSiteClickSuppression();
    }, 700);
  }

  function disableGestureSiteLink(link: HTMLAnchorElement) {
    if (suppressedSiteLinkRef.current?.element === link) return;
    const href = link.getAttribute("href");
    if (!href) return;
    suppressedSiteLinkRef.current = { element: link, href };
    link.removeAttribute("href");
  }

  function clearSiteClickSuppression() {
    suppressSiteClickRef.current = false;
    if (suppressSiteClickTimerRef.current !== null) {
      window.clearTimeout(suppressSiteClickTimerRef.current);
      suppressSiteClickTimerRef.current = null;
    }
    const suppressedLink = suppressedSiteLinkRef.current;
    if (suppressedLink?.element.isConnected) {
      suppressedLink.element.setAttribute("href", suppressedLink.href);
    }
    suppressedSiteLinkRef.current = null;
  }


  useEffect(() => clearSiteClickSuppression, []);
  const handlers: HTMLAttributes<HTMLDivElement> = {
      onPointerDownCapture: (event) => {
        const target = event.target as Element;
        const card = target.closest<HTMLElement>(".site-card");
        const isCardAction = Boolean(target.closest(".card-actions"));
        const action = card?.querySelector<HTMLElement>(
          ".site-card-full-link",
        );
        if (!card || !action || isCardAction) {
          sitePointerGestureRef.current = null;
          if (isCardAction && card?.classList.contains("folder-card")) clearSiteClickSuppression();
          return;
        }
        clearSiteClickSuppression();
        // Sweep selection owns its release click; normal cards (including
        // history buttons) still reset old drag suppression on a fresh press.
        if (card.matches("[data-site-dnd-id].is-selection-mode")) {
          sitePointerGestureRef.current = null;
          return;
        }
        sitePointerGestureRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          crossedDragThreshold: false,
          action,
        };
      },
      onPointerMoveCapture: (event) => {
        const gesture = sitePointerGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (gesture.crossedDragThreshold) return;
        const distance = Math.hypot(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY,
        );
        if (distance > SITE_DRAG_ACTIVATION_DISTANCE) {
          gesture.crossedDragThreshold = true;
          suppressSiteClickRef.current = true;
          if (gesture.action instanceof HTMLAnchorElement) disableGestureSiteLink(gesture.action);
        }
      },
      onPointerUpCapture: (event) => {
        const gesture = sitePointerGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (gesture.crossedDragThreshold) armSiteClickSuppression();
        sitePointerGestureRef.current = null;
      },
      onPointerCancelCapture: (event) => {
        const gesture = sitePointerGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (gesture.crossedDragThreshold) armSiteClickSuppression();
        sitePointerGestureRef.current = null;
      },
      onClickCapture: (event) => {
        if (!suppressSiteClickRef.current) return;
        if (!(event.target as Element).closest(".site-card")) return;
        // Keyboard and assistive activation of the folder's native button
        // is independent of a preceding pointer gesture.
        if (event.detail === 0 && (event.target as Element).closest(".folder-card")) return;
        event.preventDefault();
        event.stopPropagation();
        clearSiteClickSuppression();
      },

  };
  return { armSiteClickSuppression, handlers };
}
