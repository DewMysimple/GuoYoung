import { CaretRight } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { CategoryIcon as GroupIcon } from "../components/category-icon";
import { CardOpenAction, CardSurface } from "../components/card-primitives";
import { Favicon } from "../components/favicon";
import { getDescendantIds } from "../lib/bookmark-manager";
import type { BrowserBookmarkTreeNode } from "../lib/browser-runtime";
import type { CategoryIcon } from "../types";

export function getBookmarkSiteIds(node: BrowserBookmarkTreeNode): string[] {
  return node.url
    ? [node.id]
    : (node.children ?? []).flatMap(getBookmarkSiteIds);
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
  searchActive: boolean;
  folderIcons: ReadonlyMap<string, CategoryIcon>;
  onToggleSelect: (node: BrowserBookmarkTreeNode) => void;
  onOpenFolder: (node: BrowserBookmarkTreeNode) => void;
}

export function BookmarkTile({
  node,
  selectedIds,
  searchActive,
  folderIcons,
  onToggleSelect,
  onOpenFolder,
}: BookmarkTileProps) {
  const selectableIds = searchActive ? getBookmarkSiteIds(node) : getDescendantIds(node);
  const selectedCount = selectableIds.filter((id) => selectedIds.has(id)).length;
  const checked = selectableIds.length > 0 && selectedCount === selectableIds.length;
  const indeterminate = selectedCount > 0 && !checked;
  const isFolder = !node.url;
  const groupIcon = folderIcons.get(node.title.trim().toLocaleLowerCase("zh-CN"))
    ?? "stack";
  const title = node.title || (isFolder ? "未命名文件夹" : "未命名书签");
  return (
    <li className="bookmark-list-item">
      <CardSurface
        className={`bookmark-tile ${isFolder ? "is-folder" : "is-site"} ${checked ? "is-selected" : ""} ${indeterminate ? "is-partial" : ""}`}
        data-testid={`bookmark-card-${node.id}`}
        data-bookmark-kind={isFolder ? "folder" : "site"}
      >
        <CardOpenAction
          className="bookmark-tile-open"
          label={isFolder ? `打开书签文件夹 ${title}` : `选择 ${title}`}
          title={node.url || title}
          onOpen={isFolder ? () => onOpenFolder(node) : undefined}
          onSelect={!isFolder ? () => onToggleSelect(node) : undefined}
        />
        <span className={`bookmark-kind ${isFolder ? "folder" : "site"}`}>
          {isFolder
            ? <GroupIcon name={groupIcon} size={16} />
            : <Favicon site={{ name: title, url: node.url!, customIconUrl: "", iconSource: "browser" }} size="large" />}
        </span>
        <strong className="bookmark-tile-name" title={title}>{title}</strong>
        {isFolder && <CaretRight className="bookmark-tile-caret" size={15} aria-hidden="true" />}
      <BookmarkCheckbox
        checked={checked}
        indeterminate={indeterminate}
        disabled={selectableIds.length === 0}
        label={`选择 ${title}`}
        onChange={() => onToggleSelect(node)}
      />
      </CardSurface>
    </li>
  );
}
