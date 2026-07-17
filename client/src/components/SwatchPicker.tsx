import { PALETTE } from "@cookplan/shared";

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export default function SwatchPicker({ value, onChange }: Props) {
  return (
    <div className="swatch-grid" role="radiogroup" aria-label="Colour">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c.toLowerCase() === value.toLowerCase()}
          className={`swatch${c.toLowerCase() === value.toLowerCase() ? " swatch-selected" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}
