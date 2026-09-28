import { useEffect, useMemo, useRef, useState } from "react";
import { getInclusiveSelectionRange } from "../lib/selection-range";
import type { SiteGroup } from "../types";

/** Dialog-local selection; editor focus and saved groups remain independent. */
export function useGroupManagerSelection(open: boolean, groups: SiteGroup[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const ids = useMemo(
    () => groups.filter((group) => !group.isProtected).map((group) => group.id),
    [groups],
  );
  const selectedIds = ids.filter((id) => selected.has(id));

  function clear() {
    setSelected(new Set());
    anchor.current = null;
  }

  useEffect(() => {
    clear();
  }, [open]);

  useEffect(() => {
    const available = new Set(ids);
    setSelected((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
    if (anchor.current && !available.has(anchor.current)) anchor.current = null;
  }, [ids]);

  function toggle(id: string, shift: boolean) {
    if (!ids.includes(id)) return;
    const range = shift ? getInclusiveSelectionRange(ids, anchor.current, id) : [id];
    // Manager ranges toggle to the target's next state; unlike collection
    // ranges, they may deselect a block and always move the anchor.
    setSelected((current) => {
      const next = new Set(current);
      const deselect = current.has(id);
      for (const key of range) {
        if (deselect) next.delete(key);
        else next.add(key);
      }
      return next;
    });
    anchor.current = id;
  }

  return {
    selectedIds,
    toggle,
    allSelected: ids.length > 0 && selectedIds.length === ids.length,
    clear,
    selectAll: () => setSelected(new Set(ids)),
    invert: () => setSelected((current) => new Set(ids.filter((id) => !current.has(id)))),
  };
}
