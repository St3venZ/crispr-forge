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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 dark:bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="byok-modal-title"
    >
      <div className="neu-popover relative w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="neu-divider-b flex items-start justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="neu-recessed flex h-10 w-10 items-center justify-center rounded-2xl dark:h-9 dark:w-9 dark:rounded-lg text-[var(--accent-primary)]">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="byok-modal-title"
                className="font-display text-lg text-[var(--text-primary)] dark:text-base"
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
            className="neu-pill p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label="关闭弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 px-6 py-6">
          {/* Clean Guarantee Banner */}
          <div className="neu-recessed flex items-start gap-3 rounded-2xl dark:rounded-lg border-l-[4px] border-l-[var(--accent-primary)] p-4 text-sm text-[var(--text-primary)]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
            <div className="space-y-1">
              <p className="font-semibold">
                不填任何 API Key 也能 100% 免费使用全部核心生信设计
              </p>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                NCBI/本地序列解析、sgRNA 评分、全基因组脱靶扫描、引物与同源臂设计、12 点硅片仿真校验、电泳图与移液计算器均在本地免费运行。API Key 仅用于增强自然语言解析与 AI 实验解读。
              </p>
            </div>
          </div>

          {quota && quota.free_trial_enabled && !config.apiKey && (
            <div className="neu-recessed flex items-center justify-between rounded-2xl dark:rounded-lg px-4 py-3 text-sm text-[var(--text-primary)]">
              <span className="inline-flex items-center gap-2 font-medium">
                <Sparkles className="h-4 w-4 text-[var(--accent-primary)]" />
                当前已开启站内免费 AI 体验额度
              </span>
              <span className="font-mono-bio font-semibold text-accent">
                今日剩余 {quota.remaining_today} / {quota.daily_limit} 次
              </span>
            </div>
          )}

          <div>
            <label className="mb-3 block text-sm font-medium text-[var(--text-primary)]">
              1. 一键选择模型服务商预设
            </label>
            <div className="grid grid-cols-2 gap-4 dark:gap-2.5">
              {BYOK_PROVIDERS.map((preset) => {
                const selected = preset.id === providerId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-selected={selected}
                    onClick={() => handleSelectProvider(preset.id)}
                    className="neu-card-interactive flex flex-col items-start p-3.5 text-left cursor-pointer"
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span
                        className={`text-sm font-semibold ${
                          selected
                            ? "text-accent dark:text-[var(--text-primary)]"
                            : "text-[var(--text-primary)]"
                        }`}
                      >
                        {preset.name}
                      </span>
                      {selected && (
                        <Check className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
                      )}
                    </div>
                    <span className="mt-1.5 neu-recessed rounded-full dark:rounded px-2.5 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                      {preset.badge}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-xs text-[var(--text-muted)]">
              {activePreset.hint}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                2. API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={activePreset.placeholder}
                  className="neu-input w-full py-3 pl-4 pr-11 font-mono-bio text-sm"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Base URL (OpenAI 兼容接口)
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="neu-input w-full px-3.5 py-2.5 font-mono-bio text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Model 模型标识
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className="neu-input w-full px-3.5 py-2.5 font-mono-bio text-sm"
                />
              </div>
            </div>
          </div>

          <div className="neu-recessed flex items-start gap-2.5 rounded-2xl dark:rounded-lg px-4 py-3 text-xs text-[var(--text-secondary)]">
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
                className="neu-badge-coral inline-flex items-center gap-1.5 rounded-2xl dark:rounded-lg px-3.5 py-2 text-xs font-medium dark:font-semibold transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清除本地 Key
              </button>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                可随时切换回免费本地模式
              </span>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="btn-outline px-4 py-2.5 text-sm font-medium cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold cursor-pointer"
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
