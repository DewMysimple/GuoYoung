import type { GroupSortAxis, GroupSortRect } from "./group-sort";

export interface StableDropRect {
  id: string;
  groupId: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export interface StableDropGeometry {
  sites: StableDropRect[];
  groups: StableDropRect[];
  groupEnds: StableDropRect[];
}

export interface RectEdges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function pointInDropRect(rect: StableDropRect, x: number, y: number) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function distanceToDropRect(rect: StableDropRect, x: number, y: number) {
  return Math.hypot(x - rect.centerX, y - rect.centerY);
}

export function rectOverlapArea(first: RectEdges, second: RectEdges) {
  const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  return width > 0 && height > 0 ? width * height : 0;
}


export function captureStableDropGeometry() {
    const readRect = (
      element: HTMLElement,
      id: string,
      groupId: string,
    ): StableDropRect => {
      const rect = element.getBoundingClientRect();
      const left = rect.left + window.scrollX;
      const top = rect.top + window.scrollY;
      return {
        id,
        groupId,
        left,
        right: left + rect.width,
        top,
        bottom: top + rect.height,
        centerX: left + rect.width / 2,
        centerY: top + rect.height / 2,
      };
    };

    const sites = Array.from(
      document.querySelectorAll<HTMLElement>("[data-site-dnd-id]"),
    ).map((element) =>
      readRect(
        element,
        element.dataset.siteDndId!,
        element.dataset.siteGroupId!,
      ),
    );
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>("[data-group-zone-id]"),
    ).map((element) =>
      readRect(
        element,
        `group-zone:${element.dataset.groupZoneId!}`,
        element.dataset.groupZoneId!,
      ),
    );
    const groupEnds = Array.from(
      document.querySelectorAll<HTMLElement>("[data-add-site-group-id]"),
    ).map((element) =>
      readRect(
        element,
        `group-zone:${element.dataset.addSiteGroupId!}`,
        element.dataset.addSiteGroupId!,
      ),
    );

    return { sites, groups, groupEnds };
  }

export function readLiveGroupSortRects(axis: GroupSortAxis, order: readonly string[]): GroupSortRect[] {
    const selector =
      axis === "horizontal"
        ? "[data-group-sort-tab-id]"
        : "[data-group-sort-section-id]";
    const elementsByGroupId = new Map(
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
        (element) => [
          axis === "horizontal"
            ? element.dataset.groupSortTabId!
            : element.dataset.groupSortSectionId!,
          element,
        ],
      ),
    );

    return order.flatMap((groupId) => {
      const element = elementsByGroupId.get(groupId);
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      const computedTransform = window.getComputedStyle(element).transform;
      let translateX = 0;
      let translateY = 0;
      if (computedTransform && computedTransform !== "none") {
        const matrix = new DOMMatrixReadOnly(computedTransform);
        translateX = matrix.m41;
        translateY = matrix.m42;
      }
      return [
        {
          groupId,
          start:
            axis === "horizontal"
              ? rect.left - translateX
              : rect.top - translateY,
          end:
            axis === "horizontal"
              ? rect.right - translateX
              : rect.bottom - translateY,
          crossStart:
            axis === "horizontal"
              ? rect.top - translateY
              : rect.left - translateX,
          crossEnd:
            axis === "horizontal"
              ? rect.bottom - translateY
              : rect.right - translateX,
        },
      ];
    });
  }

export function readOverlappingGroupTab() {
    const preview = document.querySelector<HTMLElement>(
      '[data-testid="site-card-drag-preview"]',
    );
    const tabsViewport = document.querySelector<HTMLElement>(".category-tabs");
    if (!preview || !tabsViewport) return null;

    const previewRect = preview.getBoundingClientRect();
    const viewportRect = tabsViewport.getBoundingClientRect();
    let bestMatch: { groupId: string; area: number } | null = null;

    const tabs = Array.from(
      document.querySelectorAll<HTMLElement>("[data-group-drop-id]"),
    );
    for (const tab of tabs) {
      if (tab.dataset.dragActive !== "true") continue;
      const tabRect = tab.getBoundingClientRect();
      const visibleTabRect = {
        left: Math.max(tabRect.left, viewportRect.left, 0),
        right: Math.min(tabRect.right, viewportRect.right, window.innerWidth),
        top: Math.max(tabRect.top, viewportRect.top, 0),
        bottom: Math.min(tabRect.bottom, viewportRect.bottom, window.innerHeight),
      };
      const area = rectOverlapArea(previewRect, visibleTabRect);
      const groupId = tab.dataset.groupDropId;
      if (groupId && area > 0 && (!bestMatch || area > bestMatch.area)) {
        bestMatch = { groupId, area };
      }
    }

    return bestMatch?.groupId ?? null;
  }
