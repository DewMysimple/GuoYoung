import { Fragment, type ReactNode } from "react";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import type { SiteGroup, SiteItem } from "../types";
import type { DroppedSitePreview } from "../lib/external-link-drop";
import { groupZoneDropId } from "../lib/collection-drag-ids";
import type { CollectionEntry } from "../lib/group-hierarchy";
import { AddSiteCard } from "./add-site-card";
import { FolderCard } from "./folder-card";
import { GroupDropGrid } from "./group-drop-target";

export interface CollectionGridDrag {
  activeId: string | null;
  overId: string | null;
  originGroupId: string | null;
  reorder: boolean;
  disabled: boolean;
  pendingId?: string | null;
  folderIds?: ReadonlyMap<string, string>;
}

export interface CollectionFolderActions {
  onOpen: (group: SiteGroup) => void;
  onManage: (group: SiteGroup) => void;
  counts: ReadonlyMap<string, number>;
  groups: readonly SiteGroup[];
}

/** One card-grid path for flat, single-group and grouped collection views. */
export function CollectionSiteGrid({ group, sites, entries, folderActions, grouped, flat = false, drag, dropEnabled, renderSite, onAdd }: {
  group: SiteGroup;
  sites: SiteItem[];
  entries?: CollectionEntry[];
  folderActions?: CollectionFolderActions;
  grouped: boolean;
  flat?: boolean;
  drag: CollectionGridDrag;
  dropEnabled: boolean;
  renderSite: (site: SiteItem) => ReactNode;
  onAdd: (groupId?: string, prefill?: DroppedSitePreview) => void;
}) {
  const showInsertion = grouped && drag.reorder && Boolean(drag.activeId) && drag.originGroupId !== group.id;
  const sortableFolders = drag.reorder && !drag.disabled && !flat;
  const folderDragId = (entry: Extract<CollectionEntry, { kind: "folder" }>) =>
    drag.folderIds?.get(entry.group.id) ?? entry.id;
  const sortableIds = entries?.flatMap(entry => entry.kind === "site"
    ? [entry.site.id] : sortableFolders ? [folderDragId(entry)] : []);
  function renderSiteSlot(site: SiteItem) {
    return <Fragment key={site.id}>
      {showInsertion && drag.overId === site.id && <InsertionSlot />}
      {renderSite(site)}
    </Fragment>;
  }
  return (
    <SortableContext items={drag.reorder ? sortableIds ?? sites.map(site => site.id) : []} strategy={rectSortingStrategy}>
      <GroupDropGrid groupId={group.id} dragActive={dropEnabled}
        hasNotes={sites.some(site => Boolean(site.note))}
        dragOver={drag.overId === groupZoneDropId(group.id)} className={grouped ? "grouped-site-track" : "site-grid"}>
        {entries ? entries.map(entry => {
          if (entry.kind === "site") return renderSiteSlot(entry.site);
          if (!folderActions) return null;
          const id = folderDragId(entry);
          return <FolderCard key={id} group={entry.group} count={folderActions.counts.get(entry.group.id) ?? 0}
            parent={flat ? folderActions.groups.find(parent => parent.id === entry.group.parentId) : undefined}
            dragId={id} sortable={sortableFolders} dragPending={drag.pendingId === id}
            dropTarget={drag.overId === id && drag.activeId !== id}
            interactionDisabled={drag.disabled} onOpen={folderActions.onOpen} onManage={folderActions.onManage} />;
        }) : sites.map(renderSiteSlot)}
        {showInsertion && drag.overId === groupZoneDropId(group.id) && <InsertionSlot />}
        <AddSiteCard group={group} onClick={onAdd} onDropSite={onAdd} />
      </GroupDropGrid>
    </SortableContext>
  );
}

function InsertionSlot() {
  return <div className="site-card site-card-drop-placeholder" aria-hidden="true" />;
}
