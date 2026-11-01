import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import type { AppearanceSettings } from "../types";
import { AppearanceSettingsEditor } from "./appearance-settings";
import { SettingsLocationContext } from "./settings-location";

afterEach(cleanup);

function Fixture({ onChange = () => {}, initial = DEFAULT_APPEARANCE }: {
  onChange?: (next: AppearanceSettings) => void;
  initial?: AppearanceSettings;
}) {
  const [value, setValue] = useState({ ...initial });
  const [previousPreset, setPreviousPreset] = useState(initial);
  return <AppearanceSettingsEditor value={value} previousPreset={previousPreset}
    onChange={next => { setValue(next); onChange(next); }} onPresetChange={setPreviousPreset} onColorPreview={() => {}}
    panelWidth={440} panelMaxWidth={720} onPanelWidthChange={() => {}} />;
}

describe("appearance disclosures and help", () => {
  it("keeps all presets available while the complete layout controls are collapsed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Fixture onChange={onChange} />);
    const toggle = screen.getByRole("button", { name: /^页面布局$/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "页面宽度模式" })).not.toBeInTheDocument();
    for (const name of ["紧凑", "标准", "宽松"]) expect(screen.getByRole("button", { name: new RegExp("^" + name + "$") })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /^宽松$/ }));
    expect(screen.getByRole("button", { name: /^宽松$/ })).toHaveAttribute("aria-pressed", "true");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ layoutPreset: "spacious" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(screen.getByRole("group", { name: "页面宽度模式" })).toBeVisible();
    expect(screen.getByRole("group", { name: "卡片形状" })).toBeVisible();
    expect(screen.getByRole("group", { name: "卡片排列" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /布局微调/ }));
    fireEvent.change(screen.getByRole("slider", { name: /^卡片宽度$/ }), { target: { value: "221" } });
    await user.click(toggle);
    expect(screen.queryByRole("slider", { name: /^卡片宽度$/ })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByRole("slider", { name: /^卡片宽度$/ })).toHaveValue("221");
  });

  it("remembers the layout disclosure for the mounted settings controller", async () => {
    const user = userEvent.setup();
    const memory = new Map<string, boolean>();
    const tree = (key: string) => <SettingsLocationContext value={memory}><Fixture key={key} /></SettingsLocationContext>;
    const view = render(tree("first"));
    await user.click(screen.getByRole("button", { name: /^页面布局$/ }));
    view.rerender(tree("second"));
    expect(screen.getByRole("button", { name: /^页面布局$/ })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: /^页面布局$/ }));
    view.rerender(tree("third"));
    expect(screen.getByRole("button", { name: /^页面布局$/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /^标准$/ })).toBeVisible();
  });

  it("exposes the four moved descriptions through hover, click and keyboard focus", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    expect(screen.queryByText(/一起调整卡片、文字/)).not.toBeInTheDocument();
    expect(screen.queryByText(/选择界面的明暗/)).not.toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: /^界面缩放说明$/ }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("浏览器和系统缩放已体现在可用空间中，无需重复补偿");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /^主题说明$/ }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("选择界面的明暗，或随系统自动切换");
    await user.keyboard("{Escape}");
    const layoutHelp = screen.getByRole("button", { name: /^页面布局说明$/ });
    act(() => layoutHelp.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent("整页布局预设一起调整卡片、间距、顶栏与搜索框等尺寸");
    expect(screen.getByRole("button", { name: /^页面布局$/ })).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /^页面布局$/ }));
    await user.click(screen.getByRole("button", { name: /^正方形$/ }));
    await user.click(screen.getByRole("button", { name: /^卡片排列说明$/ }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("按目标边长排列");
    expect(screen.getByRole("tooltip")).toHaveTextContent("卡片不随剩余空间拉伸");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("changes the note visibility through the existing appearance draft", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Fixture onChange={onChange} />);
    const notes = screen.getByRole("checkbox", { name: /^显示网站备注$/ });
    expect(notes).toBeChecked();
    await user.click(notes);
    expect(notes).not.toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ showSiteNotes: false, cardWidth: DEFAULT_APPEARANCE.cardWidth }));
    await user.click(notes);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ showSiteNotes: true }));
  });

  it.each(["adaptive", "columns"] as const)("keeps the square target side editable in %s layout and shares only height with free", async cardLayout => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const initial = { ...DEFAULT_APPEARANCE, cardLayout, cardWidth: 287, cardHeight: 233, cardColumns: 9 };
    render(<Fixture initial={initial} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /^页面布局$/ }));
    await user.click(screen.getByRole("button", { name: /布局微调/ }));
    await user.click(screen.getByRole("button", { name: /^正方形$/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...initial, cardShape: "square", layoutPreset: "custom" });
    expect(screen.queryByRole("slider", { name: /^卡片宽度$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /^卡片宽度数值$/ })).not.toBeInTheDocument();
    const side = screen.getByRole("slider", { name: /^正方形目标边长$/ });
    expect(side).toBeEnabled();
    expect(screen.getByRole("spinbutton", { name: /^正方形目标边长数值$/ })).toBeEnabled();
    expect(side).toHaveValue("233");
    expect(screen.getByText(/与自由比例的卡片高度共用同一数值/)).toHaveTextContent("修改后切回自由比例也会使用该高度");
    expect(screen.getByText(/与自由比例的卡片高度共用同一数值/)).toHaveTextContent("实际边长可能因图标、操作按钮、文字和备注而增加");
    if (cardLayout === "columns") {
      fireEvent.change(screen.getByRole("slider", { name: /^每行最多卡片数$/ }), { target: { value: "6" } });
      expect(onChange).toHaveBeenLastCalledWith({ ...initial, cardShape: "square", cardColumns: 6, layoutPreset: "custom" });
      fireEvent.change(screen.getByRole("slider", { name: /^每行最多卡片数$/ }), { target: { value: "9" } });
    }
    fireEvent.change(side, { target: { value: "212" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...initial, cardShape: "square", cardHeight: 212, layoutPreset: "custom" });
    expect(screen.getByRole("spinbutton", { name: /^正方形目标边长数值$/ })).toHaveValue("212");
    await user.click(screen.getByRole("button", { name: /^自由比例$/ }));
    const width = screen.getByRole("slider", { name: /^卡片宽度$/ });
    expect(width).toHaveValue("287");
    if (cardLayout === "columns") expect(width).toBeDisabled();
    else expect(width).toBeEnabled();
    expect(screen.getByRole("slider", { name: /^卡片高度$/ })).toBeEnabled();
    expect(screen.getByRole("slider", { name: /^卡片高度$/ })).toHaveValue("212");
    expect(onChange).toHaveBeenLastCalledWith({ ...initial, cardHeight: 212, layoutPreset: "custom" });
  });

  it("switches shape without changing saved dimensions or an idle requested count", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const initial = { ...DEFAULT_APPEARANCE, cardWidth: 319, cardHeight: 227, cardColumns: 11, fontScale: 115 };
    render(<Fixture initial={initial} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /^页面布局$/ }));
    await user.click(screen.getByRole("button", { name: /^正方形$/ }));
    await user.click(screen.getByRole("button", { name: /^自由比例$/ }));
    expect(onChange.mock.calls.map(([next]) => ({ width: next.cardWidth, height: next.cardHeight, columns: next.cardColumns })))
      .toEqual([{ width: 319, height: 227, columns: 11 }, { width: 319, height: 227, columns: 11 }]);
    expect(onChange).toHaveBeenLastCalledWith({ ...initial, layoutPreset: "custom" });
  });

  it("keeps density presets and their restore commands on the same shared geometry", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const initial = { ...DEFAULT_APPEARANCE, cardShape: "square" as const, cardLayout: "columns" as const,
      cardWidth: 287, cardHeight: 233, cardColumns: 9, fontScale: 115, accentColor: "#00897b" };
    render(<Fixture initial={initial} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /^页面布局$/ }));
    await user.click(screen.getByRole("button", { name: /布局微调/ }));
    await user.click(screen.getByRole("button", { name: /^紧凑$/ }));
    const selected: AppearanceSettings = onChange.mock.lastCall![0];
    expect(selected).toMatchObject({ cardShape: "square", cardLayout: "columns", cardColumns: 9,
      cardWidth: 140, cardHeight: 124, layoutPreset: "custom", fontScale: 115, accentColor: "#00897b" });
    expect(screen.getByRole("slider", { name: /^正方形目标边长$/ })).toHaveValue("124");
    fireEvent.change(screen.getByRole("slider", { name: /^正方形目标边长$/ }), { target: { value: "212" } });
    await user.click(screen.getByRole("button", { name: /^恢复上次预设$/ }));
    expect(onChange).toHaveBeenLastCalledWith(selected);
    await user.click(screen.getByRole("button", { name: /^恢复默认$/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_APPEARANCE, fontScale: 115, accentColor: "#00897b" });
    expect(screen.queryByRole("slider", { name: /^正方形目标边长$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /^卡片宽度$/ })).toHaveValue("160");
    expect(screen.getByRole("slider", { name: /^卡片高度$/ })).toHaveValue("140");
  });
});
