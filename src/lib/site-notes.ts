/** Notes remain plain text. Empty or malformed optional notes never invalidate a collection. */
export function normalizeSiteNote(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
