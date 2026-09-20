import { useEffect, useRef, useState } from "react";
import { getInclusiveSelectionRange } from "../lib/selection-range";
import type { SiteGroup } from "../types";

/** Dialog-local selection; editor focus and saved groups remain independent. */
export function useGroupManagerSelection(open: boolean, groups: SiteGroup[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const ids = groups.filter(group => !group.isProtected).map(group => group.id);
  const selectedIds = ids.filter(id => selected.has(id));
  useEffect(() => { setSelected(new Set()); anchor.current = null; }, [open]);
  useEffect(() => {
    const available = new Set(groups.filter(group => !group.isProtected).map(group => group.id));
    setSelected(current => [...current].every(id => available.has(id)) ? current : new Set([...current].filter(id => available.has(id))));
    if (anchor.current && !available.has(anchor.current)) anchor.current = null;
  }, [groups]);
  function toggle(id: string, shift: boolean) {
    if (!ids.includes(id)) return;
    const range = shift ? getInclusiveSelectionRange(ids, anchor.current, id) : [id];
    setSelected(current => {
      const next = new Set(current);
      for (const key of range) { if (current.has(id)) next.delete(key); else next.add(key); }
      return next;
    });
    anchor.current = id;
  }
  return { selectedIds, toggle, allSelected: ids.length > 0 && selectedIds.length === ids.length,
    clear: () => { setSelected(new Set()); anchor.current = null; },
    selectAll: () => setSelected(new Set(ids)),
    invert: () => setSelected(new Set(ids.filter(id => !selected.has(id)))) };
}
