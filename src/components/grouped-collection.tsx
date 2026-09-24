import type { ReactNode } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { SiteGroup, SiteItem } from "../types";
import type { DroppedSitePreview } from "../lib/external-link-drop";
import type { useCollectionSelection } from "../hooks/use-collection-selection";
import { groupSortRowId } from "../lib/collection-drag-ids";
import { SortableGroupSection } from "./sortable-group-section";
import { CollectionSiteGrid, type CollectionGridDrag } from "./collection-site-grid";
import type { GroupInsertPosition } from "./group-insert-control";

type Selection = ReturnType<typeof useCollectionSelection>;

export function GroupedCollection({ sections, selection, drag, sorting, sortDisabled, insertDisabled,
  onInsert, onManage, onAdd, renderSite,
}: {
  sections: { group: SiteGroup; sites: SiteItem[] }[];
  selection: Selection;
  drag: CollectionGridDrag;
  sorting: boolean;
  sortDisabled: boolean;
  insertDisabled: boolean;
  onInsert: (beforeId: string | undefined, context: { groupName: string; position: GroupInsertPosition }) => void;
  onManage: (id: string) => void;
  onAdd: (groupId?: string, prefill?: DroppedSitePreview) => void;
  renderSite: (site: SiteItem, group: SiteGroup) => ReactNode;
}) {
  return (
    <SortableContext items={sections.map(({ group }) => groupSortRowId(group.id))} strategy={verticalListSortingStrategy}>
      <div className={`grouped-site-sections ${sorting ? "is-group-sort-active" : ""}`}>
        {sections.map(({ group, sites }, index) => (
          <SortableGroupSection key={group.id} group={group} count={sites.length} disabled={sortDisabled}
            insertDisabled={insertDisabled}
            actionsDisabled={sorting || Boolean(drag.activeId)}
            onInsert={position => onInsert(position === "before" ? group.id : sections[index + 1]?.group.id, { groupName: group.name, position })}
            onManage={() => onManage(group.id)}
            groupSelected={selection.selectedGroupIds.has(group.id)} selectionMode={selection.selectionMode}
            onToggleGroupSelected={shiftKey => selection.toggleGroupSelection(group.id, shiftKey)}
            onEnterGroupSelection={() => selection.enterGroupSelectionFromDoubleClick(group.id)}
            allSitesSelected={sites.length > 0 && sites.every(site => selection.selectedSiteIds.has(site.id))}
            onToggleSiteSelectionMode={() => selection.toggleGroupedSiteSelection(sites.map(site => site.id))}>
            <CollectionSiteGrid group={group} sites={sites} grouped drag={drag}
              dropEnabled={Boolean(drag.activeId) && !drag.disabled}
              renderSite={site => renderSite(site, group)} onAdd={onAdd} />
          </SortableGroupSection>
        ))}
      </div>
    </SortableContext>
  );
}
