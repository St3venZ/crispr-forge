"use client";

import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Loader2,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import type { AuditStep } from "@/types/crispr";

interface AuditStepperProps {
  steps: AuditStep[];
  isRunning: boolean;
  repairIterations?: number;
  mode?: "llm_agent" | "deterministic_engine";
  llmModelUsed?: string | null;
}

export function AuditStepper({
  steps,
  isRunning,
  repairIterations = 0,
  mode,
  llmModelUsed,
}: AuditStepperProps) {
  const [expanded, setExpanded] = useState(false);

  if (!isRunning && steps.length === 0) return null;

  const totalMs = steps.reduce((acc, s) => acc + (s.duration_ms || 0), 0);
  const repairedSteps = steps.filter((s) => s.status === "repaired").length;
  const hasSelfHealing = repairIterations > 0 || repairedSteps > 0;
  const showList = isRunning || expanded;

  const renderStatusIcon = (status: AuditStep["status"]) => {
    switch (status) {
      case "ok":
        return (
          <CheckCircle2 className="h-4 w-4 text-[#1c7c75] dark:text-emerald-400 shrink-0" />
        );
      case "repaired":
        return (
          <Wrench className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
        );
      case "warning":
        return (
          <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
        );
      case "error":
        return (
          <XCircle className="h-4 w-4 text-[#ff6b6b] dark:text-rose-400 shrink-0" />
        );
    }
  };

  const statusBadgeClass = (status: AuditStep["status"]) => {
    switch (status) {
      case "ok":
        return "rounded-full bg-[#4ecdc4]/20 text-[#1a7871] dark:rounded-md dark:border dark:border-[var(--border-hairline)] dark:bg-[var(--bg-surface)] dark:text-emerald-400";
      case "repaired":
        return "rounded-full bg-[var(--accent-soft)] text-accent dark:rounded-md dark:border dark:border-[var(--accent-border)]";
      case "warning":
        return "rounded-full bg-amber-500/15 text-amber-800 dark:rounded-md dark:border dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-300";
      case "error":
        return "neu-badge-coral rounded-full dark:rounded-md";
    }
  };

  const statusLabel = (status: AuditStep["status"]) => {
    switch (status) {
      case "ok":
        return "通过";
      case "repaired":
        return "自动自愈";
      case "warning":
        return "提醒";
      case "error":
        return "拦截";
    }
  };

  return (
    <section id="section-audit" className="scroll-mt-20">
      <div className="bio-card overflow-hidden">
        <div
          onClick={() => {
            if (!isRunning) setExpanded((v) => !v);
          }}
          className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 ${
            !isRunning
              ? "cursor-pointer hover:bg-white/25 dark:hover:bg-[var(--bg-subtle)]/50 transition"
              : "bg-[var(--accent-soft)]"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-primary)] shrink-0" />
            ) : (
              <Activity className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
            )}

            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {isRunning
                ? "零信任 Agent 工具调用管线运行中..."
                : `Agent 审计追踪已完成 (${steps.length} 个确定性工具步骤)`}
            </span>

            {mode === "llm_agent" ? (
              <span className="neu-recessed inline-flex items-center gap-1 rounded-full dark:rounded-md px-2.5 py-0.5 text-xs font-medium text-accent">
                <Sparkles className="h-3.5 w-3.5" />
                AI 编排{llmModelUsed ? ` · ${llmModelUsed}` : ""}
              </span>
            ) : mode === "deterministic_engine" ? (
              <span className="neu-recessed inline-flex items-center gap-1 rounded-full dark:rounded-md px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                <Cpu className="h-3.5 w-3.5" />
                本地零信任引擎
              </span>
            ) : null}

            {hasSelfHealing && (
              <span className="inline-flex items-center gap-1 rounded-full dark:rounded-md bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-medium text-accent dark:border dark:border-[var(--accent-border)]">
                <Wrench className="h-3.5 w-3.5" />
                自动自愈修复 ({Math.max(repairIterations, repairedSteps)} 次)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {totalMs > 0 && (
              <span className="font-mono-bio text-xs text-[var(--text-muted)]">
                总耗时 {(totalMs / 1000).toFixed(2)}s
              </span>
            )}
            {!isRunning && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                {expanded ? "收起日志" : "展开审计日志"}
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </span>
            )}
          </div>
        </div>

        {showList && (
          <div className="neu-divider-t px-6 py-5">
            {steps.length === 0 && isRunning ? (
              <div className="flex items-center gap-3 py-3 text-sm text-[var(--text-secondary)]">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)] animate-ping" />
                <span>正在解析指令并获取权威基因组序列，请稍候...</span>
              </div>
            ) : (
              <ol className="relative space-y-3.5 border-l-2 border-[#c6ccd6] dark:border-[var(--border-hairline)] ml-2 pl-5">
                {steps.map((step, idx) => (
                  <li key={`${step.step_index}-${idx}`} className="relative">
                    <span className="absolute -left-[29px] top-2 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg-surface)] ring-2 ring-[var(--bg-surface)]">
                      {renderStatusIcon(step.status)}
                    </span>
                    <div
                      className={`px-4 py-3 transition ${
                        step.status === "error"
                          ? "neu-alert-coral"
                          : step.status === "repaired"
                            ? "neu-soft-tile border-l-[3px] border-l-[var(--accent-primary)] dark:border-[var(--accent-border)] dark:bg-[var(--accent-soft)]"
                            : step.status === "warning"
                              ? "neu-soft-tile border-l-[3px] border-l-amber-500 dark:border-amber-500/30 dark:bg-amber-500/10"
                              : "neu-soft-tile dark:bg-[var(--bg-subtle)]/50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-bio text-xs font-semibold text-[var(--text-muted)]">
                            #{step.step_index}
                          </span>
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {step.stage}
                          </span>
                          <code className="neu-recessed rounded-full dark:rounded px-2.5 py-0.5 font-mono-bio text-xs text-accent">
                            {step.tool_name}
                          </code>
                          <span
                            className={`px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                              step.status
                            )}`}
                          >
                            {statusLabel(step.status)}
                          </span>
                        </div>
                        <span className="font-mono-bio text-xs text-[var(--text-muted)]">
                          {step.duration_ms} ms
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                        {step.message}
                      </p>
                    </div>
                  </li>
                ))}

                {isRunning && (
                  <li className="relative">
                    <span className="absolute -left-[29px] top-2 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg-surface)] ring-2 ring-[var(--bg-surface)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-primary)]" />
                    </span>
                    <div className="neu-recessed rounded-2xl dark:rounded-lg px-4 py-2.5 text-sm text-accent animate-pulse-soft">
                      正在执行下一阶段确定性校验与组装仿真...
                    </div>
                  </li>
                )}
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
