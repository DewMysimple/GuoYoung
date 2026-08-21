import type {
  BrowserBookmarkTreeNode,
  BrowserBookmarksApi,
} from "./browser-runtime";
import type { SiteCollectionState } from "../types";
import { inferSiteName, normalizeUrl } from "./site-utils";
import {
  addGroupToState,
  addSiteToState,
  findGroupByName,
  findSiteByUrl,
} from "./site-state";

export interface IndexedBookmarkNode {
  node: BrowserBookmarkTreeNode;
  ancestorIds: string[];
  mappedGroupName?: string;
  systemRoot: boolean;
}

export interface BookmarkImportResult {
  state: SiteCollectionState;
  added: number;
  skipped: number;
  failed: number;
}

export interface BookmarkDeleteSummary {
  roots: BrowserBookmarkTreeNode[];
  bookmarkCount: number;
  folderCount: number;
}

export function indexBookmarkTree(
  roots: BrowserBookmarkTreeNode[],
): Map<string, IndexedBookmarkNode> {
  const indexed = new Map<string, IndexedBookmarkNode>();
  const invisibleRootIds = new Set<string>();
  const systemRootIds = new Set(roots.map((root) => root.id));

  function visit(
    node: BrowserBookmarkTreeNode,
    ancestorIds: string[],
    mappedGroupName?: string,
  ) {
    const systemRoot = systemRootIds.has(node.id);
    const nextMappedGroup =
      mappedGroupName ??
      (!node.url && !systemRoot && !invisibleRootIds.has(node.id)
        ? node.title.trim() || undefined
        : undefined);
    indexed.set(node.id, {
      node,
      ancestorIds,
      mappedGroupName: nextMappedGroup,
      systemRoot,
    });
    for (const child of node.children ?? []) {
      visit(child, [...ancestorIds, node.id], nextMappedGroup);
    }
  }

  for (const root of roots) visit(root, []);
  return indexed;
}

export function getDescendantIds(node: BrowserBookmarkTreeNode): string[] {
  return [
    node.id,
    ...(node.children ?? []).flatMap((child) => getDescendantIds(child)),
  ];
}

export function importSelectedBookmarks(
  state: SiteCollectionState,
  roots: BrowserBookmarkTreeNode[],
  selectedIds: Set<string>,
  fallbackGroupId: string,
): BookmarkImportResult {
  const indexed = indexBookmarkTree(roots);
  let next = state;
  let added = 0;
  let skipped = 0;
  let failed = 0;

  const selectedBookmarks = [...selectedIds]
    .map((id) => indexed.get(id))
    .filter(
      (entry): entry is IndexedBookmarkNode => Boolean(entry?.node.url),
    );

  for (const entry of selectedBookmarks) {
    let url: string;
    try {
      url = normalizeUrl(entry.node.url!);
    } catch {
      failed += 1;
      continue;
    }
    if (findSiteByUrl(next.sites, url)) {
      skipped += 1;
      continue;
    }

    let groupId = fallbackGroupId;
    if (entry.mappedGroupName) {
      let group = findGroupByName(next.groups, entry.mappedGroupName);
      if (!group) {
        next = addGroupToState(next, entry.mappedGroupName, "folder");
        group = findGroupByName(next.groups, entry.mappedGroupName);
      }
      if (group) groupId = group.id;
    }

    const name = entry.node.title.trim() || inferSiteName(url) || "新网站";
    next = addSiteToState(next, {
      name,
      url,
      groupId,
      customIconUrl: "",
      iconSource: "auto",
    });
    added += 1;
  }

  return { state: next, added, skipped, failed };
}

export function summarizeBookmarkDeletion(
  roots: BrowserBookmarkTreeNode[],
  selectedIds: Set<string>,
): BookmarkDeleteSummary {
  const indexed = indexBookmarkTree(roots);
  const selected = [...selectedIds]
    .map((id) => indexed.get(id))
    .filter((entry): entry is IndexedBookmarkNode => Boolean(entry));
  const topEntries = selected.filter(
    (entry) =>
      !entry.ancestorIds.some((ancestorId) => selectedIds.has(ancestorId)),
  );
  const deletionRoots: BrowserBookmarkTreeNode[] = [];

  for (const entry of topEntries) {
    if (!entry.systemRoot) {
      deletionRoots.push(entry.node);
      continue;
    }
    for (const child of entry.node.children ?? []) deletionRoots.push(child);
  }

  const uniqueRoots = deletionRoots.filter(
    (node, index, list) => list.findIndex((candidate) => candidate.id === node.id) === index,
  );
  let bookmarkCount = 0;
  let folderCount = 0;
  const count = (node: BrowserBookmarkTreeNode) => {
    if (node.url) bookmarkCount += 1;
    else folderCount += 1;
    for (const child of node.children ?? []) count(child);
  };
  uniqueRoots.forEach(count);
  return { roots: uniqueRoots, bookmarkCount, folderCount };
}

export async function deleteBookmarkSelection(
  api: BrowserBookmarksApi,
  summary: BookmarkDeleteSummary,
): Promise<{ deleted: number; failed: number }> {
  const results = await Promise.allSettled(
    summary.roots.map((node) =>
      node.url ? api.remove(node.id) : api.removeTree(node.id),
    ),
  );
  return {
    deleted: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}

export function filterBookmarkTree(
  nodes: BrowserBookmarkTreeNode[],
  query: string,
): BrowserBookmarkTreeNode[] {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return nodes;
  return nodes.flatMap((node) => {
    const children = filterBookmarkTree(node.children ?? [], query);
    const matches = [node.title, node.url ?? ""].some((value) =>
      value.toLocaleLowerCase("zh-CN").includes(normalized),
    );
    return matches || children.length > 0 ? [{ ...node, children }] : [];
  });
}
