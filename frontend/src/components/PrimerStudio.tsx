"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Copy,
  Dna,
  Loader2,
  RefreshCw,
  Scissors,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { PRIMER_ROLE_META } from "@/lib/constants";
import type { PrimerRole, PrimerSpec, SgRNACandidate } from "@/types/crispr";

interface PrimerStudioProps {
  selectedSgRNA: SgRNACandidate;
  alternativeSgRNAs: SgRNACandidate[];
  allPrimers: PrimerSpec[];
  isReverifying: boolean;
  reverifyingId: string | null;
  onSelectSgRNA: (candidate: SgRNACandidate) => void;
}

function renderColoredSequence(primer: PrimerSpec) {
  const full = primer.sequence || "";
  const overhang = primer.overhang_region || "";
  const binding = primer.binding_region || "";

  if (overhang && full.startsWith(overhang)) {
    const rest = full.slice(overhang.length);
    return (
      <span className="font-mono-bio text-sm tracking-tight break-all">
        <span
          className="rounded-xs bg-[var(--accent-soft)] px-0.5 font-bold text-blue-700 border-b-2 border-blue-500 dark:text-sky-300 dark:border-sky-400"
          title="5' 保护碱基 / 粘性末端 / 同源重叠臂 (Overhang)"
        >
          {overhang}
        </span>
        <span
          className="text-[var(--text-primary)]"
          title="3' 模板特异性结合区 (Binding)"
        >
          {rest}
        </span>
      </span>
    );
  }

  if (binding && full.endsWith(binding) && full.length > binding.length) {
    const prefix = full.slice(0, full.length - binding.length);
    return (
      <span className="font-mono-bio text-sm tracking-tight break-all">
        <span
          className="rounded-xs bg-[var(--accent-soft)] px-0.5 font-bold text-blue-700 border-b-2 border-blue-500 dark:text-sky-300 dark:border-sky-400"
          title="5' 粘性末端 / 重叠区 (Overhang)"
        >
          {prefix}
        </span>
        <span
          className="text-[var(--text-primary)]"
          title="3' 模板结合区 (Binding)"
        >
          {binding}
        </span>
      </span>
    );
  }

  return (
    <span className="font-mono-bio text-sm tracking-tight text-[var(--text-primary)] break-all">
      {full}
    </span>
  );
}

