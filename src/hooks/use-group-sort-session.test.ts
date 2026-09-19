import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useGroupSortSession } from "./use-group-sort-session";

afterEach(cleanup);
it.each(["cancel", "targetless"])("clears a %s session without producing a commit", (kind) => {
  const { result } = renderHook(useGroupSortSession);
  act(() => {
    result.current.begin("a", "vertical", ["a", "b"], ["a"], new Event("pointerdown"));
    if (kind === "cancel") result.current.preview({ activeGroupId: "a", axis: "vertical", beforeGroupId: null });
  });
  act(() => expect(result.current.finish(kind !== "cancel")).toBeNull());
  expect(result.current.read()).toBeNull();
  expect(result.current.view).toBeNull();
});

it("commits a non-contiguous block once, resolving a target inside the block", () => {
  const { result } = renderHook(useGroupSortSession);
  act(() => {
    result.current.begin("a", "vertical", ["a", "b", "c", "d"], ["c", "a"], new Event("pointerdown"));
    result.current.preview({ activeGroupId: "a", axis: "vertical", beforeGroupId: "c" });
  });
  act(() => {
    expect(result.current.finish(true)).toEqual({ activeIds: ["a", "c"], beforeGroupId: "d" });
    expect(result.current.finish(true)).toBeNull();
  });
});

it("ignores stale intents and pointer updates during keyboard sorting", () => {
  const { result } = renderHook(useGroupSortSession);
  act(() => {
    result.current.begin("b", "horizontal", ["a", "b"], ["b"], new Event("keydown"));
    result.current.preview({ activeGroupId: "a", axis: "horizontal", beforeGroupId: null });
    result.current.preview({ activeGroupId: "b", axis: "vertical", beforeGroupId: null });
    result.current.preview({ activeGroupId: "b", axis: "horizontal", beforeGroupId: "missing" });
    result.current.trackPointer(100, 100);
  });
  expect(result.current.read()).toMatchObject({ activeId: "b", keyboard: true, pointer: null, intent: null });
});
