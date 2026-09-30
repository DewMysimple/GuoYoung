import { RangeControl } from "./range-control";
import { SettingsToggle } from "./settings-toggle";

export function PanelGlassControls({ label, transparency, blur, blurEnabled, onTransparency, onBlur, onBlurEnabled }: {
  label: string; transparency: number; blur: number; blurEnabled: boolean;
  onTransparency: (value: number) => void; onBlur: (value: number) => void; onBlurEnabled: (value: boolean) => void;
}) {
  return <>
    <SettingsToggle label="模糊壁纸" help={`柔化${label}下方的图片细节`} checked={blurEnabled} onChange={onBlurEnabled} />
    <RangeControl label="模糊强度" min={0} max={30} value={blur} disabled={!blurEnabled} onChange={onBlur} />
    <RangeControl label={`${label}透明度`} min={0} max={100} value={transparency} unit="%" onChange={onTransparency} />
  </>;
}
