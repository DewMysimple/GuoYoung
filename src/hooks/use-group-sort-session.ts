import { useCallback, useRef, useState } from "react";
import type { GroupSortAxis, GroupSortIntent } from "../lib/group-sort";

interface GroupSortSession {
  readonly activeId: string;
  readonly activeIds: readonly string[];
  readonly axis: GroupSortAxis;
  readonly order: readonly string[];
  readonly keyboard: boolean;
  readonly pointer: { x: number; y: number } | null;
  readonly intent: GroupSortIntent | null;
}

export function useGroupSortSession() {
  const current = useRef<GroupSortSession | null>(null);
  const [view, setView] = useState<GroupSortSession | null>(null);
  const publish = useCallback((session: GroupSortSession | null) => {
    current.current = session;
    setView(session);
  }, []);
  const read = useCallback(() => current.current, []);

  function begin(activeId: string, axis: GroupSortAxis, order: string[], activeIds: string[], event: Event) {
    if (!order.includes(activeId)) return;
    publish({
      activeId, axis, order: [...order],
      activeIds: order.filter((id) => activeIds.includes(id)),
      keyboard: event.type.startsWith("key"),
      pointer: "clientX" in event && "clientY" in event
        ? { x: Number(event.clientX), y: Number(event.clientY) } : null,
      intent: null,
    });
  }

  function preview(intent: GroupSortIntent | null) {
    const session = current.current;
    if (!session) return;
    if (intent && (intent.axis !== session.axis || intent.activeGroupId !== session.activeId ||
      (intent.beforeGroupId !== null && !session.order.includes(intent.beforeGroupId)))) return;
    if (session.intent?.beforeGroupId === intent?.beforeGroupId) return;
    publish({ ...session, intent });
  }

  function trackPointer(x: number, y: number) {
    const session = current.current;
    if (session && !session.keyboard) current.current = { ...session, pointer: { x, y } };
  }

  function finish(commit: boolean) {
    const session = current.current;
    publish(null);
    if (!commit || !session?.intent) return null;
    const activeIds = session.activeIds.length ? [...session.activeIds] : [session.activeId];
    const activeSet = new Set(activeIds);
    let beforeGroupId = session.intent.beforeGroupId;
    if (beforeGroupId && activeSet.has(beforeGroupId)) {
      const targetIndex = session.order.indexOf(beforeGroupId);
      beforeGroupId = session.order.find((id, index) => index > targetIndex && !activeSet.has(id)) ?? null;
    }
    return { activeIds, beforeGroupId };
  }

  return { view, read, begin, preview, trackPointer, finish };
}
