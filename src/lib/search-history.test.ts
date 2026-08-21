import { describe, expect, it } from "vitest";
import { addSearchHistory, removeSearchHistory } from "./search-history";

describe("search history", () => {
  it("deduplicates case-insensitively and keeps the newest 10 entries", () => {
    let history = Array.from({ length: 10 }, (_, index) => ({
      query: `query ${index}`,
      searchedAt: `2026-07-29T00:00:${String(index).padStart(2, "0")}.000Z`,
    }));
    history = addSearchHistory(
      history,
      "QUERY 4",
      "2026-07-30T00:00:00.000Z",
    );
    expect(history).toHaveLength(10);
    expect(history[0]).toEqual({
      query: "QUERY 4",
      searchedAt: "2026-07-30T00:00:00.000Z",
    });
    expect(history.filter((entry) => entry.query.toLowerCase() === "query 4"))
      .toHaveLength(1);
  });

  it("ignores blank text and removes one matching item", () => {
    const history = [{ query: "React", searchedAt: "now" }];
    expect(addSearchHistory(history, "  ")).toBe(history);
    expect(removeSearchHistory(history, "react")).toEqual([]);
  });
});
