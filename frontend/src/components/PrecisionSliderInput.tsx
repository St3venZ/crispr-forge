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

  return (
    <div className="neu-recessed space-y-3 rounded-[20px] p-4">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs sm:text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap">
          {label}
        </label>

        <div className="neu-recessed inline-flex shrink-0 items-center overflow-hidden rounded-full px-1 py-0.5">
          <button
            type="button"
            onClick={() => onChange(clamp(value - step))}
            disabled={value <= min}
            className="flex h-7 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:text-[var(--accent-primary)] disabled:opacity-35 cursor-pointer"
            aria-label={`减少${label}`}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center px-1.5">
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
              className="w-12 bg-transparent py-1 text-right font-mono-bio text-xs sm:text-sm font-semibold text-accent focus:outline-none"
            />
            <span className="ml-1 font-mono-bio text-xs font-medium text-[var(--text-muted)]">
              {unit}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange(clamp(value + step))}
            disabled={value >= max}
            className="flex h-7 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:text-[var(--accent-primary)] disabled:opacity-35 cursor-pointer"
            aria-label={`增加${label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="precision-range w-full cursor-pointer"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
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
