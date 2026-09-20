import { Fragment, type ReactNode } from "react";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import type { SiteGroup, SiteItem } from "../types";
import type { DroppedSitePreview } from "../lib/external-link-drop";
import { groupZoneDropId } from "../lib/collection-drag-ids";
import { AddSiteCard } from "./add-site-card";
import { GroupDropGrid } from "./group-drop-target";

export interface CollectionGridDrag {
  activeId: string | null;
  overId: string | null;
  originGroupId: string | null;
  reorder: boolean;
  disabled: boolean;
}

/** One card-grid path for flat, single-group and grouped collection views. */
export function CollectionSiteGrid({ group, sites, grouped, drag, dropEnabled, renderSite, onAdd }: {
  group: SiteGroup;
  sites: SiteItem[];
  grouped: boolean;
  drag: CollectionGridDrag;
  dropEnabled: boolean;
  renderSite: (site: SiteItem) => ReactNode;
  onAdd: (groupId?: string, prefill?: DroppedSitePreview) => void;
}) {
  const showInsertion = grouped && drag.reorder && Boolean(drag.activeId) && drag.originGroupId !== group.id;
  return (
    <SortableContext items={drag.reorder ? sites.map(site => site.id) : []} strategy={rectSortingStrategy}>
      <GroupDropGrid groupId={group.id} dragActive={dropEnabled}
        dragOver={drag.overId === groupZoneDropId(group.id)} className={grouped ? "grouped-site-track" : "site-grid"}>
        {sites.map(site => (
          <Fragment key={site.id}>
            {showInsertion && drag.overId === site.id && <InsertionSlot />}
            {renderSite(site)}
          </Fragment>
        ))}
        {showInsertion && drag.overId === groupZoneDropId(group.id) && <InsertionSlot />}
        <AddSiteCard group={group} onClick={onAdd} onDropSite={onAdd} />
      </GroupDropGrid>
    </SortableContext>
  );
}

function InsertionSlot() {
  return <div className="site-card site-card-drop-placeholder" aria-hidden="true" />;
}
