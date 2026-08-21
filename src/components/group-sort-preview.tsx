import { DotsSixVertical } from "@phosphor-icons/react";
import type { GroupSortAxis } from "../lib/group-sort";
import type { SiteGroup } from "../types";
import { CategoryIcon } from "./category-icon";

interface GroupSortDragPreviewProps {
  axis: GroupSortAxis;
  group: SiteGroup;
  count: number;
}

export function GroupSortDragPreview({
  axis,
  group,
  count,
}: GroupSortDragPreviewProps) {
  return (
    <div
      className={`group-sort-drag-preview is-${axis}`}
      data-testid={`group-sort-${axis}-drag-preview`}
      aria-hidden="true"
    >
      <span className="group-sort-preview-icon">
        <CategoryIcon name={group.icon} size={axis === "horizontal" ? 16 : 18} />
      </span>
      <strong>{group.name}</strong>
      <span className="group-sort-preview-count">{count}</span>
      <DotsSixVertical
        className="group-sort-preview-grip"
        size={17}
        weight="bold"
      />
    </div>
  );
}
