"use client";

import React, { useEffect, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { BYOK_PROVIDERS } from "@/lib/constants";
import type { ByokConfig, QuotaStatus } from "@/types/crispr";

interface ApiKeyModalProps {
  open: boolean;
  config: ByokConfig;
  quota: QuotaStatus | null;
  onClose: () => void;
  onSave: (cfg: ByokConfig) => void;
  onClear: () => void;
}

export function ApiKeyModal({
  open,
  config,
  quota,
  onClose,
  onSave,
  onClear,
}: ApiKeyModalProps) {
  const [providerId, setProviderId] = useState(config.providerId || "deepseek");
  const [apiKey, setApiKey] = useState(config.apiKey || "");
  const [baseUrl, setBaseUrl] = useState(
    config.baseUrl || "https://api.deepseek.com/v1"
  );
  const [model, setModel] = useState(config.model || "deepseek-chat");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setProviderId(config.providerId || "deepseek");
      setApiKey(config.apiKey || "");
      setBaseUrl(config.baseUrl || "https://api.deepseek.com/v1");
      setModel(config.model || "deepseek-chat");
      setShowKey(false);
    }
  }, [open, config]);

  if (!open) return null;

  const activePreset =
    BYOK_PROVIDERS.find((p) => p.id === providerId) ?? BYOK_PROVIDERS[0];

  const handleSelectProvider = (id: string) => {
    const preset = BYOK_PROVIDERS.find((p) => p.id === id);
    setProviderId(id);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.defaultModel);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      providerId,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || activePreset.baseUrl,
      model: model.trim() || activePreset.defaultModel,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="byok-modal-title"
    >
      <div className="bio-card relative w-full max-w-xl overflow-hidden rounded-xl bg-[var(--bg-surface-elevated)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border-hairline)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--accent-primary)]">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="byok-modal-title"
                className="text-base font-bold text-[var(--text-primary)]"
              >
                AI 模型与自带 API Key (BYOK) 设置
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                自由切换大模型服务商，解除每日免费体验额度限制
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label="关闭弹窗"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 px-6 py-5">
          {/* Clean architectural guarantee banner (no pastel green wash) */}
          <div className="flex items-start gap-3 rounded-lg border border-[var(--border-hairline)] border-l-[3px] border-l-[var(--accent-primary)] bg-[var(--bg-subtle)]/70 p-3.5 text-sm text-[var(--text-primary)]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
            <div className="space-y-1">
              <p className="font-bold">
                不填任何 API Key 也能 100% 免费使用全部核心生信设计
              </p>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                NCBI/本地序列解析、sgRNA 评分、全基因组脱靶扫描、引物与同源臂设计、12 点硅片仿真校验、电泳图与移液计算器均在本地免费运行。API Key 仅用于增强自然语言解析与 AI 实验解读。
              </p>
            </div>
          </div>

          {quota && quota.free_trial_enabled && !config.apiKey && (
            <div className="flex items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/50 px-4 py-2.5 text-sm text-[var(--text-primary)]">
              <span className="inline-flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-[var(--accent-primary)]" />
                当前已开启站内免费 AI 体验额度
              </span>
              <span className="font-mono-bio font-bold text-blue-700 dark:text-sky-300">
                今日剩余 {quota.remaining_today} / {quota.daily_limit} 次
              </span>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">
              1. 一键选择模型服务商预设
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {BYOK_PROVIDERS.map((preset) => {
                const selected = preset.id === providerId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectProvider(preset.id)}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition cursor-pointer ${
                      selected
                        ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                        : "border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="text-sm font-bold text-[var(--text-primary)]">
                        {preset.name}
                      </span>
                      {selected && (
                        <Check className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
                      )}
                    </div>
                    <span className="mt-1 rounded bg-[var(--bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                      {preset.badge}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {activePreset.hint}
            </p>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">
                2. API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={activePreset.placeholder}
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-2.5 pl-3.5 pr-10 font-mono-bio text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] cursor-pointer"
                  aria-label={showKey ? "隐藏 Key" : "显示 Key"}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
                  Base URL (OpenAI 兼容接口)
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono-bio text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
                  Model 模型标识
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono-bio text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/60 px-3.5 py-2.5 text-xs text-[var(--text-secondary)]">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <span className="leading-relaxed">
              隐私保障：密钥仅保存在您的浏览器{" "}
              <code className="font-mono-bio font-semibold text-[var(--text-primary)]">
                localStorage
              </code>{" "}
              本地存储，仅随单次请求透传，后端绝不持久化保存。
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            {config.apiKey ? (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清除本地 Key
              </button>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                可随时切换回免费本地模式
              </span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-outline rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer"
              >
                <Check className="h-4 w-4" />
                保存至浏览器
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
