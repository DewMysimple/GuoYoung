interface RangeControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/** A single numeric control for geometry and image settings. */
export function RangeControl({ label, value, min, max, step = 1, unit = "px", disabled, onChange }: RangeControlProps) {
  return (
    <label className="range-control">
      <span>{label}<output>{value}{unit}</output></span>
      <input type="range" aria-label={label} min={min} max={max} step={step}
        value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
