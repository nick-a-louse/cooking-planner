import { useEffect, useState, type InputHTMLAttributes } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "type"> {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

/** A whole number from `min` to `max`. Empty or out-of-range text gives the nearest allowed value. */
export function clampWhole(text: string, min: number, max: number): number {
  const n = Math.round(Number(text));
  return text.trim() === "" || !Number.isFinite(n) ? min : Math.min(max, Math.max(min, n));
}

/**
 * A number box you can clear and retype. The text is kept as typed while you edit (so deleting
 * "0" leaves it empty instead of snapping straight back to 0); the parent gets each valid number
 * as you type, and the box tidies itself to the allowed range when you leave it.
 */
export default function WholeNumberInput({ value, min, max, onChange, onBlur, ...rest }: Props) {
  const [text, setText] = useState(String(value));

  // Follow outside changes (e.g. settings finishing loading), but not our own while typing.
  useEffect(() => {
    if (text.trim() === "" || clampWhole(text, min, max) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim() !== "") onChange(clampWhole(e.target.value, min, max));
      }}
      onBlur={(e) => {
        const n = clampWhole(text, min, max);
        setText(String(n));
        onChange(n);
        onBlur?.(e);
      }}
    />
  );
}
