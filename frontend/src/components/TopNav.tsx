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
          className="btn-outline inline-flex items-center gap-2 rounded-2xl dark:rounded-lg px-3.5 py-2 text-xs font-medium dark:font-semibold cursor-pointer"
          title="点击管理自带 API Key 设置"
        >
          <span className="h-2 w-2 rounded-full bg-[#4ecdc4] dark:bg-sky-400" />
          <KeyRound className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
          <span>BYOK 已连接</span>
          <span className="hidden xl:inline neu-recessed rounded-full dark:rounded px-2 py-0.5 font-mono-bio text-xs text-[var(--text-secondary)]">
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
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium dark:font-semibold transition cursor-pointer ${
            low
              ? "neu-badge-coral rounded-2xl dark:rounded-lg dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
              : "btn-outline rounded-2xl dark:rounded-lg"
          }`}
          title="点击配置自带 API Key 解锁无限 AI 推理"
        >
          <Sparkles className={`h-3.5 w-3.5 ${low ? "text-white dark:text-rose-300" : "text-[var(--accent-primary)]"}`} />
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
        className="btn-outline inline-flex items-center gap-1.5 rounded-2xl dark:rounded-lg px-3.5 py-2 text-xs font-medium dark:font-semibold cursor-pointer"
        title="核心生物设计 100% 免费本地运行；点击可绑定 API Key 开启 AI 自然语言模式"
      >
        <Cpu className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
        <span className="hidden sm:inline">本地引擎 · 模型设置</span>
        <span className="sm:hidden">模型</span>
      </button>
    );
  };

  return (
    <header className="neu-topbar sticky top-0 z-40 h-[62px] dark:h-[56px]">
      <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6">
        {/* Left: Tactile Brand Mark + Subtle Engine Dot */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="neu-pill flex h-9 w-9 shrink-0 items-center justify-center text-[var(--accent-primary)] dark:h-8 dark:w-8 dark:rounded-lg dark:border-0 dark:bg-[var(--primary)] dark:text-[var(--primary-fg)]">
            <Dna className="h-4 w-4" />
          </div>

          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-display whitespace-nowrap text-lg text-[var(--text-primary)] dark:text-base">
              CRISPR-Forge
            </span>
            <span className="hidden lg:inline-block whitespace-nowrap neu-recessed rounded-full dark:rounded-md px-2.5 py-0.5 font-mono-bio text-xs font-medium text-[var(--text-muted)]">
              Zero-Trust Workbench
            </span>

            {backendOnline !== null && (
              <div
                className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${
                  backendOnline
                    ? "neu-recessed rounded-full dark:rounded-md dark:bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                    : "neu-badge-coral rounded-full dark:rounded-md dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
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
                      ? "bg-[#4ecdc4] dark:bg-emerald-500"
                      : "bg-white dark:bg-rose-400"
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
          className="flex items-center gap-2.5 sm:gap-3 shrink-0"
        >
          {/* Fine-Grained Continuous Font Size Adjuster: [ − ] [ 100% ] [ + ] */}
          <div ref={fontControlRef} className="relative hidden sm:block">
            <div
              className="neu-recessed inline-flex items-center overflow-hidden rounded-full px-1 py-0.5 dark:rounded-lg dark:p-0"
              role="group"
              aria-label="精细字号调节 (84%–120%)"
            >
              <button
                type="button"
                disabled={fontScalePct <= MIN_FONT_SCALE_PCT}
                onClick={() => onChangeFontScalePct(fontScalePct - 2)}
                title="缩小字号 (-2%)"
                aria-label="缩小字号 2%"
                className="flex h-7 w-7 dark:h-8 items-center justify-center rounded-full dark:rounded-none text-[var(--text-secondary)] transition hover:text-[var(--accent-primary)] dark:hover:bg-[var(--bg-surface)] dark:hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setFontPopoverOpen((v) => !v)}
                title="点击展开 1% 连续字号滑块"
                className={`flex h-7 dark:h-8 min-w-[52px] items-center justify-center dark:border-x dark:border-[var(--border-hairline)] px-2 font-mono-bio text-xs font-medium dark:font-semibold transition cursor-pointer ${
                  fontPopoverOpen || fontScalePct !== DEFAULT_FONT_SCALE_PCT
                    ? "text-accent dark:bg-[var(--bg-surface)]"
                    : "text-[var(--text-primary)] hover:text-accent dark:bg-[var(--bg-surface)]"
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
                className="flex h-7 w-7 dark:h-8 items-center justify-center rounded-full dark:rounded-none text-[var(--text-secondary)] transition hover:text-[var(--accent-primary)] dark:hover:bg-[var(--bg-surface)] dark:hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Compact Popover with 1% Continuous Slider + Exact px Readout + Reset */}
            {fontPopoverOpen && (
              <div className="neu-popover absolute left-1/2 -translate-x-1/2 lg:left-auto lg:right-0 lg:translate-x-0 top-full z-50 mt-3 w-72 max-w-[calc(100vw-2rem)] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    全局界面字号微调
                  </span>
                  <span className="neu-recessed rounded-full dark:rounded-md px-2.5 py-0.5 font-mono-bio text-xs font-medium text-accent">
                    {fontScalePct}% · {computedPx} px
                  </span>
                </div>

                <div className="space-y-2">
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

                <div className="flex flex-wrap items-center gap-2">
                  {FONT_QUICK_PRESETS.map((preset) => {
                    const active = fontScalePct === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        data-active={active}
                        onClick={() => onChangeFontScalePct(preset)}
                        className="neu-pill px-2.5 py-1 font-mono-bio text-xs font-medium cursor-pointer"
                      >
                        {preset}%
                      </button>
                    );
                  })}
                </div>

                <div className="neu-divider-t flex items-center justify-between pt-3">
                  <span className="text-xs text-[var(--text-muted)]">
                    ± 键步进 2%，滑块步进 1%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeFontScalePct(DEFAULT_FONT_SCALE_PCT)
                    }
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-accent hover:bg-[var(--accent-soft)] cursor-pointer"
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
            className="neu-recessed inline-flex items-center rounded-full p-1 gap-0.5 dark:rounded-lg dark:p-0.5 dark:gap-0"
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium dark:font-semibold transition cursor-pointer ${
                    active
                      ? "neu-seg-active"
                      : "rounded-full dark:rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
            className="btn-outline inline-flex items-center gap-1.5 rounded-2xl dark:rounded-lg px-3 py-2 text-xs font-medium dark:font-semibold cursor-pointer"
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
