import { CaretDown, CaretRight, Globe } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { CategoryIcon as GroupIcon } from "../components/category-icon";
import { getDescendantIds } from "../lib/bookmark-manager";
import type { BrowserBookmarkTreeNode } from "../lib/browser-runtime";
import type { CategoryIcon } from "../types";

export function getBookmarkSiteIds(node: BrowserBookmarkTreeNode): string[] {
  return node.url
    ? [node.id]
    : (node.children ?? []).flatMap(getBookmarkSiteIds);
}

export function getBookmarkFolderIds(node: BrowserBookmarkTreeNode): string[] {
  return node.url
    ? []
    : [node.id, ...(node.children ?? []).flatMap(getBookmarkFolderIds)];
}

function BookmarkCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="bookmark-check">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={onChange}
      />
    </label>
  );
}

interface BookmarkTileProps {
  node: BrowserBookmarkTreeNode;
  selectedIds: Set<string>;
  expanded: boolean;
  searchActive: boolean;
  folderIcons: ReadonlyMap<string, CategoryIcon>;
  onToggleSelect: (node: BrowserBookmarkTreeNode) => void;
  onToggleExpanded: (id: string) => void;
  depth?: number;
}

export function BookmarkTile({
  node,
  selectedIds,
  expanded,
  searchActive,
  folderIcons,
  onToggleSelect,
  onToggleExpanded,
  depth = 0,
}: BookmarkTileProps) {
  const selectableIds = searchActive ? getBookmarkSiteIds(node) : getDescendantIds(node);
  const selectedCount = selectableIds.filter((id) => selectedIds.has(id)).length;
  const checked = selectableIds.length > 0 && selectedCount === selectableIds.length;
  const indeterminate = selectedCount > 0 && !checked;
  const isFolder = !node.url;
  const groupIcon = folderIcons.get(node.title.trim().toLocaleLowerCase("zh-CN"))
    ?? (depth === 0 ? "bookmark" : "stack");
  return (
    <li className={`bookmark-tile ${isFolder ? "is-folder" : "is-site"} ${depth > 0 ? "is-child" : ""} ${checked ? "is-selected" : ""} ${indeterminate ? "is-partial" : ""}`}>
      <button
        type="button"
        className="bookmark-tile-main"
        aria-label={isFolder ? `${expanded ? "收起" : "展开"} ${node.title}` : `切换选择 ${node.title || "未命名书签"}`}
        title={node.url || node.title}
        onClick={() => isFolder ? onToggleExpanded(node.id) : onToggleSelect(node)}
      >
        <span className={`bookmark-kind ${isFolder ? "folder" : "site"}`}>
          {isFolder ? <GroupIcon name={groupIcon} size={18} /> : <Globe size={18} />}
        </span>
        <strong>{node.title || (isFolder ? "未命名文件夹" : "未命名书签")}</strong>
        {isFolder && (expanded ? <CaretDown className="bookmark-tile-caret" size={13} /> : <CaretRight className="bookmark-tile-caret" size={13} />)}
      </button>
      <BookmarkCheckbox
        checked={checked}
        indeterminate={indeterminate}
        disabled={selectableIds.length === 0}
        label={`选择 ${node.title || "未命名书签"}`}
        onChange={() => onToggleSelect(node)}
      />
    </li>
  );
}
