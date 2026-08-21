import type { SearchHistoryEntry } from "../types";

export function addSearchHistory(
  history: SearchHistoryEntry[],
  rawQuery: string,
  searchedAt = new Date().toISOString(),
): SearchHistoryEntry[] {
  const query = rawQuery.trim();
  if (!query) return history;
  const key = query.toLocaleLowerCase("zh-CN");
  return [
    { query, searchedAt },
    ...history.filter(
      (entry) => entry.query.toLocaleLowerCase("zh-CN") !== key,
    ),
  ].slice(0, 10);
}

export function removeSearchHistory(
  history: SearchHistoryEntry[],
  query: string,
): SearchHistoryEntry[] {
  const key = query.toLocaleLowerCase("zh-CN");
  return history.filter(
    (entry) => entry.query.toLocaleLowerCase("zh-CN") !== key,
  );
}
