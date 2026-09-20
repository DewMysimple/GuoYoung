import { useCallback, useLayoutEffect, useRef } from "react";

/** Stable subscription identity; each invocation sees the latest committed render. */
export function useLatestEvent<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const latest = useRef(callback);
  useLayoutEffect(() => { latest.current = callback; });
  return useCallback((...args: Args) => latest.current(...args), []);
}
