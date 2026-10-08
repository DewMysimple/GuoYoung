import { useEffect, useState } from "react";
import { getLocalFontFamily, loadLocalFontBlob } from "../lib/local-fonts";

/** Register the current document's font; settings retain ownership of the asset ID. */
export function useLocalFont({ fontFamily, customFontAssetId }: { fontFamily: string; customFontAssetId?: string }) {
  const [state, setState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  useEffect(() => {
    if (fontFamily !== "custom" || !customFontAssetId) {
      setState({ loading: false, error: null });
      return;
    }
    if (typeof FontFace !== "function" || !document.fonts) {
      setState({ loading: false, error: "当前浏览器无法加载字体文件" });
      return;
    }
    let cancelled = false;
    let registered: FontFace | undefined;
    setState({ loading: true, error: null });
    void (async () => {
      const blob = await loadLocalFontBlob(customFontAssetId);
      if (cancelled) return;
      const face = new FontFace(getLocalFontFamily(customFontAssetId), await blob.arrayBuffer());
      await face.load();
      if (cancelled) return;
      document.fonts.add(face);
      registered = face;
      setState({ loading: false, error: null });
    })().catch(error => {
      if (!cancelled) setState({ loading: false, error: error instanceof Error ? error.message : "无法加载本机字体，请重新选择字体文件" });
    });
    return () => {
      cancelled = true;
      if (registered) document.fonts.delete(registered);
    };
  }, [fontFamily, customFontAssetId]);
  return state;
}
