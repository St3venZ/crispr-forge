"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Beaker,
  CalendarDays,
  CheckCircle2,
  Droplets,
  Flame,
  FlaskConical,
  Loader2,
  RefreshCw,
  TestTube,
} from "lucide-react";
import { PolymeraseCombobox } from "@/components/PolymeraseCombobox";
import { COLONY_PCR_KEY_LABELS } from "@/lib/constants";
import type {
  CustomPlasmidConfig,
  CustomPolymeraseConfig,
  DonorDesign,
  PipettingCalcRequest,
  PlasmidSystemId,
  PolymeraseCatalogItem,
  PolymeraseName,
  VerificationPrimersDesign,
  WetLabProtocol,
} from "@/types/crispr";

interface WetLabWorkbenchProps {
  protocol: WetLabProtocol;
  plasmidSystem: PlasmidSystemId;
  customPlasmid?: CustomPlasmidConfig | null;
  polymerases: PolymeraseCatalogItem[];
  customPolymerases: CustomPolymeraseConfig[];
  selectedPolymerase: PolymeraseName;
  selectedCustomPolymerase: CustomPolymeraseConfig | null;
  donor: DonorDesign;
  verificationPrimers: VerificationPrimersDesign;
  isRecalculating: boolean;
  onChangePolymerase: (
    name: PolymeraseName,
    customCfg: CustomPolymeraseConfig | null
  ) => void;
  onSaveCustomPolymerase: (cfg: CustomPolymeraseConfig) => void;
  onDeleteCustomPolymerase: (name: string) => void;
  onRecalculate: (req: PipettingCalcRequest) => void;
}

