"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Compass,
  Cpu,
  Dna,
  KeyRound,
  Minus,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
} from "lucide-react";
import {
  DEFAULT_FONT_SCALE_PCT,
  MAX_FONT_SCALE_PCT,
  MIN_FONT_SCALE_PCT,
} from "@/lib/storage";
import type { ByokConfig, QuotaStatus, ThemeMode } from "@/types/crispr";

interface TopNavProps {
  quota: QuotaStatus | null;
  byokConfig: ByokConfig;
  backendOnline: boolean | null;
  themeMode: ThemeMode;
  fontScalePct: number;
  onChangeTheme: (mode: ThemeMode) => void;
  onChangeFontScalePct: (pct: number) => void;
  onOpenApiKeyModal: () => void;
  onOpenGuideModal: () => void;
}

const FONT_QUICK_PRESETS = [90, 96, 100, 106, 112];

const THEME_OPTIONS: {
  value: ThemeMode;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "light", label: "浅色", Icon: Sun },
  { value: "dark", label: "深色", Icon: Moon },
  { value: "system", label: "系统", Icon: Monitor },
];

export function TopNav({
  quota,
  byokConfig,
  backendOnline,
  themeMode,
  fontScalePct,
  onChangeTheme,
  onChangeFontScalePct,
  onOpenApiKeyModal,
  onOpenGuideModal,
}: TopNavProps) {
  const [fontPopoverOpen, setFontPopoverOpen] = useState(false);
  const fontControlRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!fontPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        fontControlRef.current &&
        !fontControlRef.current.contains(e.target as Node)
      ) {
        setFontPopoverOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFontPopoverOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [fontPopoverOpen]);

  const hasByok = Boolean(byokConfig.apiKey.trim());
  const computedPx = ((16 * fontScalePct) / 100).toFixed(1);
  const sliderPct =
    ((fontScalePct - MIN_FONT_SCALE_PCT) /
      (MAX_FONT_SCALE_PCT - MIN_FONT_SCALE_PCT)) *
    100;

  const renderQuotaPill = () => {
    if (hasByok) {
      return (
        <button
          type="button"
          onClick={onOpenApiKeyModal}
          className="btn-outline inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer"
          title="点击管理自带 API Key 设置"
        >
          <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-sky-400" />
          <KeyRound className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" />
          <span>BYOK 已连接</span>
          <span className="hidden xl:inline rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono-bio text-xs text-[var(--text-secondary)]">
            {byokConfig.model || "custom"}
          </span>
        </button>
      );
    }

    if (quota && quota.free_trial_enabled) {
      const low = quota.remaining_today <= 2;
      return (
        <button
          type="button"
          onClick={onOpenApiKeyModal}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
            low
              ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
              : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
          }`}
          title="点击配置自带 API Key 解锁无限 AI 推理"
        >
          <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" />
          <span>
            AI 额度{" "}
            <strong className="font-mono-bio">
              {quota.remaining_today}/{quota.daily_limit}
            </strong>
          </span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={onOpenApiKeyModal}
        className="btn-outline inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer"
        title="核心生物设计 100% 免费本地运行；点击可绑定 API Key 开启 AI 自然语言模式"
      >
        <Cpu className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" />
        <span className="hidden sm:inline">本地引擎 · 模型设置</span>
        <span className="sm:hidden">模型</span>
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-40 h-[56px] border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 backdrop-blur-md">
      <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6">
        {/* Left: Precision Brand Mark + Subtle Engine Dot */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-fg)]">
            <Dna className="h-4 w-4" />
          </div>

          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              CRISPR-Forge
            </span>
            <span className="hidden md:inline-block rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-0.5 font-mono-bio text-xs font-medium text-[var(--text-muted)]">
              Zero-Trust Workbench
            </span>

            {backendOnline !== null && (
              <div
                className={`hidden xl:inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
                  backendOnline
                    ? "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                    : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
                }`}
                title={
                  backendOnline
                    ? "FastAPI 生物计算后端在线"
                    : "无法连接到后端 API，请启动 FastAPI 服务"
                }
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    backendOnline
                      ? "bg-emerald-500"
                      : "bg-rose-600 dark:bg-rose-400"
                  }`}
                />
                <span>{backendOnline ? "引擎在线" : "后端离线"}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Fine-Grained Font Scale (84%–120%) + 3-State Theme + Tour + Quota */}
        <div
          data-tour="top-controls"
          className="flex items-center gap-2 sm:gap-2.5 shrink-0"
        >
          {/* Fine-Grained Continuous Font Size Adjuster: [ − ] [ 100% ] [ + ] */}
          <div ref={fontControlRef} className="relative hidden sm:block">
            <div
              className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)]"
              role="group"
              aria-label="精细字号调节 (84%–120%)"
            >
              <button
                type="button"
                disabled={fontScalePct <= MIN_FONT_SCALE_PCT}
                onClick={() => onChangeFontScalePct(fontScalePct - 2)}
                title="缩小字号 (-2%)"
                aria-label="缩小字号 2%"
                className="flex h-8 w-7 items-center justify-center text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setFontPopoverOpen((v) => !v)}
                title="点击展开 1% 连续字号滑块"
                className={`flex h-8 min-w-[54px] items-center justify-center border-x border-[var(--border-hairline)] px-2 font-mono-bio text-xs font-semibold transition cursor-pointer ${
                  fontPopoverOpen || fontScalePct !== DEFAULT_FONT_SCALE_PCT
                    ? "bg-[var(--bg-surface)] text-blue-600 dark:text-sky-400"
                    : "bg-[var(--bg-surface)] text-[var(--text-primary)] hover:text-blue-600 dark:hover:text-sky-400"
                }`}
              >
                {fontScalePct}%
              </button>

              <button
                type="button"
                disabled={fontScalePct >= MAX_FONT_SCALE_PCT}
                onClick={() => onChangeFontScalePct(fontScalePct + 2)}
                title="放大字号 (+2%)"
                aria-label="放大字号 2%"
                className="flex h-8 w-7 items-center justify-center text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Compact Popover with 1% Continuous Slider + Exact px Readout + Reset */}
            {fontPopoverOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-elevated)] p-4 shadow-xl dark:shadow-black/50 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    全局界面字号微调
                  </span>
                  <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 font-mono-bio text-xs font-semibold text-blue-600 dark:text-sky-400">
                    {fontScalePct}% · {computedPx} px
                  </span>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="range"
                    min={MIN_FONT_SCALE_PCT}
                    max={MAX_FONT_SCALE_PCT}
                    step={1}
                    value={fontScalePct}
                    onChange={(e) =>
                      onChangeFontScalePct(Number(e.target.value))
                    }
                    style={{
                      background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${sliderPct}%, var(--border-strong) ${sliderPct}%, var(--border-strong) 100%)`,
                    }}
                    className="precision-range w-full cursor-pointer"
                    aria-label="连续字号缩放百分比"
                  />
                  <div className="flex justify-between font-mono-bio text-xs text-[var(--text-muted)]">
                    <span>{MIN_FONT_SCALE_PCT}%</span>
                    <span>100%</span>
                    <span>{MAX_FONT_SCALE_PCT}%</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {FONT_QUICK_PRESETS.map((preset) => {
                    const active = fontScalePct === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onChangeFontScalePct(preset)}
                        className={`rounded-md border px-2 py-1 font-mono-bio text-xs font-semibold transition cursor-pointer ${
                          active
                            ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-blue-700 dark:text-sky-300"
                            : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                        }`}
                      >
                        {preset}%
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between border-t border-[var(--border-hairline)] pt-2.5">
                  <span className="text-xs text-[var(--text-muted)]">
                    ± 键步进 2%，滑块步进 1%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeFontScalePct(DEFAULT_FONT_SCALE_PCT)
                    }
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-[var(--accent-soft)] dark:text-sky-400 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    重置 100%
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3-State Theme Switcher: 浅色 | 深色 | 系统 */}
          <div
            className="inline-flex items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5"
            role="group"
            aria-label="外观主题切换"
          >
            {THEME_OPTIONS.map(({ value, label, Icon }) => {
              const active = themeMode === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChangeTheme(value)}
                  title={`切换至${label}外观`}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    active
                      ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenGuideModal}
            title="启动交互式聚光灯新手引导"
            className="btn-outline inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer"
          >
            <Compass className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            <span className="hidden lg:inline">新手引导</span>
          </button>

          {renderQuotaPill()}
        </div>
      </div>
    </header>
  );
}
