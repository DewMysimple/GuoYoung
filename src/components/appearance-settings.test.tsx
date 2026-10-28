import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "../data/defaults";
import type { AppearanceSettings } from "../types";
import { AppearanceSettingsEditor } from "./appearance-settings";
import { SettingsLocationContext } from "./settings-location";

afterEach(cleanup);

function Fixture({ onChange = () => {} }: { onChange?: (next: AppearanceSettings) => void }) {
  const [value, setValue] = useState({ ...DEFAULT_APPEARANCE });
  return <AppearanceSettingsEditor value={value} previousPreset={DEFAULT_APPEARANCE}
    onChange={next => { setValue(next); onChange(next); }} onPresetChange={() => {}} onColorPreview={() => {}}
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
    expect(screen.getByRole("tooltip")).toHaveTextContent("选择喜欢的疏密，卡片与间距一起调整");
    expect(screen.getByRole("button", { name: /^页面布局$/ })).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /^页面布局$/ }));
    await user.click(screen.getByRole("button", { name: /^正方形$/ }));
    await user.click(screen.getByRole("button", { name: /^卡片排列说明$/ }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("根据卡片最小宽度自动排列");
    expect(screen.getByRole("tooltip")).toHaveTextContent("正方形的高度始终跟随实际宽度");
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
});
