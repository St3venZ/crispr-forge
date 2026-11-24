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

  const pct = Math.max(
    0,
    Math.min(100, ((value - min) / Math.max(max - min, 0.0001)) * 100)
  );

  const tickPresets =
    presets && presets.length > 0
      ? presets
      : [min, Math.round(((min + max) / 2) / step) * step, max];

  return (
    <div className="space-y-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-semibold text-[var(--text-primary)]">
          {label}
        </label>

        <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <button
            type="button"
            onClick={() => onChange(clamp(value - step))}
            disabled={value <= min}
            className="flex h-8 w-8 items-center justify-center text-[var(--text-secondary)] transition hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
            aria-label={`减少${label}`}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center border-x border-[var(--border-hairline)] px-2">
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
              className="w-16 bg-transparent py-1 text-right font-mono-bio text-sm font-bold text-[var(--text-primary)] focus:outline-none"
            />
            <span className="ml-1 font-mono-bio text-xs font-medium text-[var(--text-muted)]">
              {unit}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange(clamp(value + step))}
            disabled={value >= max}
            className="flex h-8 w-8 items-center justify-center text-[var(--text-secondary)] transition hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
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
        style={{
          background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${pct}%, var(--border-strong) ${pct}%, var(--border-strong) 100%)`,
        }}
        className="precision-range w-full cursor-pointer"
      />

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {tickPresets.map((preset) => {
            const active = Math.abs(value - preset) < step / 2;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onChange(preset)}
                className={`rounded-md border px-2 py-0.5 font-mono-bio text-xs font-medium transition cursor-pointer ${
                  active
                    ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-blue-700 dark:text-sky-300"
                    : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                }`}
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
