import { useCallback, useEffect, useRef, useState } from "react";

/** An image result belongs to one open settings session and one source choice. */
export function useImageImport(open: boolean) {
  const generation = useRef(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const cancel = useCallback(() => {
    generation.current += 1;
    setPending(false);
    setError("");
  }, []);

  useEffect(() => {
    cancel();
    return () => { generation.current += 1; };
  }, [open, cancel]);

  async function run<T>(read: () => Promise<T>, apply: (value: T) => void) {
    const current = ++generation.current;
    setPending(true);
    setError("");
    try {
      const value = await read();
      if (generation.current === current) apply(value);
    } catch (reason) {
      if (generation.current === current) {
        setError(reason instanceof Error ? reason.message : "无法处理这张图片");
      }
    } finally {
      if (generation.current === current) setPending(false);
    }
  }

  return { pending, error, run, cancel };
}
