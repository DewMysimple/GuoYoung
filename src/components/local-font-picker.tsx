import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FolderOpen } from "@phosphor-icons/react";
import { LOCAL_FONT_ACCEPT, prepareLocalFont } from "../lib/local-fonts";
import { useLatestEvent } from "../hooks/use-latest-event";

/** The system file chooser selects a font; names are never entered by hand. */
export function LocalFontPicker({ name, error, onChoose }: {
  name: string; error?: string; onChoose: (font: { assetId: string; name: string }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const [pending, setPending] = useState(false);
  const [fileError, setFileError] = useState("");
  const apply = useLatestEvent(onChoose);
  useEffect(() => () => { generation.current++; }, []);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const current = ++generation.current;
    setFileError("");
    setPending(true);
    try {
      const font = await prepareLocalFont(file);
      if (current === generation.current) apply(font);
    } catch (cause) {
      if (current === generation.current) setFileError(cause instanceof Error ? cause.message : "无法读取这款字体，请重新选择。");
    } finally {
      if (current === generation.current) setPending(false);
    }
  }

  return <div className="typography-local-font">
    <input ref={input} type="file" accept={LOCAL_FONT_ACCEPT} aria-label="字体文件" hidden onChange={choose} />
    <button type="button" className="button secondary-button" disabled={pending} onClick={() => input.current?.click()}>
      <FolderOpen size={16} />{pending ? "正在读取字体…" : "选择已安装字体"}
    </button>
    {name && <span className="typography-local-font-name">当前字体：{name}</span>}
    <small>在系统文件窗口选择字体；Windows 字体通常位于 C:\Windows\Fonts。</small>
    {(fileError || error) && <p className="field-error" role="alert">{fileError || error}</p>}
  </div>;
}
