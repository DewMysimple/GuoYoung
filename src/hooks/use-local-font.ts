import { useEffect, useState } from "react";
import { getLocalFontFamily, loadLocalFontBlob, MissingLocalFontError } from "../lib/local-fonts";

export interface LocalFontState {
  assetId: string | undefined;
  loading: boolean;
  error: string | null;
  status: "inactive" | "loading" | "ready" | "missing" | "read-error" | "load-error" | "unsupported";
}

function pendingFont(assetId: string | undefined): LocalFontState {
  return { assetId, loading: Boolean(assetId), error: null, status: assetId ? "loading" : "inactive" };
}

/** Register the current document's font; settings retain ownership of the asset ID. */
export function useLocalFont({ fontFamily, customFontAssetId }: { fontFamily: string; customFontAssetId?: string }) {
  const assetId = fontFamily === "custom" ? customFontAssetId : undefined;
  const [state, setState] = useState<LocalFontState>(() => pendingFont(assetId));
  useEffect(() => {
    if (!assetId) {
      setState(pendingFont(undefined));
      return;
    }
    if (typeof FontFace !== "function" || !document.fonts) {
      setState({ assetId, loading: false, error: "当前浏览器无法加载字体文件", status: "unsupported" });
      return;
    }
    let cancelled = false;
    let registered: FontFace | undefined;
    setState(pendingFont(assetId));
    let stage: "read" | "load" = "read";
    void (async () => {
      const blob = await loadLocalFontBlob(assetId);
      if (cancelled) return;
      stage = "load";
      const face = new FontFace(getLocalFontFamily(assetId), await blob.arrayBuffer());
      await face.load();
      if (cancelled) return;
      document.fonts.add(face);
      registered = face;
      setState({ assetId, loading: false, error: null, status: "ready" });
    })().catch(error => {
      if (cancelled) return;
      const missing = error instanceof MissingLocalFontError;
      setState({ assetId, loading: false,
        status: missing ? "missing" : stage === "read" ? "read-error" : "load-error",
        error: missing ? error.message : stage === "read"
          ? "本地字体暂时无法读取，请稍后重试或重新选择。"
          : "本地字体加载失败，请重新选择有效的字体文件。" });
    });
    return () => {
      cancelled = true;
      if (registered) document.fonts.delete(registered);
    };
  }, [assetId]);
  // Effects settle after render. Never attribute a previous asset's result to
  // a newly imported configuration or to a temporary settings preview.
  return state.assetId === assetId ? state : pendingFont(assetId);
}
