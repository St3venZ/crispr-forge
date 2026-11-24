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
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        );
      case "repaired":
        return (
          <Wrench className="h-4 w-4 text-blue-600 dark:text-sky-400 shrink-0" />
        );
      case "warning":
        return (
          <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
        );
      case "error":
        return (
          <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
        );
    }
  };

  const statusBadgeClass = (status: AuditStep["status"]) => {
    switch (status) {
      case "ok":
        return "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-emerald-700 dark:text-emerald-400";
      case "repaired":
        return "border-[var(--accent-border)] bg-[var(--accent-soft)] text-blue-700 dark:text-sky-300";
      case "warning":
        return "border-amber-300/80 bg-amber-50 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-300";
      case "error":
        return "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300";
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
      <div className="bio-card overflow-hidden rounded-xl">
        <div
          onClick={() => {
            if (!isRunning) setExpanded((v) => !v);
          }}
          className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 ${
            !isRunning
              ? "cursor-pointer hover:bg-[var(--bg-subtle)]/50 transition"
              : "bg-[var(--accent-soft)]"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-primary)] shrink-0" />
            ) : (
              <Activity className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
            )}

            <span className="text-sm font-bold text-[var(--text-primary)]">
              {isRunning
                ? "零信任 Agent 工具调用管线运行中..."
                : `Agent 审计追踪已完成 (${steps.length} 个确定性工具步骤)`}
            </span>

            {mode === "llm_agent" ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-sky-300">
                <Sparkles className="h-3.5 w-3.5" />
                AI 编排{llmModelUsed ? ` · ${llmModelUsed}` : ""}
              </span>
            ) : mode === "deterministic_engine" ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                <Cpu className="h-3.5 w-3.5" />
                本地零信任引擎
              </span>
            ) : null}

            {hasSelfHealing && (
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-sky-300">
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
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-sky-400">
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
          <div className="border-t border-[var(--border-hairline)] px-5 py-4">
            {steps.length === 0 && isRunning ? (
              <div className="flex items-center gap-3 py-3 text-sm text-[var(--text-secondary)]">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)] animate-ping" />
                <span>正在解析指令并获取权威基因组序列，请稍候...</span>
              </div>
            ) : (
              <ol className="relative space-y-2.5 border-l-2 border-[var(--border-hairline)] ml-2 pl-5">
                {steps.map((step, idx) => (
                  <li key={`${step.step_index}-${idx}`} className="relative">
                    <span className="absolute -left-[29px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg-surface)] ring-2 ring-[var(--bg-surface)]">
                      {renderStatusIcon(step.status)}
                    </span>
                    <div
                      className={`rounded-lg border px-4 py-3 transition ${
                        step.status === "repaired"
                          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
                          : step.status === "error"
                            ? "border-rose-300 bg-rose-50/70 dark:border-rose-500/40 dark:bg-rose-500/12"
                            : step.status === "warning"
                              ? "border-amber-300/80 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10"
                              : "border-[var(--border-hairline)] bg-[var(--bg-subtle)]/50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-bio text-xs font-bold text-[var(--text-muted)]">
                            #{step.step_index}
                          </span>
                          <span className="text-sm font-bold text-[var(--text-primary)]">
                            {step.stage}
                          </span>
                          <code className="rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-0.5 font-mono-bio text-xs text-blue-700 dark:text-sky-300">
                            {step.tool_name}
                          </code>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(
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
                    <span className="absolute -left-[29px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg-surface)] ring-2 ring-[var(--bg-surface)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-primary)]" />
                    </span>
                    <div className="rounded-lg border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2.5 text-sm text-blue-700 dark:text-sky-300 animate-pulse-soft">
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
