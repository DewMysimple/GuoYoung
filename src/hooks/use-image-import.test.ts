import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useImageImport } from "./use-image-import";

afterEach(cleanup);
it.each(["close", "source", "unmount"])("discards a pending image after %s", async (change) => {
  let finish!: (value: string) => void;
  const apply = vi.fn();
  const { result, rerender, unmount } = renderHook(({ open }) => useImageImport(open), { initialProps: { open: true } });
  let task!: Promise<void>;
  act(() => { task = result.current.run(() => new Promise<string>((resolve) => { finish = resolve; }), apply); });
  if (change === "close") { rerender({ open: false }); rerender({ open: true }); }
  if (change === "source") act(() => result.current.cancel());
  if (change === "unmount") unmount();
  await act(async () => { finish("old image"); await task; });
  expect(apply).not.toHaveBeenCalled();
});

it("uses the latest image and ignores a late failure from the previous read", async () => {
  let fail!: (error: Error) => void;
  const apply = vi.fn();
  const { result } = renderHook(() => useImageImport(true));
  let oldTask!: Promise<void>;
  act(() => { oldTask = result.current.run(() => new Promise<string>((_, reject) => { fail = reject; }), apply); });
  await act(async () => { await result.current.run(async () => "new image", apply); });
  await act(async () => { fail(new Error("old error")); await oldTask; });
  expect(apply).toHaveBeenCalledExactlyOnceWith("new image");
  expect(result.current.error).toBe("");
  expect(result.current.pending).toBe(false);
});
