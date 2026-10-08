import type { PanelGlassStyle } from "../types";
import { RangeControl } from "./range-control";
import { SettingsDisclosure } from "./settings-disclosure";
import { SettingsChoiceGroup } from "./settings-options";

const MODES = [
  { value: "shared", label: "跟随公共" },
  { value: "glass", label: "独立玻璃底板" },
] as const;

/** Topbar and sidebar expose the same material options through one editor. */
export function PanelGlassSettings({ label, style, transparency, blur, onStyle, onTransparency, onBlur }: {
  label: string;
  style: PanelGlassStyle;
  transparency: number;
  blur: number;
  onStyle: (value: PanelGlassStyle) => void;
  onTransparency: (value: number) => void;
  onBlur: (value: number) => void;
}) {
  return <SettingsDisclosure title={`${label}外观`} summary={MODES.find(mode => mode.value === style)?.label}
    help="跟随公共时使用公共面板的透明度、磨砂和高光；独立模式可调节透明度和模糊强度。透明度 100%、模糊强度 0 时完全透出壁纸。">
    <SettingsChoiceGroup label={`${label}样式`} className="segmented-control" value={style} options={MODES} onChange={onStyle} />
    {style === "glass" && <>
      <RangeControl label="模糊强度" min={0} max={30} value={blur} onChange={onBlur} />
      <RangeControl label={`${label}透明度`} min={0} max={100} value={transparency} unit="%" onChange={onTransparency} />
    </>}
  </SettingsDisclosure>;
}
