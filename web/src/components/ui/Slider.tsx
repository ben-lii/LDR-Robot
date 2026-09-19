import type { ChangeEvent } from 'react';

export function Slider({
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className={`flex min-w-[140px] flex-1 flex-col gap-1 ${disabled ? 'opacity-40' : ''}`}
      aria-disabled={disabled}
    >
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-text">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-text disabled:cursor-not-allowed"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(Number(event.target.value));
        }}
      />
    </div>
  );
}
