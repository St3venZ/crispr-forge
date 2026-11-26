"use client";

import React from "react";
import { Minus, Plus } from "lucide-react";

interface PrecisionSliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  presets?: number[];
  decimals?: number;
  hint?: string;
  onChange: (next: number) => void;
}

export function PrecisionSliderInput({
  label,
  value,
  min,
  max,
  step,
  unit,
  presets,
  decimals = 0,
  hint,
  onChange,
}: PrecisionSliderInputProps) {
  const clamp = (n: number) => {
    const rounded = Math.round(n / step) * step;
    const fixed = Number(rounded.toFixed(decimals));
    return Math.max(min, Math.min(max, fixed));
  };

  const tickPresets =
    presets && presets.length > 0
      ? presets
      : [min, Math.round(((min + max) / 2) / step) * step, max];

  const rangePct =
    max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;

  return (
    <div className="neu-soft-tile space-y-3 rounded-[20px] p-4">
      {/* Header Row: Full Unclipped Parameter Label + Compact Stepper */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-[13px] font-bold text-[var(--text-primary)]">
          {label}
        </label>

        <div className="neu-recessed inline-flex shrink-0 items-center overflow-hidden rounded-full px-1 py-0.5">
          <button
            type="button"
            onClick={() => onChange(clamp(value - step))}
            disabled={value <= min}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:text-[var(--accent-primary)] disabled:opacity-35 cursor-pointer"
            aria-label={`减少${label}`}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChange(clamp(value + step))}
            disabled={value >= max}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:text-[var(--accent-primary)] disabled:opacity-35 cursor-pointer"
            aria-label={`增加${label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Scientific Instrument Centered Mono Digital Readout */}
      <div className="neu-recessed flex items-baseline justify-center gap-1.5 rounded-2xl px-3 py-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed)) {
              onChange(Math.max(min, Math.min(max, parsed)));
            }
          }}
          onBlur={() => onChange(clamp(value))}
          aria-label={`${label}数值`}
          className="w-20 bg-transparent text-right font-mono-bio text-2xl font-bold leading-none tracking-tight text-[var(--text-primary)] focus:outline-none"
        />
        <span className="font-mono-bio text-sm font-bold text-accent">
          {unit}
        </span>
      </div>

      {/* Slider Track + Calibrated Instrument Tick Marks */}
      <div className="space-y-1.5 pt-0.5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ "--range-pct": `${rangePct}%` } as React.CSSProperties}
          className="precision-range w-full cursor-pointer"
        />
        <div
          aria-hidden="true"
          className="flex items-start justify-between px-2.5"
        >
          {Array.from({ length: 17 }).map((_, idx) => (
            <span
              key={idx}
              className={`w-px rounded-full ${
                idx % 4 === 0
                  ? "h-2 bg-[var(--border-strong)]"
                  : "h-1 bg-[var(--border-hairline)]"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {tickPresets.map((preset) => {
            const active = Math.abs(value - preset) < step / 2;
            return (
              <button
                key={preset}
                type="button"
                data-active={active}
                onClick={() => onChange(preset)}
                className="neu-pill px-2.5 py-0.5 font-mono-bio text-xs font-medium cursor-pointer"
              >
                {decimals > 0 ? preset.toFixed(decimals) : preset} {unit}
              </button>
            );
          })}
        </div>
        {hint && <span className="text-xs text-[var(--text-muted)]">{hint}</span>}
      </div>
    </div>
  );
}
