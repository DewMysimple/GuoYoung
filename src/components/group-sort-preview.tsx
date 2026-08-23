import { DotsSixVertical } from "@phosphor-icons/react";
import type { GroupSortAxis } from "../lib/group-sort";
import type { SiteGroup } from "../types";
import { CategoryIcon } from "./category-icon";

interface GroupSortDragPreviewProps {
  axis: GroupSortAxis;
  group: SiteGroup;
  count: number;
  batchCount?: number;
}

export function GroupSortDragPreview({
  axis,
  group,
  count,
  batchCount = 1,
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
      <strong>{batchCount > 1 ? `${group.name} 等` : group.name}</strong>
      <span className="group-sort-preview-count">
        {batchCount > 1 ? `${batchCount} 个分组` : count}
      </span>
      <DotsSixVertical
        className="group-sort-preview-grip"
        size={17}
        weight="bold"
      />
    </div>
  );
}
