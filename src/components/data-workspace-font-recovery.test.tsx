import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { useSiteHub } from "../hooks/use-site-hub";
import type { LocalFontState } from "../hooks/use-local-font";
import type { SiteHubStore } from "../lib/state-store";
import { serializeExport } from "../lib/data-transfer";
import { DataWorkspace } from "./data-workspace";

afterEach(cleanup);
const fontId = "font-backup-synthetic";
const missing = (assetId = fontId): LocalFontState => ({ assetId, loading: false, status: "missing",
  error: "当前设备未找到所选本地字体文件，请重新选择字体文件。" });

function setup(font: LocalFontState | undefined = missing(), existing = createDefaultState()) {
  let persisted = existing;
  let controlled = false;
  const pending: { resolve: () => void; reject: () => void }[] = [];
  const save = vi.fn<SiteHubStore["save"]>(next => {
    if (!controlled) { persisted = next; return Promise.resolve(); }
    return new Promise<void>((resolve, reject) => pending.push({ resolve: () => { persisted = next; resolve(); },
      reject: () => reject(new Error("Synthetic write failure")) }));
  });
  const store: SiteHubStore = { mode: "web", initial: { state: existing, recovered: false },
    load: async () => ({ state: persisted, recovered: false }), save };
  const imported = vi.fn(), openSettings = vi.fn();
  function Harness({ font }: { font: LocalFontState | undefined }) {
    const hub = useSiteHub(store);
    return <DataWorkspace state={hub.state} context={{ mode: "import" }} onBack={() => {}}
      onImport={request => { imported(request); return hub.importData(request); }} importOperation={hub.dataImport}
      onRetrySave={hub.retrySave} localFont={font} onOpenFontSettings={openSettings} />;
  }
  const view = render(<Harness font={font} />);
  return { pending, imported, openSettings, persisted: () => persisted,
    control: () => { controlled = true; save.mockClear(); }, save,
    font: (next: LocalFontState | undefined) => view.rerender(<Harness font={next} />) };
}

async function chooseBackup(name = "font-backup.json") {
  const backup = createDefaultState();
  backup.appearance = { ...backup.appearance, fontFamily: "custom", customFontAssetId: fontId, customFontFamily: "Synthetic font" };
  fireEvent.change(screen.getByLabelText("选择要导入的数据文件"), { target: {
    files: [{ name, text: async () => serializeExport(backup) }],
  } });
  await screen.findByText(name);
}

async function confirm(replace = true) {
  if (replace) {
    fireEvent.click(screen.getByRole("button", { name: "导入方式" }));
    fireEvent.click(screen.getByRole("option", { name: "替换全局数据" }));
  }
  fireEvent.click(screen.getByRole("button", { name: "预览并导入" }));
  fireEvent.click(await screen.findByRole("button", { name: "确认导入" }));
}

describe("restored local font feedback", () => {
  it("keeps resource recovery separate from failed persistence and offers settings only after a save succeeds", async () => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    const before = app.persisted();
    await chooseBackup(); await confirm();
    expect(screen.queryByRole("status", { name: "字体恢复提示" })).toBeNull();
    await act(async () => app.pending[0].reject());
    expect(screen.getByRole("alert")).toHaveTextContent("尚未确认保存成功");
    expect(screen.queryByText(/^已导入/)).toBeNull();
    expect(screen.queryByRole("status", { name: "字体恢复提示" })).toBeNull();
    expect(app.persisted()).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "重试保存导入结果" }));
    await waitFor(() => expect(app.pending).toHaveLength(2));
    await act(async () => app.pending[1].resolve());
    expect(screen.getByRole("status", { name: "字体恢复提示" })).toHaveTextContent("收藏已保存。当前设备未找到");
    expect(screen.getByText(/^已导入/)).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(app.imported).toHaveBeenCalledTimes(1);
    expect(app.persisted().appearance.customFontAssetId).toBe(fontId);
    fireEvent.click(screen.getByRole("button", { name: "打开字体设置" }));
    expect(app.openSettings).toHaveBeenCalledTimes(1);
  });

  it("waits for current resource availability and ignores a previous asset or a settings preview", async () => {
    const app = setup({ assetId: fontId, loading: true, error: null, status: "loading" });
    await chooseBackup(); await confirm();
    await screen.findByText(/^已导入/);
    expect(screen.queryByRole("status", { name: "字体恢复提示" })).toBeNull();
    app.font({ assetId: fontId, loading: false, error: null, status: "ready" });
    expect(screen.queryByRole("status", { name: "字体恢复提示" })).toBeNull();
    app.font(missing("font-older-asset"));
    expect(screen.queryByRole("status", { name: "字体恢复提示" })).toBeNull();
    app.font(missing());
    expect(screen.getByRole("status", { name: "字体恢复提示" })).toBeVisible();
    app.font(undefined); // App withholds the preview hook result from saved-import feedback.
    expect(screen.queryByRole("status", { name: "字体恢复提示" })).toBeNull();
    expect(app.persisted().appearance.customFontAssetId).toBe(fontId);
    app.font(missing());
    expect(screen.getByRole("status", { name: "字体恢复提示" })).toBeVisible();
  });

  it("does not attribute existing resource errors to group-only imports from a complete backup", async () => {
    const existing = createDefaultState();
    existing.appearance = { ...existing.appearance, fontFamily: "custom", customFontAssetId: "font-current" };
    existing.wallpaper = { ...existing.wallpaper, source: "url", url: "https://wallpaper.example/image.png" };
    const appearance = existing.appearance, wallpaper = existing.wallpaper;
    const app = setup(missing("font-current"), existing);
    await chooseBackup(); await confirm(false);
    await screen.findByText(/^已导入/);
    expect(app.persisted().appearance).toBe(appearance);
    expect(app.persisted().wallpaper).toBe(wallpaper);
    expect(screen.queryByRole("status", { name: "字体恢复提示" })).toBeNull();
  });

  it("isolates recovery feedback when choosing a new file or leaving the import view", async () => {
    const app = setup();
    await chooseBackup(); await confirm();
    await screen.findByRole("status", { name: "字体恢复提示" });
    await chooseBackup("new-file.json");
    app.font(missing());
    expect(screen.queryByRole("status", { name: "字体恢复提示" })).toBeNull();
    expect(screen.getByText("new-file.json")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^导出$/ }));
    app.font({ assetId: fontId, loading: false, status: "read-error", error: "本地字体暂时无法读取，请稍后重试或重新选择。" });
    expect(screen.queryByRole("status", { name: "字体恢复提示" })).toBeNull();
  });
});
