import { useInsertionEffect } from "react";

/** Shared by the new tab page and popup, including their body portals. */
export function useTextSelection(allowed: boolean) {
  useInsertionEffect(() => {
    document.documentElement.dataset.textSelection = allowed ? "enabled" : "disabled";
    return () => { delete document.documentElement.dataset.textSelection; };
  }, [allowed]);
}
