"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Fingerprint,
  Globe,
  Info,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import { ScientificMarkdown } from "@/components/ScientificMarkdown";
import { CATEGORY_LABELS } from "@/lib/constants";
import type {
  LocusInfo,
  SgRNACandidate,
  VerificationCheck,
  ZeroTrustVerificationReport,
} from "@/types/crispr";

interface VerificationGateProps {
  report: ZeroTrustVerificationReport;
  locus: LocusInfo;
  selectedSgRNA: SgRNACandidate;
  agentSummary: string;
  repairIterations: number;
  isReverifying?: boolean;
}

const SOURCE_LABELS: Record<LocusInfo["source"], string> = {
  ncbi_live: "NCBI RefSeq 实时抓取",
  preset_verified: "RefSeq 本地权威缓存",
  user_upload_gb: "用户上传 GenBank (.gb)",
  user_upload_fasta: "用户上传 FASTA 序列",
};

export function VerificationGate({
  report,
  locus,
  selectedSgRNA,
  agentSummary,
  repairIterations,
  isReverifying = false,
}: VerificationGateProps) {
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  const handleCopySha = () => {
    navigator.clipboard?.writeText(locus.sequence_sha256);
    setCopiedHash(true);
    window.setTimeout(() => setCopiedHash(false), 1800);
  };

  // Dignified Instrument Certificate Header (Mint PASS / Amber WARN / Vivid Coral FAIL)
  const bannerConfig =
    report.overall_status === "CERTIFIED_PASS"
      ? {
          stripe: "border-l-[5px] border-l-[#4ecdc4] dark:border-l-[4px] dark:border-l-emerald-500",
          surface: "bg-[var(--bg-surface)]",
          iconBox:
            "neu-recessed rounded-2xl text-[#1c7c75] dark:rounded-xl dark:border dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
          titleColor: "text-[var(--text-primary)]",
          title: `${report.passed_count}/${report.total_checks} 硅片验证全部通过 · 零幻觉认证`,
          subtitle:
            "序列溯源、邻近基因 RBS 保护、全流程硅片 PCR / Golden Gate 仿真组装及防二次切割均已严苛通过。",
          Icon: ShieldCheck,
        }
      : report.overall_status === "PASS_WITH_WARNINGS"
        ? {
            stripe: "border-l-[5px] border-l-amber-500 dark:border-l-[4px]",
            surface: "bg-[var(--bg-surface)]",
            iconBox:
              "neu-recessed rounded-2xl text-amber-700 dark:rounded-xl dark:border dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-400",
            titleColor: "text-[var(--text-primary)]",
            title: `${report.passed_count}/${report.total_checks} 通过 · ${report.warn_count} 项实验室注意事项`,
            subtitle:
              "无致命设计缺陷，但存在需人工知情的实验提示（点击下方黄色条目查看详细规避建议）。",
            Icon: AlertTriangle,
          }
        : {
            stripe: "border-l-[5px] border-l-[#ff6b6b] dark:border-l-[4px] dark:border-l-rose-500",
            surface: "bg-[var(--bg-surface)] dark:bg-rose-500/10",
            iconBox:
              "neu-badge-coral rounded-2xl dark:rounded-xl",
            titleColor: "text-[#c93232] dark:text-rose-200",
            title: `零信任门禁拦截 · ${report.fail_count} 项高危设计缺陷被阻断`,
            subtitle:
              "检测到会导致湿实验失败的严重问题，建议在下方切换备选 sgRNA 或调整同源臂参数后重验。",
            Icon: ShieldAlert,
          };

  const StatusIcon = bannerConfig.Icon;

  const renderCheckPill = (status: VerificationCheck["status"]) => {
    if (status === "PASS") {
      return (
        <span className="neu-recessed inline-flex items-center gap-1.5 rounded-full dark:rounded-md px-2.5 py-0.5 font-mono-bio text-xs font-medium text-[#1c7c75] dark:text-[var(--text-secondary)]">
          <span className="h-2 w-2 rounded-full bg-[#4ecdc4] dark:bg-emerald-500" />
          PASS
        </span>
      );
    }
    if (status === "WARN") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full dark:rounded-md bg-amber-500/15 px-2.5 py-0.5 font-mono-bio text-xs font-semibold text-amber-800 dark:border dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          WARN
        </span>
      );
    }
    // Preserve vivid Coral (Light) / Rose (Dark) FAIL pill
    return (
      <span className="neu-badge-coral inline-flex items-center gap-1 rounded-full dark:rounded-md px-2.5 py-0.5 font-mono-bio text-xs font-semibold">
        <XCircle className="h-3 w-3" />
        FAIL
      </span>
    );
  };

  return (
    <section id="section-verification" className="space-y-4 scroll-mt-20">
      <div
        data-tour="verification-gate"
        className={`bio-card overflow-hidden transition ${
          isReverifying ? "opacity-75 ring-2 ring-[var(--accent-primary)]" : ""
        }`}
      >
        {/* Top Instrument Certificate Banner */}
        <div
          className={`neu-divider-b p-6 sm:p-8 dark:p-6 ${bannerConfig.stripe} ${bannerConfig.surface}`}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 dark:h-11 dark:w-11 shrink-0 items-center justify-center ${bannerConfig.iconBox}`}
              >
                <StatusIcon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2
                    className={`font-display text-xl ${bannerConfig.titleColor}`}
                  >
                    {bannerConfig.title}
                  </h2>
                  {isReverifying && (
                    <span className="neu-recessed rounded-full dark:rounded-md px-2.5 py-0.5 text-xs font-medium text-accent animate-pulse">
                      正在即时重验...
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {bannerConfig.subtitle}
                </p>
              </div>
            </div>

            {/* Crisp Provenance Chips */}
            <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
              <button
                type="button"
                onClick={handleCopySha}
                className="btn-outline inline-flex items-center gap-1.5 px-3 py-1.5 font-mono-bio text-xs font-medium cursor-pointer"
                title={`点击复制完整野生型序列 SHA-256: ${locus.sequence_sha256}`}
              >
                <Fingerprint className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                <span>SHA-256: {locus.sequence_sha256.slice(0, 10)}</span>
                {copiedHash ? (
                  <Check className="h-3.5 w-3.5 text-[#1c7c75] dark:text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                )}
              </button>

              <span className="neu-recessed inline-flex items-center gap-1.5 rounded-full dark:rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <Database className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                {SOURCE_LABELS[locus.source]}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full dark:rounded-lg px-3 py-1.5 text-xs font-medium ${
                  selectedSgRNA.off_target_scope === "whole_genome"
                    ? "neu-recessed text-accent dark:border-[var(--accent-border)] dark:bg-[var(--accent-soft)]"
                    : "neu-recessed text-[var(--text-secondary)]"
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                {selectedSgRNA.off_target_scope === "whole_genome"
                  ? "全基因组完整染色体脱靶扫描"
                  : "局部基因座窗口脱靶扫描"}
              </span>

              {repairIterations > 0 && (
                <span className="neu-recessed inline-flex items-center gap-1.5 rounded-full dark:rounded-lg px-3 py-1.5 text-xs font-medium text-accent">
                  <Wrench className="h-3.5 w-3.5" />
                  自愈修复 {repairIterations} 轮
                </span>
              )}
            </div>
          </div>

          {locus.safety_adjustment_note && (
            <div className="neu-recessed mt-4 flex items-start gap-2.5 rounded-2xl dark:rounded-lg border-l-[4px] border-l-amber-500 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <span className="font-semibold">邻近操纵子 / RBS 自动保护已生效：</span>
                <span>{locus.safety_adjustment_note}</span>
              </div>
            </div>
          )}
        </div>

        {/* Clean Neutral Expert Summary Panel */}
        {agentSummary && (
          <div className="neu-divider-b px-6 py-6 sm:px-8 dark:bg-[var(--bg-subtle)]/45 dark:px-6 dark:py-5">
            <div className="flex items-start gap-3.5">
              <div className="neu-recessed mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl dark:h-8 dark:w-8 dark:rounded-lg text-[var(--accent-primary)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    科学专家设计解读与防坑摘要
                  </span>
                  <span className="neu-recessed rounded-full dark:rounded px-2.5 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                    基于 12 项确定性结果生成
                  </span>
                </div>
                <ScientificMarkdown content={agentSummary} />
              </div>
            </div>
          </div>
        )}

        {/* 12-Point Interactive Verification Grid (Light low-radius 4px tiles, airy 16px gap) */}
        <div className="p-6 sm:p-8 dark:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              12 点零信任硅片核验明细（点击任意卡片查看“防范了什么湿实验坑”）
            </h3>
            <div className="flex items-center gap-4 font-mono-bio text-xs font-semibold">
              <span className="text-[#1c7c75] dark:text-emerald-400">
                PASS {report.passed_count}
              </span>
              <span className="text-amber-700 dark:text-amber-400">
                WARN {report.warn_count}
              </span>
              <span className="text-[#c93232] dark:text-rose-400">
                FAIL {report.fail_count}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {report.checks.map((chk) => {
              const isOpen = expandedCheckId === chk.check_id;
              const statusTileClass =
                chk.status === "FAIL"
                  ? "neu-alert-coral"
                  : chk.status === "WARN"
                    ? "neu-soft-tile neu-soft-tile-hover border-l-[4px] border-l-amber-500 dark:border-amber-500/40 dark:bg-amber-500/10"
                    : "neu-soft-tile neu-soft-tile-hover";

              return (
                <div
                  key={chk.check_id}
                  onClick={() =>
                    setExpandedCheckId(isOpen ? null : chk.check_id)
                  }
                  className={`group p-4 transition cursor-pointer ${statusTileClass}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono-bio text-xs font-semibold text-[var(--text-muted)] break-all">
                          {chk.check_id}
                        </span>
                        <span className="neu-recessed whitespace-nowrap rounded-full dark:rounded px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                          {CATEGORY_LABELS[chk.category] || chk.category}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
                        {chk.name}
                      </h4>
                    </div>
                    <div className="shrink-0">{renderCheckPill(chk.status)}</div>
                  </div>

                  <p className="mt-2.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {chk.summary}
                  </p>

                  <div className="mt-3 flex items-center justify-between text-xs font-medium text-accent">
                    <span className="inline-flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5" />
                      {isOpen ? "收起原理解读" : "防范什么实验坑？"}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4 opacity-70 group-hover:opacity-100" />
                    )}
                  </div>

                  {isOpen && (
                    <div
                      className="neu-divider-t mt-3 space-y-2.5 pt-3 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {chk.plain_explanation && (
                        <p className="neu-recessed leading-relaxed text-[var(--text-secondary)] rounded-2xl dark:rounded-lg p-3">
                          <span className="font-semibold text-[var(--text-primary)]">
                            实验室防坑意义：
                          </span>
                          {chk.plain_explanation}
                        </p>
                      )}

                      {chk.repair_hint && (
                        <p className="neu-alert-coral leading-relaxed text-[#c93232] dark:text-rose-200 p-3">
                          <span className="font-semibold">修复建议：</span>
                          {chk.repair_hint}
                        </p>
                      )}

                      {chk.details && Object.keys(chk.details).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {Object.entries(chk.details)
                            .slice(0, 6)
                            .map(([k, v]) => (
                              <span
                                key={k}
                                className="neu-recessed inline-flex items-center gap-1 rounded-full dark:rounded px-2.5 py-0.5 font-mono-bio text-xs text-[var(--text-secondary)]"
                              >
                                <span className="text-[var(--text-muted)]">
                                  {k}:
                                </span>
                                <span className="truncate max-w-[180px]">
                                  {typeof v === "object"
                                    ? JSON.stringify(v)
                                    : String(v)}
                                </span>
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