export function WetLabWorkbench({
  protocol,
  plasmidSystem,
  customPlasmid,
  polymerases,
  customPolymerases,
  selectedPolymerase,
  selectedCustomPolymerase,
  donor,
  verificationPrimers,
  isRecalculating,
  onChangePolymerase,
  onSaveCustomPolymerase,
  onDeleteCustomPolymerase,
  onRecalculate,
}: WetLabWorkbenchProps) {
  const [laConc, setLaConc] = useState<number>(65);
  const [raConc, setRaConc] = useState<number>(58);
  const [donorConc, setDonorConc] = useState<number>(120);
  const [vectorConc, setVectorConc] = useState<number>(45);
  const [sgrnaPlasmidConc, setSgrnaPlasmidConc] = useState<number>(150);

  const [ratioMode, setRatioMode] = useState<"molar_ratio" | "volume_ratio">(
    "molar_ratio"
  );
  const [targetPmol, setTargetPmol] = useState<number>(0.05);
  const [volLaUl, setVolLaUl] = useState<number>(1.0);
  const [volRaUl, setVolRaUl] = useState<number>(1.0);

  const buildCalcRequest = (
    overrides?: Partial<PipettingCalcRequest>
  ): PipettingCalcRequest => {
    const laPrimer = donor.primers.find((p) => p.role === "donor_left_arm");
    const raPrimer = donor.primers.find((p) => p.role === "donor_right_arm");
    const safePos = (n: number, fallback: number) =>
      Number.isFinite(n) && n > 0.1 ? Math.min(5000, n) : fallback;

    return {
      plasmid_system: plasmidSystem,
      custom_plasmid: customPlasmid ?? null,
      la_len_bp: donor.la_amplicon_bp || donor.left_arm_len,
      ra_len_bp: donor.ra_amplicon_bp || donor.right_arm_len,
      donor_len_bp: donor.full_donor_len,
      wt_amplicon_bp: verificationPrimers.wt_amplicon_bp,
      ko_amplicon_bp: verificationPrimers.ko_amplicon_bp,
      la_conc_ng_ul: safePos(laConc, 65),
      ra_conc_ng_ul: safePos(raConc, 58),
      donor_conc_ng_ul: safePos(donorConc, 120),
      vector_backbone_conc_ng_ul: safePos(vectorConc, 45),
      sgrna_plasmid_conc_ng_ul: safePos(sgrnaPlasmidConc, 150),
      oe_pcr_ratio_mode: ratioMode,
      oe_pcr_target_pmol_each: Math.max(0.01, Math.min(1.0, targetPmol || 0.05)),
      volume_ratio_la_ul: Math.max(0.5, Math.min(10.0, volLaUl || 1.0)),
      volume_ratio_ra_ul: Math.max(0.5, Math.min(10.0, volRaUl || 1.0)),
      electroporation_donor_ng: 400,
      electroporation_plasmid_ng: 100,
      polymerase: selectedPolymerase,
      custom_polymerase: selectedCustomPolymerase,
      la_anneal_tm: laPrimer?.tm_binding_c ?? 60.0,
      ra_anneal_tm: raPrimer?.tm_binding_c ?? 60.0,
      overlap_tm: donor.overlap_tm_c || 60.0,
      verify_anneal_tm: verificationPrimers.outer_forward.tm_binding_c || 59.0,
      ...overrides,
    };
  };

  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      onRecalculate(buildCalcRequest());
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    laConc,
    raConc,
    donorConc,
    vectorConc,
    sgrnaPlasmidConc,
    ratioMode,
    targetPmol,
    volLaUl,
    volRaUl,
    selectedPolymerase,
    selectedCustomPolymerase,
  ]);

  const totalAlerts = protocol.reactions.reduce(
    (sum, rxn) =>
      sum +
      rxn.components.filter(
        (c) =>
          Boolean(c.dilution_alert) || (c.volume_ul > 0 && c.volume_ul < 0.5)
      ).length,
    0
  );

  return (
    <div className="space-y-8">
      {/* SECTION 06: Interactive NanoDrop Bench Calculator & 5 Reaction Cards */}
      <section
        id="section-wetlab"
        data-tour="wetlab-section"
        className="scroll-mt-20"
      >
        <div className="bio-card overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Beaker className="h-5 w-5 text-[var(--accent-primary)]" />
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  实时 NanoDrop 实验台移液计算器 (Bench Pipetting Calculator)
                </h3>
                {/* PRESERVED Vivid Rose Alert Badge */}
                {totalAlerts > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-rose-400 bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white dark:border-rose-500 dark:bg-rose-500">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {totalAlerts} 项 &lt; 0.5 μL 预稀释警报
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                填入胶回收或质粒提取后的 NanoDrop 实测浓度，自动精确换算摩尔比与移液量（&lt; 0.5 μL 自动弹出预稀释警报）
              </p>
            </div>

            <button
              type="button"
              disabled={isRecalculating}
              onClick={() => onRecalculate(buildCalcRequest())}
              className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer"
            >
              {isRecalculating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在重算...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  立即重新计算
                </>
              )}
            </button>
          </div>

          {/* NanoDrop Inputs + Mode Switcher + 15-Polymerase Combobox */}
          <div className="space-y-4 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {[
                {
                  label: "LA 片段浓度",
                  sub: `${donor.la_amplicon_bp} bp`,
                  value: laConc,
                  setter: setLaConc,
                },
                {
                  label: "RA 片段浓度",
                  sub: `${donor.ra_amplicon_bp} bp`,
                  value: raConc,
                  setter: setRaConc,
                },
                {
                  label: "Donor 浓度",
                  sub: `${donor.full_donor_len} bp`,
                  value: donorConc,
                  setter: setDonorConc,
                },
                {
                  label: "线性化载体浓度",
                  sub: "Backbone",
                  value: vectorConc,
                  setter: setVectorConc,
                },
                {
                  label: "sgRNA 质粒浓度",
                  sub: "电转用质粒",
                  value: sgrnaPlasmidConc,
                  setter: setSgrnaPlasmidConc,
                },
              ].map((field) => (
                <div
                  key={field.label}
                  className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-xs font-bold text-[var(--text-primary)]">
                      {field.label}
                    </label>
                    <span className="font-mono-bio text-xs text-[var(--text-muted)]">
                      {field.sub}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      step={5}
                      value={field.value}
                      onChange={(e) => field.setter(Number(e.target.value))}
                      className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/60 px-2.5 py-1.5 font-mono-bio text-sm font-bold text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                    />
                    <span className="shrink-0 font-mono-bio text-xs font-medium text-[var(--text-muted)]">
                      ng/μL
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 pt-1 xl:grid-cols-12 xl:items-center">
              <div className="flex flex-wrap items-center gap-3 xl:col-span-7">
                <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setRatioMode("molar_ratio")}
                    className={`rounded-md px-3.5 py-1.5 transition cursor-pointer ${
                      ratioMode === "molar_ratio"
                        ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    等摩尔比模式 (推荐 1:1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRatioMode("volume_ratio")}
                    className={`rounded-md px-3.5 py-1.5 transition cursor-pointer ${
                      ratioMode === "volume_ratio"
                        ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    经验体积比模式 (μL)
                  </button>
                </div>

                {ratioMode === "molar_ratio" ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <span>每臂投料：</span>
                    <input
                      type="number"
                      min={0.01}
                      max={0.5}
                      step={0.01}
                      value={targetPmol}
                      onChange={(e) => setTargetPmol(Number(e.target.value))}
                      className="w-24 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono-bio text-sm font-bold text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                    />
                    <span className="font-mono-bio text-xs text-[var(--text-muted)]">
                      pmol
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <span>LA</span>
                    <input
                      type="number"
                      min={0.5}
                      max={10}
                      step={0.5}
                      value={volLaUl}
                      onChange={(e) => setVolLaUl(Number(e.target.value))}
                      className="w-20 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono-bio text-sm font-bold text-[var(--text-primary)]"
                    />
                    <span>μL + RA</span>
                    <input
                      type="number"
                      min={0.5}
                      max={10}
                      step={0.5}
                      value={volRaUl}
                      onChange={(e) => setVolRaUl(Number(e.target.value))}
                      className="w-20 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono-bio text-sm font-bold text-[var(--text-primary)]"
                    />
                    <span>μL</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5 xl:col-span-5">
                <span className="shrink-0 text-xs font-bold text-[var(--text-secondary)]">
                  聚合酶体系：
                </span>
                <div className="flex-1 min-w-[240px]">
                  <PolymeraseCombobox
                    polymerases={polymerases}
                    customPolymerases={customPolymerases}
                    value={selectedPolymerase}
                    customValue={selectedCustomPolymerase}
                    onChange={onChangePolymerase}
                    onSaveCustom={onSaveCustomPolymerase}
                    onDeleteCustom={onDeleteCustomPolymerase}
                    compact
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 5 Reaction Mix Cards */}
          <div
            className={`grid grid-cols-1 gap-5 p-5 xl:grid-cols-2 transition-opacity ${
              isRecalculating ? "opacity-65" : "opacity-100"
            }`}
          >
            {protocol.reactions.map((rxn, rIdx) => {
              const alerts = rxn.components.filter(
                (c) =>
                  Boolean(c.dilution_alert) ||
                  (c.volume_ul > 0 && c.volume_ul < 0.5)
              );

              return (
                <div
                  key={`${rxn.title}-${rIdx}`}
                  className={`flex flex-col justify-between rounded-xl border bg-[var(--bg-surface)] overflow-hidden ${
                    alerts.length > 0
                      ? "border-rose-400/90 ring-1 ring-rose-500/20 dark:border-rose-500/55"
                      : "border-[var(--border-hairline)]"
                  }`}
                >
                  <div>
                    {/* Reaction Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)]/65 px-4 py-3.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] font-mono-bio text-xs font-bold text-[var(--primary-fg)]">
                            {rIdx + 1}
                          </span>
                          <h4 className="text-sm font-bold text-[var(--text-primary)]">
                            {rxn.title}
                          </h4>
                        </div>
                        {rxn.subtitle && (
                          <p className="text-xs text-[var(--text-muted)] pl-8 leading-relaxed">
                            {rxn.subtitle}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 font-mono-bio text-xs font-bold text-blue-700 dark:text-sky-300">
                        总体系 {rxn.total_volume_ul.toFixed(1)} μL
                      </span>
                    </div>

                    {/* PRESERVED Vivid Rose/Crimson < 0.5 uL Pre-Dilution Alert Callout */}
                    {alerts.length > 0 && (
                      <div className="border-b border-rose-300 border-l-[4px] border-l-rose-600 bg-rose-50 px-4 py-3 space-y-1.5 dark:border-rose-500/40 dark:border-l-rose-500 dark:bg-rose-500/15">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 dark:text-rose-200">
                          <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          <span>
                            微量移液误差警报 (&lt; 0.5 μL) · 请务必先做预稀释！
                          </span>
                        </div>
                        {alerts.map((a, aIdx) => (
                          <p
                            key={aIdx}
                            className="text-xs leading-relaxed text-rose-700 dark:text-rose-200/95 pl-5"
                          >
                            <strong className="font-mono-bio">{a.reagent}</strong>{" "}
                            ({a.volume_ul.toFixed(2)} μL)：
                            {a.dilution_alert ||
                              `建议先用 ddH₂O 10 倍稀释后吸取 ${(a.volume_ul * 10).toFixed(1)} μL，避免移液枪挂壁误差。`}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Reagent Pipetting Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border-hairline)] text-xs font-bold text-[var(--text-muted)]">
                            <th className="py-2.5 pl-4 pr-2">试剂组分</th>
                            <th className="py-2.5 px-2">母液浓度</th>
                            <th className="py-2.5 px-2 text-right">
                              移液量 (μL)
                            </th>
                            <th className="py-2.5 pl-2 pr-4 text-right">
                              终量 / 终浓度
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-hairline)]/70">
                          {rxn.components.map((comp, cIdx) => {
                            const isLowVol =
                              Boolean(comp.dilution_alert) ||
                              (comp.volume_ul > 0 && comp.volume_ul < 0.5);
                            return (
                              <tr
                                key={cIdx}
                                className={
                                  isLowVol
                                    ? "bg-rose-50/70 dark:bg-rose-500/12"
                                    : "hover:bg-[var(--bg-subtle)]/40"
                                }
                              >
                                <td className="py-2.5 pl-4 pr-2 font-medium text-[var(--text-primary)]">
                                  <span className="inline-flex items-center gap-1.5">
                                    {isLowVol && (
                                      <Droplets className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                                    )}
                                    {comp.reagent}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 font-mono-bio text-xs text-[var(--text-muted)]">
                                  {comp.stock_conc}
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono-bio font-bold whitespace-nowrap">
                                  <span
                                    className={
                                      isLowVol
                                        ? "rounded bg-rose-600 px-2 py-0.5 text-white dark:bg-rose-500"
                                        : "text-blue-700 dark:text-sky-300"
                                    }
                                  >
                                    {comp.volume_ul.toFixed(2)} μL
                                  </span>
                                </td>
                                <td className="py-2.5 pl-2 pr-4 text-right font-mono-bio text-xs text-[var(--text-secondary)]">
                                  {comp.final_amount}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Thermocycler Program + Bench Notes */}
                  {(rxn.thermocycler_program.length > 0 ||
                    rxn.notes.length > 0) && (
                    <div className="border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 px-4 py-3.5 space-y-2.5">
                      {rxn.thermocycler_program.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
                            <Flame className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            PCR 扩增 / 温控程序
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {rxn.thermocycler_program.map((step, sIdx) => (
                              <span
                                key={sIdx}
                                className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 font-mono-bio text-xs text-[var(--text-secondary)]"
                              >
                                {step}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {rxn.notes.length > 0 && (
                        <ul className="space-y-1 text-xs leading-relaxed text-[var(--text-secondary)] list-disc pl-4">
                          {rxn.notes.map((n, nIdx) => {
                            const isWarningNote =
                              n.includes("⚠️") || n.includes("预警");
                            return (
                              <li
                                key={nIdx}
                                className={
                                  isWarningNote
                                    ? "font-semibold text-rose-700 dark:text-rose-300"
                                    : ""
                                }
                              >
                                {n}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 07: 4-Day Wet-Lab Timeline + Colony PCR Band Interpretation Guide */}
      <section
        id="section-timeline"
        className="grid grid-cols-1 gap-6 xl:grid-cols-12 scroll-mt-20"
      >
        {/* 4-Day Timeline */}
        <div className="bio-card overflow-hidden rounded-xl xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-5 py-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[var(--accent-primary)]" />
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                4 天标准湿实验执行路线图 ({protocol.plasmid_system})
              </h3>
            </div>
            <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
              含每日质量控制检查点 (Checkpoint)
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            {protocol.timeline.map((item, idx) => (
              <div
                key={`${item.day}-${idx}`}
                className="flex flex-col justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/45 p-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-md bg-[var(--primary)] px-2.5 py-0.5 font-mono-bio text-xs font-bold text-[var(--primary-fg)]">
                      {item.day}
                    </span>
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">
                      {item.title}
                    </h4>
                  </div>
                  <ol className="space-y-2 text-sm text-[var(--text-secondary)] list-decimal pl-5">
                    {item.steps.map((s, sIdx) => (
                      <li key={sIdx} className="leading-relaxed">
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--border-hairline)] border-l-[3px] border-l-emerald-500 bg-[var(--bg-surface)] px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="leading-relaxed">
                    <strong className="font-bold text-[var(--text-primary)]">
                      质控节点：
                    </strong>
                    {item.checkpoint}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Colony PCR Interpretation Guide */}
        <div className="bio-card flex flex-col overflow-hidden rounded-xl xl:col-span-4">
          <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-5 py-4">
            <TestTube className="h-5 w-5 text-[var(--accent-primary)]" />
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              菌落 PCR 条带判读速查表
            </h3>
          </div>

          <div className="flex-1 space-y-3 p-5">
            {Object.entries(protocol.colony_pcr_interpretation).map(
              ([key, desc]) => {
                const displayTitle = COLONY_PCR_KEY_LABELS[key] || key;
                const isPositive =
                  key === "knockout_positive_band" ||
                  displayTitle.includes("阳性") ||
                  displayTitle.toUpperCase().includes("KO");
                const isMixed =
                  key === "wt_internal_control" ||
                  displayTitle.includes("混杂");
                return (
                  <div
                    key={key}
                    className={`rounded-lg border p-3.5 text-sm ${
                      isPositive
                        ? "border-[var(--accent-border)] border-l-[3px] border-l-[var(--accent-primary)] bg-[var(--accent-soft)]"
                        : isMixed
                          ? "border-amber-300/80 border-l-[3px] border-l-amber-500 bg-amber-50/40 dark:border-amber-500/35 dark:bg-amber-500/10"
                          : "border-[var(--border-hairline)] bg-[var(--bg-subtle)]/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                      <FlaskConical
                        className={`h-4 w-4 shrink-0 ${
                          isPositive
                            ? "text-[var(--accent-primary)]"
                            : isMixed
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-[var(--text-muted)]"
                        }`}
                      />
                      <span>{displayTitle}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                      {desc}
                    </p>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
