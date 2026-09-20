import { useEffect, useRef, type HTMLAttributes } from "react";

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
    link: HTMLAnchorElement;
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
        const link = card?.querySelector<HTMLAnchorElement>(
          ".site-card-full-link",
        );
        if (!card || !link || isCardAction) {
          sitePointerGestureRef.current = null;
          return;
        }
        clearSiteClickSuppression();
        sitePointerGestureRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          crossedDragThreshold: false,
          link,
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
        if (distance > 50) {
          gesture.crossedDragThreshold = true;
          suppressSiteClickRef.current = true;
          disableGestureSiteLink(gesture.link);
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
        event.preventDefault();
        event.stopPropagation();
        clearSiteClickSuppression();
      },

  };
  return { armSiteClickSuppression, handlers };
}
