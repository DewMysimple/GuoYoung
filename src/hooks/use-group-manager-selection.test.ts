import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { DEFAULT_GROUPS } from "../data/defaults";
import { useGroupManagerSelection } from "./use-group-manager-selection";

it("selects ranges, excludes protected groups and resets on reopen", () => {
  const { result, rerender } = renderHook(({open}) => useGroupManagerSelection(open, DEFAULT_GROUPS), { initialProps: { open: true } });
  act(() => result.current.toggle("search", false));
  act(() => result.current.toggle("design", true));
  expect(result.current.selectedIds).toEqual(["search", "develop", "design"]);
  act(() => result.current.invert());
  expect(result.current.selectedIds).toEqual(["media", "learn"]);
  act(() => result.current.selectAll());
  expect(result.current.allSelected).toBe(true);
  expect(result.current.selectedIds).not.toContain("other");
  rerender({ open: false }); rerender({ open: true });
  expect(result.current.selectedIds).toEqual([]);
});

it("prunes deleted groups so reintroduced ids do not become selected", () => {
  const { result, rerender } = renderHook(({groups}) => useGroupManagerSelection(true, groups), { initialProps: { groups: DEFAULT_GROUPS } });
  act(() => result.current.toggle("search", false));
  rerender({ groups: DEFAULT_GROUPS.filter(g => g.id !== "search") });
  rerender({ groups: DEFAULT_GROUPS });
  expect(result.current.selectedIds).toEqual([]);
});
