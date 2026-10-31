import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../data/defaults";
import { useSiteHub } from "../hooks/use-site-hub";
import type { ImportRequest } from "../lib/data-workspace";
import type { SiteHubStore } from "../lib/state-store";
import { DataWorkspace } from "./data-workspace";

afterEach(cleanup);

const payload = {
  format: "site-hub-group-export", exportVersion: 1, exportedAt: "2026-10-31T00:00:00Z",
  group: { name: "Synthetic import", icon: "folder" },
  sites: [{ name: "Imported example", url: "https://import.example/Report?view=AbC#Part", order: 0 }],
};

function setup() {
  let persisted = createDefaultState();
  let controlled = false;
  const pending: { resolve: () => void; reject: () => void }[] = [];
  const save = vi.fn<SiteHubStore["save"]>(next => {
    if (!controlled) { persisted = next; return Promise.resolve(); }
    return new Promise<void>((resolve, reject) => pending.push({
      resolve: () => { persisted = next; resolve(); },
      reject: () => reject(new Error("Synthetic quota failure")),
    }));
  });
  const store: SiteHubStore = { mode: "extension", initial: { state: persisted, recovered: false },
    load: async () => ({ state: persisted, recovered: false }), save };
  const imported = vi.fn();
  function Harness() {
    const hub = useSiteHub(store);
    return <>
      <button onClick={() => void hub.retrySave()}>全局重试</button>
      <DataWorkspace state={hub.state} context={{ mode: "import" }} onBack={() => {}}
        onImport={(request: ImportRequest) => { imported(request); return hub.importData(request); }}
        importOperation={hub.dataImport} onRetrySave={hub.retrySave} />
    </>;
  }
  const view = render(<Harness />);
  return { ...view, store, save, imported, pending, persisted: () => persisted,
    control: () => { controlled = true; save.mockClear(); } };
}

async function selectFile(name = "synthetic.json") {
  fireEvent.change(screen.getByLabelText("选择要导入的数据文件"), {
    target: { files: [{ name, text: async () => JSON.stringify(payload) }] },
  });
  await screen.findByText(name);
}

async function confirm() {
  fireEvent.click(screen.getByRole("button", { name: "预览并导入" }));
  fireEvent.click(await screen.findByRole("button", { name: /^确认导入$/ }));
}

describe("data import persistence feedback", () => {
  it("waits for the save receipt, prevents duplicate confirmation and uses executed statistics", async () => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    const originalCount = app.persisted().sites.length;
    await selectFile();
    fireEvent.click(screen.getByRole("button", { name: "预览并导入" }));
    const confirmButton = await screen.findByRole("button", { name: /^确认导入$/ });
    act(() => { fireEvent.click(confirmButton); fireEvent.click(confirmButton); });
    await screen.findByText("正在保存导入结果…");
    expect(screen.queryByText(/^已导入/)).toBeNull();
    expect(screen.getByRole("button", { name: "正在保存…" })).toBeDisabled();
    expect(screen.getByLabelText("选择要导入的数据文件")).toBeDisabled();
    expect(screen.getByText("synthetic.json")).toBeVisible();
    expect(app.imported).toHaveBeenCalledTimes(1);
    expect(app.save).toHaveBeenCalledTimes(1);
    expect(app.persisted().sites).toHaveLength(originalCount);
    await act(async () => app.pending[0].resolve());
    expect(screen.getByRole("status")).toHaveTextContent("已导入 1 个网站，跳过 0 个链接，新建 1 个分组。");
    expect(screen.queryByText("synthetic.json")).toBeNull();
    expect((await app.store.load()).state.sites).toHaveLength(originalCount + 1);
  });

  it.each(["local", "global"])("retains failed import context and completes via %s save retry without importing twice", async retry => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    const originalCount = app.persisted().sites.length;
    await selectFile(); await confirm();
    await act(async () => app.pending[0].reject());
    expect(screen.getByRole("alert")).toHaveTextContent("尚未确认保存成功");
    expect(screen.queryByText(/^已导入/)).toBeNull();
    expect(screen.getByText("synthetic.json")).toBeVisible();
    expect(screen.getByRole("button", { name: "预览并导入" })).toBeDisabled();
    expect(app.persisted().sites).toHaveLength(originalCount);
    fireEvent.click(screen.getByRole("button", { name: retry === "local" ? "重试保存导入结果" : "全局重试" }));
    await screen.findByText("正在保存导入结果…");
    await waitFor(() => expect(app.pending).toHaveLength(2));
    await act(async () => app.pending[1].resolve());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("已导入 1 个网站，跳过 0 个链接，新建 1 个分组。");
    expect(app.imported).toHaveBeenCalledTimes(1);
    expect(app.persisted().groups.filter(group => group.name === "Synthetic import")).toHaveLength(1);
    expect((await app.store.load()).state.sites).toHaveLength(originalCount + 1);
  });

  it("isolates a late save after switching views and selecting a new file", async () => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    await selectFile(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: /^导出$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^导入$/ }));
    await selectFile("new-operation.json");
    await act(async () => app.pending[0].resolve());
    expect(screen.getByText("new-operation.json")).toBeVisible();
    expect(screen.queryByText(/^已导入/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(within(screen.getByRole("region", { name: "数据页面" })).getByRole("button", { name: "预览并导入" })).toBeEnabled();
  });

  it("ignores completion after the data page unmounts", async () => {
    const app = setup();
    await waitFor(() => expect(app.save).toHaveBeenCalled());
    app.control();
    await selectFile(); await confirm();
    app.unmount();
    await act(async () => app.pending[0].resolve());
    expect(screen.queryByRole("region", { name: "数据页面" })).toBeNull();
  });
});
