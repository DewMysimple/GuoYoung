import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { HTMLAttributes, ReactNode } from "react";
import { groupSortRowId } from "../lib/collection-drag-ids";
import { GroupSectionHeader, type GroupSectionHeaderProps } from "./group-section-header";
import "./grouped-collection.css";

type Props = Omit<GroupSectionHeaderProps, "canSort" | "pointerListeners"> & {
  disabled: boolean;
  children: ReactNode;
};

/** Only dnd-kit owns this section's transform. The header contains no sortable state. */
export function SortableGroupSection({ disabled, children, ...header }: Props) {
  const { group, groupSelected } = header;
  const canSort = !disabled && !group.isProtected;
  const sortable = useSortable({
    id: groupSortRowId(group.id), disabled: !canSort,
    data: { type: "group-row-sort", groupId: group.id },
    transition: { duration: 160, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  });
  // Section titles deliberately have no keyboard sort activation; buttons keep their keys.
  const pointerListeners: Pick<HTMLAttributes<HTMLElement>, "onMouseDown" | "onTouchStart"> = canSort ? {
    onMouseDown: sortable.listeners?.onMouseDown as HTMLAttributes<HTMLElement>["onMouseDown"],
    onTouchStart: sortable.listeners?.onTouchStart as HTMLAttributes<HTMLElement>["onTouchStart"],
  } : {};
  return (
    <section ref={sortable.setNodeRef}
      className={`grouped-site-section ${sortable.isDragging ? "is-group-sorting" : ""} ${groupSelected ? "is-group-selected" : ""}`}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.isDragging ? "none" : sortable.transition }}
      aria-labelledby={`group-row-${group.id}`} data-group-sort-section-id={group.id}>
      <GroupSectionHeader {...header} canSort={canSort} pointerListeners={pointerListeners} />
      {children}
    </section>
  );
}
