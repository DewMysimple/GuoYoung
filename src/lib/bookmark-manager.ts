import type {
  BrowserBookmarkTreeNode,
  BrowserBookmarksApi,
} from "./browser-runtime";
import type { SiteCollectionState } from "../types";
import { comparableSiteUrl, inferSiteName, normalizeUrl } from "./site-utils";
import {
  addGroupToState,
  findGroupByName,
  mergeGroupImportIntoState,
} from "./site-state";
import type { GroupExportSite } from "./data-transfer";
import { getGithubOtherGroupId, getGroupWorkspace, isGithubHomeUrl, isGithubUrl } from "./github-workspace";
import { getGroupPath } from "./group-hierarchy";

export interface IndexedBookmarkNode {
  node: BrowserBookmarkTreeNode;
  ancestorIds: string[];
  folderPath: string[];
  systemRoot: boolean;
}

export interface BookmarkImportResult {
  state: SiteCollectionState;
  added: number;
  skipped: number;
  failed: number;
  createdRoots: number;
  createdChildren: number;
  mappings: BookmarkImportMapping[];
}

export interface BookmarkImportMapping {
  sourcePath: string[];
  targetPath: string;
  links: number;
  combined: boolean;
}

export interface BookmarkImportOptions { mode?: "preserve" | "target" }

export interface BookmarkDeleteSummary {
  roots: BrowserBookmarkTreeNode[];
  bookmarkCount: number;
  folderCount: number;
}

export function getBrowserBookmarkRoots(tree: readonly BrowserBookmarkTreeNode[]): BrowserBookmarkTreeNode[] {
  if (tree.length === 1) {
    const [root] = tree;
    if (!root.url && !root.parentId && (root.id === "0" || root.id === "root" || !root.title.trim())) {
      return root.children ?? [];
    }
  }
  return [...tree];
}

export function indexBookmarkTree(roots: readonly BrowserBookmarkTreeNode[]): Map<string, IndexedBookmarkNode> {
  const indexed = new Map<string, IndexedBookmarkNode>();
  const systemRootIds = new Set(roots.map((root) => root.id));

  function visit(
    node: BrowserBookmarkTreeNode,
    ancestorIds: string[],
    folderPath: string[],
  ) {
    const systemRoot = systemRootIds.has(node.id);
    const nextFolderPath = !node.url && !systemRoot
      ? [...folderPath, node.title.trim() || "未命名文件夹"] : folderPath;
    indexed.set(node.id, {
      node,
      ancestorIds,
      folderPath: nextFolderPath,
      systemRoot,
    });
    for (const child of node.children ?? []) {
      visit(child, [...ancestorIds, node.id], nextFolderPath);
    }
  }

  for (const root of roots) visit(root, [], []);
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
  roots: readonly BrowserBookmarkTreeNode[],
  selectedIds: ReadonlySet<string>,
  fallbackGroupId: string,
  { mode = "preserve" }: BookmarkImportOptions = {},
): BookmarkImportResult {
  const fallback = state.groups.find(group => group.id === fallbackGroupId && getGroupWorkspace(group) === "main");
  if (!fallback) throw new Error("目标分组已不存在，请重新选择");
  let next = state;
  let added = 0;
  let skipped = 0;
  let failed = 0;
  let createdRoots = 0;
  let createdChildren = 0;
  const existingUrls = new Set(state.sites.map(site => comparableSiteUrl(site.url)));
  const githubOtherId = getGithubOtherGroupId(state);
  const batches = new Map<string, GroupExportSite[]>();
  const mappings = new Map<string, BookmarkImportMapping>();
  const folderTargets = new Map<string, string>();

  function ensureGroup(label: string, parentId?: string) {
    const siblings = next.groups.filter(group => getGroupWorkspace(group) === "main" && group.parentId === parentId);
    const ordinary = siblings.filter(group => !group.isProtected && !group.githubImportSource);
    let name = label;
    for (let suffix = 2; ; suffix++) {
      const matched = findGroupByName(ordinary, name);
      if (matched) return matched.id;
      if (!findGroupByName(siblings, name)) break;
      name = `${label} (${suffix})`;
    }
    const id = crypto.randomUUID();
    next = addGroupToState(next, name, "stack", id, undefined, undefined, "main", parentId);
    if (parentId) createdChildren++;
    else createdRoots++;
    return id;
  }

  function mapFolder(path: string[]): string {
    if (mode === "target" || !path.length) return fallbackGroupId;
    const key = JSON.stringify(path);
    const cached = folderTargets.get(key);
    if (cached) return cached;
    // Preserve every deeper component in a two-level collection's child name.
    // Escape the separator so a literal folder name cannot alias a deeper path.
    const groupId = path.length === 1 ? ensureGroup(path[0])
      : ensureGroup(path.slice(1).map(part => part.replaceAll("\\", "\\\\").replaceAll("›", "\\›")).join(" › "), mapFolder([path[0]]));
    folderTargets.set(key, groupId);
    return groupId;
  }

  function recordMapping(folderPath: string[], groupId: string, links: number) {
    const key = JSON.stringify([folderPath, groupId]);
    const existing = mappings.get(key);
    if (existing) existing.links += links;
    else mappings.set(key, {
      sourcePath: folderPath,
      targetPath: groupId === githubOtherId ? `GitHub / ${getGroupPath(next.groups, groupId)}` : getGroupPath(next.groups, groupId),
      links,
      combined: mode === "preserve" && folderPath.length > 2 && groupId !== githubOtherId,
    });
  }

  for (const [id, { node, folderPath, systemRoot }] of indexBookmarkTree(roots)) {
    if (!selectedIds.has(id)) continue;
    if (!node.url) {
      if (mode === "preserve" && !systemRoot && !node.children?.length) {
        recordMapping(folderPath, mapFolder(folderPath), 0);
      }
      continue;
    }
    let url: string;
    try {
      url = normalizeUrl(node.url);
    } catch {
      failed += 1;
      continue;
    }
    const key = comparableSiteUrl(url);
    if (existingUrls.has(key)) {
      skipped += 1;
      continue;
    }

    existingUrls.add(key);
    const groupId = isGithubUrl(url) && !isGithubHomeUrl(url) ? githubOtherId : mapFolder(folderPath);
    const batch = batches.get(groupId) ?? [];
    batch.push({ name: node.title.trim() || inferSiteName(url) || "新网站", url, iconSource: "auto", order: batch.length });
    batches.set(groupId, batch);
    recordMapping(folderPath, groupId, 1);
  }
  for (const [groupId, sites] of batches) {
    const result = mergeGroupImportIntoState(next, groupId, { sites });
    next = result.state;
    added += result.added;
    skipped += result.skipped;
  }
  return { state: next, added, skipped, failed, createdRoots, createdChildren, mappings: [...mappings.values()] };
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
    summary.roots.map(async (node) =>
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
    if (!node.url && node.title.toLocaleLowerCase("zh-CN").includes(normalized)) {
      return [node];
    }
    const children = filterBookmarkTree(node.children ?? [], query);
    const matches = [node.title, node.url ?? ""].some((value) =>
      value.toLocaleLowerCase("zh-CN").includes(normalized),
    );
    return matches || children.length > 0 ? [{ ...node, children }] : [];
  });
}
