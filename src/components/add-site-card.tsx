import { useRef, useState, type DragEvent } from "react";
import { LinkSimple, Plus } from "@phosphor-icons/react";
import { readDroppedSite, type DroppedSitePreview } from "../lib/external-link-drop";
import type { SiteGroup } from "../types";

interface AddSiteCardProps {
  group: SiteGroup;
  onClick: (groupId: string) => void;
  onDropSite: (groupId: string, preview: DroppedSitePreview) => void;
}

export function AddSiteCard({ group, onClick, onDropSite }: AddSiteCardProps) {
  const dragDepth = useRef(0);
  const [dropReady, setDropReady] = useState(false);

  function hasSupportedData(event: DragEvent<HTMLButtonElement>) {
    const types = Array.from(event.dataTransfer.types);
    return types.some((type) =>
      ["text/uri-list", "text/html", "text/plain"].includes(type),
    );
  }

  return (
    <button
      type="button"
      className="add-site-card"
      data-add-site-group-id={group.id}
      aria-label={`在${group.name}分组添加网站`}
      onClick={() => onClick(group.id)}
      data-drop-ready={dropReady || undefined}
      onDragEnter={(event) => {
        if (!hasSupportedData(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDropReady(true);
      }}
      onDragOver={(event) => {
        if (!hasSupportedData(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropReady(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDropReady(false);
        const preview = readDroppedSite(event.dataTransfer);
        if (preview) onDropSite(group.id, preview);
      }}
    >
      <span className="add-site-card-icon">
        {dropReady ? <LinkSimple size={22} weight="bold" /> : <Plus size={22} weight="bold" />}
      </span>
      <span>{dropReady ? "松开以预添加" : "添加网站"}</span>
    </button>
  );
}