export function PrimerStudio({
  selectedSgRNA,
  alternativeSgRNAs,
  allPrimers,
  isReverifying,
  reverifyingId,
  onSelectSgRNA,
}: PrimerStudioProps) {
  const [roleFilter, setRoleFilter] = useState<PrimerRole | "all">("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const allSgRNAs = useMemo(() => {
    const map = new Map<string, SgRNACandidate>();
    map.set(selectedSgRNA.id, { ...selectedSgRNA, selected: true });
    for (const alt of alternativeSgRNAs) {
      if (!map.has(alt.id)) {
        map.set(alt.id, { ...alt, selected: false });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
  }, [selectedSgRNA, alternativeSgRNAs]);

  const presentRoles = useMemo(() => {
    const set = new Set<PrimerRole>();
    allPrimers.forEach((p) => set.add(p.role));
    return Array.from(set);
  }, [allPrimers]);

  const filteredPrimers = useMemo(() => {
    if (roleFilter === "all") return allPrimers;
    return allPrimers.filter((p) => p.role === roleFilter);
  }, [allPrimers, roleFilter]);

  const handleCopySeq = (key: string, seq: string) => {
    navigator.clipboard?.writeText(seq);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1600);
  };

  const handleCopyAllTsv = () => {
    const header = "引物名称\t序列(5'->3')\t长度(nt)\t纯化方式\t用途";
    const rows = allPrimers.map(
      (p) =>
        `${p.name}\t${p.sequence}\t${p.length_nt}\t${p.purification_method}\t${PRIMER_ROLE_META[p.role]?.shortLabel || p.role}`
    );
    navigator.clipboard?.writeText([header, ...rows].join("\n"));
    setCopiedAll(true);
    window.setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <section id="section-primers" className="space-y-6 scroll-mt-20">
      {/* PART 1: Top-5 Interactive sgRNA Selector */}
      <div className="bio-card overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Scissors className="h-4 w-4 text-[var(--accent-primary)]" />
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Top-{allSgRNAs.length} 候选 sgRNA 靶点优选与即时重验
              </h3>
            </div>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              切换任意备选 sgRNA 将实时调用{" "}
              <code className="font-mono-bio text-blue-700 dark:text-sky-300">
                POST /api/verify
              </code>{" "}
              重新执行 12 点零信任校验并联动更新图谱与克隆引物
            </p>
          </div>
          <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1 font-mono-bio text-xs font-semibold text-[var(--text-secondary)]">
            克隆方式：
            {selectedSgRNA.cloning_method === "golden_gate_oligo"
              ? "Golden Gate 退火 Oligo"
              : "全质粒反向 PCR"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {allSgRNAs.map((cand) => {
            const isSelected = cand.id === selectedSgRNA.id;
            const isBusy = isReverifying && reverifyingId === cand.id;
            const scorePct = Math.max(0, Math.min(100, cand.on_target_score));
            const cleanOffTarget =
              cand.off_target_hits_seed === 0 &&
              cand.off_target_hits_1_2mm === 0;

            return (
              <div
                key={cand.id}
                className={`relative flex flex-col justify-between rounded-lg border p-4 transition ${
                  isSelected
                    ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                    : "border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="space-y-3">
                  {/* Top row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-md font-mono-bio text-xs font-bold ${
                          isSelected
                            ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                            : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                        }`}
                      >
                        #{cand.rank}
                      </span>
                      <span className="font-mono-bio text-sm font-bold text-[var(--text-primary)]">
                        {cand.id}
                      </span>
                      <span className="rounded bg-[var(--bg-subtle)] px-2 py-0.5 font-mono-bio text-xs font-semibold text-[var(--text-secondary)]">
                        {cand.strand} 链
                      </span>
                    </div>

                    {isSelected && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--accent-border)] bg-[var(--bg-surface)] px-2 py-0.5 text-xs font-bold text-blue-700 dark:text-sky-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        当前采用
                      </span>
                    )}
                  </div>

                  {/* Spacer 20nt + PAM */}
                  <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-bio text-sm font-bold tracking-wide text-[var(--text-primary)] break-all">
                        {cand.spacer_20nt}
                      </span>
                      <span className="shrink-0 rounded bg-rose-50 px-2 py-0.5 font-mono-bio text-xs font-bold text-rose-700 border border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/40">
                        {cand.pam}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--text-muted)] font-mono-bio">
                      <span>切点 {cand.cut_site_genome.toLocaleString()} bp</span>
                      <span>
                        ORF {cand.distance_from_orf_start_pct.toFixed(1)}% 处
                      </span>
                    </div>
                  </div>

                  {/* On-target Score Bar + GC */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--text-secondary)]">
                        On-Target 活性评分
                      </span>
                      <div className="flex items-center gap-2 font-mono-bio">
                        <span className="font-bold text-blue-700 dark:text-sky-300">
                          {cand.on_target_score.toFixed(1)}
                        </span>
                        <span className="text-[var(--border-strong)]">|</span>
                        <span className="text-[var(--text-secondary)]">
                          GC {cand.gc_percent.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          scorePct >= 70
                            ? "bg-blue-600 dark:bg-sky-400"
                            : scorePct >= 50
                              ? "bg-amber-500"
                              : "bg-rose-600"
                        }`}
                        style={{ width: `${scorePct}%` }}
                      />
                    </div>
                  </div>

                  {/* Safety Chips */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold ${
                        cleanOffTarget
                          ? "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                          : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                      }`}
                      title={cand.off_target_summary}
                    >
                      {cleanOffTarget ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      )}
                      {cleanOffTarget
                        ? cand.off_target_scope === "whole_genome"
                          ? "全基因组 0 脱靶"
                          : "窗口内 0 脱靶"
                        : `Seed:${cand.off_target_hits_seed} / 1-2mm:${cand.off_target_hits_1_2mm}`}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${
                        cand.has_enzyme_conflict
                          ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
                          : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                      }`}
                      title={cand.enzyme_conflict_detail || "无克隆限制酶切冲突"}
                    >
                      {cand.has_enzyme_conflict ? (
                        <>
                          <XCircle className="h-3.5 w-3.5" />
                          酶切冲突
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          无酶切冲突
                        </>
                      )}
                    </span>

                    {cand.has_poly_t && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">
                        含 TTTT 风险
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-4 pt-3 border-t border-[var(--border-hairline)]">
                  {isSelected ? (
                    <div className="flex items-center justify-between text-xs text-blue-700 dark:text-sky-300">
                      <span className="font-semibold">
                        已同步至图谱、电泳与引物表
                      </span>
                      <span className="font-mono-bio text-[var(--text-muted)]">
                        ΔG {cand.self_complementarity_dg.toFixed(1)}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isReverifying}
                      onClick={() => onSelectSgRNA(cand)}
                      className="btn-outline flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 dark:text-sky-300 cursor-pointer"
                    >
                      {isBusy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          重验中...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          切换并即时重验
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PART 2: Comprehensive Primer & Oligo Table */}
      <div className="bio-card overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Dna className="h-4 w-4 text-[var(--accent-primary)]" />
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                全套引物与 Oligo 订购清单 ({allPrimers.length} 条)
              </h3>
            </div>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              序列中{" "}
              <span className="rounded bg-[var(--accent-soft)] px-1.5 font-mono-bio font-bold text-blue-700 border-b-2 border-blue-500 dark:text-sky-300 dark:border-sky-400">
                蓝色下划线
              </span>{" "}
              为 5&apos; 粘性末端/同源重叠区，主体为 3&apos; 模板特异性结合区；＞50 nt 自动标记 PAGE 纯化
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyAllTsv}
            className="btn-outline inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold cursor-pointer"
          >
            {copiedAll ? (
              <>
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                已复制全部引物 (可直接粘贴生工/Excel)
              </>
            ) : (
              <>
                <ClipboardCopy className="h-4 w-4 text-[var(--accent-primary)]" />
                一键复制全部订购表 (TSV)
              </>
            )}
          </button>
        </div>

        {/* Role Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)]/65 px-5 py-2.5">
          <button
            type="button"
            onClick={() => setRoleFilter("all")}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition cursor-pointer ${
              roleFilter === "all"
                ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                : "border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            全部 ({allPrimers.length})
          </button>
          {presentRoles.map((role) => {
            const meta = PRIMER_ROLE_META[role];
            const count = allPrimers.filter((p) => p.role === role).length;
            const active = roleFilter === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                  active
                    ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                    : "border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                {meta?.shortLabel || role} ({count})
              </button>
            );
          })}
        </div>

        {/* Primer Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)]/80 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="py-3.5 pl-5 pr-3">引物名称 / 用途</th>
                <th className="py-3.5 px-3">序列 (5&apos; → 3&apos;)</th>
                <th className="py-3.5 px-3 text-right">长度</th>
                <th className="py-3.5 px-3 text-right">Tm (°C)</th>
                <th className="py-3.5 px-3 text-right">GC%</th>
                <th className="py-3.5 px-3 text-right">发夹 / 二聚体 ΔG</th>
                <th className="py-3.5 pl-3 pr-5 text-center">纯化方式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)] text-sm">
              {filteredPrimers.map((p, idx) => {
                const roleMeta = PRIMER_ROLE_META[p.role];
                const copyId = `${p.name}-${idx}`;
                const isCopied = copiedKey === copyId;
                const thermoWarn = p.hairpin_dg < -6.0 || p.homodimer_dg < -8.0;

                return (
                  <tr
                    key={copyId}
                    className="transition hover:bg-[var(--bg-subtle)]/45 align-top"
                  >
                    <td className="py-4 pl-5 pr-3 whitespace-nowrap">
                      <div className="font-mono-bio font-bold text-[var(--text-primary)]">
                        {p.name}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${
                            roleMeta?.colorClass ||
                            "bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]"
                          }`}
                        >
                          {roleMeta?.shortLabel || p.role}
                        </span>
                      </div>
                      {p.template_source && (
                        <div className="mt-1 text-xs text-[var(--text-muted)] max-w-[200px] truncate">
                          模板：{p.template_source}
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-3 min-w-[320px] max-w-[460px]">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="space-y-1">
                          {renderColoredSequence(p)}
                          {p.notes && (
                            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                              {p.notes}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopySeq(copyId, p.sequence)}
                          className={`shrink-0 rounded-md border p-2 transition cursor-pointer ${
                            isCopied
                              ? "border-emerald-400 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                          }`}
                          title="复制该条引物序列"
                        >
                          {isCopied ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-4 px-3 text-right font-mono-bio font-bold text-[var(--text-primary)] whitespace-nowrap">
                      {p.length_nt} nt
                    </td>

                    <td className="py-4 px-3 text-right font-mono-bio whitespace-nowrap">
                      <div className="font-bold text-[var(--text-primary)]">
                        {p.tm_binding_c.toFixed(1)}°C
                      </div>
                      {Math.abs(p.tm_full_c - p.tm_binding_c) >= 1.0 && (
                        <div
                          className="text-xs text-[var(--text-muted)]"
                          title="包含 5' 端延伸后的全长 Tm"
                        >
                          全长 {p.tm_full_c.toFixed(1)}°C
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-3 text-right font-mono-bio text-[var(--text-secondary)] whitespace-nowrap">
                      {p.gc_percent.toFixed(1)}%
                    </td>

                    <td className="py-4 px-3 text-right font-mono-bio whitespace-nowrap">
                      <span
                        className={
                          thermoWarn
                            ? "font-bold text-amber-700 dark:text-amber-400"
                            : "text-[var(--text-secondary)]"
                        }
                      >
                        {p.hairpin_dg.toFixed(1)} / {p.homodimer_dg.toFixed(1)}
                      </span>
                      <div className="text-xs text-[var(--text-muted)]">
                        kcal/mol
                      </div>
                    </td>

                    <td className="py-4 pl-3 pr-5 text-center whitespace-nowrap">
                      <span
                        className={`inline-block rounded-md border px-2.5 py-0.5 font-mono-bio text-xs font-bold ${
                          p.purification_method === "PAGE"
                            ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                            : p.purification_method === "HPLC"
                              ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-blue-700 dark:text-sky-300"
                              : "border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                        }`}
                      >
                        {p.purification_method}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
