import { DotsSixVertical } from "@phosphor-icons/react";
import type { GroupSortAxis } from "../lib/group-sort";
import type { SiteGroup, SiteItem } from "../types";
import { CategoryIcon } from "./category-icon";
import { Favicon } from "./favicon";
import "./group-sort-preview.css";

interface GroupSortDragPreviewProps {
  axis: GroupSortAxis;
  group: SiteGroup;
  count: number;
  batchCount?: number;
  sites?: SiteItem[];
}

export function GroupSortDragPreview({
  axis,
  group,
  count,
  batchCount = 1,
  sites = [],
}: GroupSortDragPreviewProps) {
  return (
    <div
      className={`group-sort-drag-preview is-${axis}`}
      data-testid={`group-sort-${axis}-drag-preview`}
      aria-hidden="true"
    >
      <div className="group-sort-preview-heading">
        <span className="group-sort-preview-icon">
          <CategoryIcon name={group.icon} size={axis === "horizontal" ? 16 : 18} />
        </span>
        <div className="group-sort-preview-copy">
          <strong>{batchCount > 1 ? `${group.name} 等` : group.name}</strong>
          <span className="group-sort-preview-count">
            {batchCount > 1 ? `${batchCount} 个分组 · ${sites.length} 个网站` : `${count} 个网站`}
          </span>
        </div>
        <DotsSixVertical className="group-sort-preview-grip" size={17} weight="bold" />
      </div>
      {axis === "vertical" && (sites.length ? (
        <div className="group-sort-preview-sites">
          {sites.slice(0, 3).map(site => (
            <div key={site.id} className="group-sort-preview-site">
              <Favicon site={site} />
              <span className="group-sort-preview-site-name">{site.name}</span>
            </div>
          ))}
          {sites.length > 3 && <span className="group-sort-preview-more">+{sites.length - 3}</span>}
        </div>
      ) : <div className="group-sort-preview-empty">空分组</div>)}
    </div>
  );
}
