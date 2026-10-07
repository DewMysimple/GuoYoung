import { RangeControl } from "./range-control";

export function PanelGlassControls({ label, transparency, blur, onTransparency, onBlur }: {
  label: string; transparency: number; blur: number;
  onTransparency: (value: number) => void; onBlur: (value: number) => void;
}) {
  return <>
    <RangeControl label="模糊强度" min={0} max={30} value={blur} onChange={onBlur} />
    <RangeControl label={`${label}透明度`} min={0} max={100} value={transparency} unit="%" onChange={onTransparency} />
  </>;
}
