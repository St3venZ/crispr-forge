"use client";

import React, { useMemo, useState } from "react";
import { FlaskConical, Sparkles } from "lucide-react";
import type { GelLane, VerificationPrimersDesign } from "@/types/crispr";

interface SimulatedGelProps {
  lanes: GelLane[];
  verificationPrimers: VerificationPrimersDesign;
}

const REFERENCE_LADDER = [5000, 3000, 2000, 1500, 1000, 750, 500, 250, 100];

function bpToPercentY(bp: number, minBp: number, maxBp: number): number {
  const clamped = Math.max(minBp, Math.min(maxBp, bp));
  const logMin = Math.log10(minBp);
  const logMax = Math.log10(maxBp);
  const logVal = Math.log10(clamped);
  const ratio = (logMax - logVal) / Math.max(logMax - logMin, 0.01);
  return 7 + ratio * 85;
}

function getShortWellId(lane: GelLane, idx: number): string {
  const combined = `${lane.lane_name} ${lane.label}`.toLowerCase();
  if (
    idx === 0 &&
    (combined.includes("marker") ||
      combined.includes("ladder") ||
      combined.includes("dl5000") ||
      lane.bands_bp.length >= 6)
  ) {
    return "M";
  }
  if (combined.includes("oe") || combined.includes("donor")) return "Donor";
  if (combined.includes("ko") || lane.highlight) return "KO";
  if (combined.includes("内") || combined.includes("int")) return "Int";
  if (combined.includes("wt") || combined.includes("野生")) return "WT";
  if (combined.includes("la") || combined.includes("左")) return "LA";
  if (combined.includes("ra") || combined.includes("右")) return "RA";
  return lane.lane_name.slice(0, 5);
}

function getTwoLineLabel(lane: GelLane, wellId: string): [string, string] {
  switch (wellId) {
    case "M":
      return ["DL5000", "Marker"];
    case "LA":
      return ["左同源臂", "LA 扩增"];
    case "RA":
      return ["右同源臂", "RA 扩增"];
    case "Donor":
      return ["OE-PCR", "全长Donor"];
    case "WT":
      return ["WT 野生", "菌落PCR"];
    case "KO":
      return ["KO 阳性", "菌落PCR"];
    case "Int":
      return ["WT 内部", "排假阴性"];
    default: {
      const clean = lane.label.trim();
      if (clean.length <= 6) return [clean, ""];
      const mid = Math.ceil(clean.length / 2);
      return [clean.slice(0, mid), clean.slice(mid)];
    }
  }
}

export function SimulatedGel({
  lanes,
  verificationPrimers,
}: SimulatedGelProps) {
  const [hoveredLaneIdx, setHoveredLaneIdx] = useState<number | null>(null);
  const [pinnedLaneIdx, setPinnedLaneIdx] = useState<number | null>(null);

  const normalizedLanes = useMemo<GelLane[]>(() => {
    if (lanes && lanes.length > 0) return lanes;
    return [
      {
        lane_name: "M",
        label: "DL5000",
        bands_bp: REFERENCE_LADDER,
        expected_note: "DNA Marker DL5000 分子量标准参照",
        highlight: false,
      },
      {
        lane_name: "WT",
        label: "WT 菌落PCR",
        bands_bp: [verificationPrimers.wt_amplicon_bp],
        expected_note: `野生型对照条带 ${verificationPrimers.wt_amplicon_bp} bp`,
        highlight: false,
      },
      {
        lane_name: "KO",
        label: "KO 菌落PCR",
        bands_bp: [verificationPrimers.ko_amplicon_bp],
        expected_note: `阳性敲除克隆条带 ${verificationPrimers.ko_amplicon_bp} bp（比野生型小 ${verificationPrimers.band_diff_bp} bp）`,
        highlight: true,
      },
    ];
  }, [lanes, verificationPrimers]);

  const { minBp, maxBp } = useMemo(() => {
    const allBands = normalizedLanes.flatMap((l) => l.bands_bp);
    const highest = Math.max(5200, ...allBands);
    const lowest = Math.min(100, ...allBands);
    return {
      maxBp: Math.ceil(highest * 1.18),
      minBp: Math.max(70, Math.floor(lowest * 0.8)),
    };
  }, [normalizedLanes]);

  const activeIdx = hoveredLaneIdx ?? pinnedLaneIdx;
  const activeLane = activeIdx !== null ? normalizedLanes[activeIdx] : null;

  const isMarkerLane = (lane: GelLane, idx: number) =>
    getShortWellId(lane, idx) === "M";

  const crosshairBands =
    activeLane && activeIdx !== null && !isMarkerLane(activeLane, activeIdx)
      ? activeLane.bands_bp
      : [];

  return (
    <div className="bio-card flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="neu-divider-b flex flex-wrap items-center justify-between gap-2 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-[var(--accent-primary)]" />
            <h3 className="font-display text-base text-[var(--text-primary)]">
              UV 模拟琼脂糖凝胶电泳 (In-Silico Gel)
            </h3>
          </div>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            1.0% Agarose · 对数迁移模型 (log₁₀ bp) · WT/KO 条带差{" "}
            <span className="font-mono-bio font-semibold text-accent">
              Δ{verificationPrimers.band_diff_bp} bp
            </span>
          </p>
        </div>

        <span className="neu-recessed inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono-bio text-xs font-semibold text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          KO 阳性 {verificationPrimers.ko_amplicon_bp} bp
        </span>
      </div>

      {/* Unified Recessed Hardware Bezel wrapping 100%-preserved Dark UV Chamber (Day & Night) */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="neu-recessed-deep flex flex-1 flex-col rounded-[22px] p-2.5">
          {/* Obsidian UV Transilluminator Chamber (100% Preserved Optical Box) */}
          <div className="gel-chamber relative flex flex-1 flex-col justify-between rounded-[15px] p-4 sm:p-5 text-zinc-100">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-bio text-zinc-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
              UV 302 nm · GelRed 透射仿真
            </span>
            <span className="text-zinc-400">120 V · 25 min · 1× TAE</span>
          </div>

          <div className="relative rounded-lg border border-white/10 bg-[#07090d] px-2 pt-3 pb-3.5 shadow-inner overflow-x-auto">
            {/* Top Short Well IDs */}
            <div className="mb-2 flex items-center min-w-[295px]">
              <div className="w-11 shrink-0 pr-1.5 text-right font-mono-bio text-xs font-semibold text-zinc-400">
                bp
              </div>
              <div className="flex-1 grid grid-flow-col auto-cols-fr gap-1 pl-1.5 pr-0.5">
                {normalizedLanes.map((lane, idx) => {
                  const wellId = getShortWellId(lane, idx);
                  const isKo = wellId === "KO" || lane.highlight;
                  return (
                    <div
                      key={`top-${idx}`}
                      className={`text-center font-mono-bio text-xs font-bold ${
                        isKo ? "text-sky-300" : "text-zinc-200"
                      }`}
                    >
                      {wellId}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Electrophoresis Field */}
            <div
              className="relative flex items-stretch min-w-[295px]"
              style={{ height: 316 }}
            >
              {/* Left 12px Reference Scale */}
              <div className="relative w-11 shrink-0 border-r border-white/10 pr-1.5">
                {REFERENCE_LADDER.map((bp) => {
                  const topPct = bpToPercentY(bp, minBp, maxBp);
                  return (
                    <div
                      key={bp}
                      style={{ top: `${topPct}%` }}
                      className="absolute right-1.5 -translate-y-1/2 flex items-center gap-1"
                    >
                      <span className="font-mono-bio text-xs font-medium text-zinc-300">
                        {bp >= 1000 ? `${bp / 1000}k` : bp}
                      </span>
                      <span className="h-[1px] w-1.5 bg-zinc-500" />
                    </div>
                  );
                })}
              </div>

              {/* Lane Columns + Crosshair */}
              <div className="relative flex-1 grid grid-flow-col auto-cols-fr gap-1.5 pl-2 pr-1">
                {[5000, 2000, 1000, 500, 250].map((bp) => (
                  <div
                    key={bp}
                    style={{ top: `${bpToPercentY(bp, minBp, maxBp)}%` }}
                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/[0.07]"
                  />
                ))}

                {crosshairBands.map((bp, cIdx) => {
                  const topPct = bpToPercentY(bp, minBp, maxBp);
                  const isKoActive = Boolean(
                    activeLane?.highlight ||
                      (activeLane &&
                        activeIdx !== null &&
                        getShortWellId(activeLane, activeIdx) === "KO")
                  );
                  return (
                    <div
                      key={`xhair-${bp}-${cIdx}`}
                      style={{ top: `${topPct}%` }}
                      className={`pointer-events-none absolute inset-x-0 z-10 border-t border-dotted ${
                        isKoActive
                          ? "border-sky-400/90"
                          : "border-amber-400/90"
                      }`}
                    >
                      <span
                        className={`absolute -left-14 -top-2.5 rounded px-1.5 py-0.5 font-mono-bio text-xs font-bold shadow-sm ${
                          isKoActive
                            ? "bg-sky-400 text-zinc-950"
                            : "bg-amber-400 text-zinc-950"
                        }`}
                      >
                        {bp}
                      </span>
                    </div>
                  );
                })}

                {normalizedLanes.map((lane, idx) => {
                  const wellId = getShortWellId(lane, idx);
                  const marker = wellId === "M";
                  const isKo = wellId === "KO" || lane.highlight;
                  const isActive = activeIdx === idx;

                  return (
                    <div
                      key={`${lane.lane_name}-${idx}`}
                      onMouseEnter={() => setHoveredLaneIdx(idx)}
                      onMouseLeave={() => setHoveredLaneIdx(null)}
                      onClick={() =>
                        setPinnedLaneIdx((prev) => (prev === idx ? null : idx))
                      }
                      className={`relative flex flex-col items-center rounded-md transition cursor-pointer ${
                        isActive
                          ? "bg-white/[0.08] ring-1 ring-sky-400/70"
                          : isKo
                            ? "bg-sky-500/[0.07]"
                            : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <div
                        className={`mt-1 h-2.5 w-[74%] max-w-[48px] rounded-[2px] border ${
                          isKo
                            ? "border-sky-400/70 bg-black"
                            : "border-zinc-600 bg-black"
                        }`}
                        title={`加样孔 ${lane.label}`}
                      />

                      <div className="relative flex-1 w-full">
                        {lane.bands_bp.length === 0 ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="font-mono-bio text-xs text-zinc-500 -rotate-90 whitespace-nowrap">
                              无条带
                            </span>
                          </div>
                        ) : (
                          lane.bands_bp.map((bp, bIdx) => {
                            const topPct = bpToPercentY(bp, minBp, maxBp);
                            const isBrightMarker =
                              marker &&
                              (bp === 2000 || bp === 1000 || bp === 750);
                            return (
                              <div
                                key={`${bp}-${bIdx}`}
                                style={{ top: `${topPct}%` }}
                                className="absolute inset-x-0 -translate-y-1/2 flex flex-col items-center"
                              >
                                <div
                                  className={`w-[78%] max-w-[52px] rounded-[2px] transition-transform ${
                                    marker
                                      ? isBrightMarker
                                        ? "h-[5px] bg-zinc-100 gel-band-marker"
                                        : "h-[3.5px] bg-zinc-300/90 gel-band-marker"
                                      : isKo
                                        ? "h-[6px] bg-sky-300 gel-band-ko"
                                        : "h-[5px] bg-amber-300 gel-band-glow"
                                  } ${isActive ? "scale-x-105" : ""}`}
                                />
                                {!marker && (
                                  <span
                                    className={`mt-1.5 rounded px-1.5 py-[1px] font-mono-bio text-xs font-bold leading-none ${
                                      isKo
                                        ? "bg-sky-950/95 text-sky-300"
                                        : "bg-zinc-950/90 text-amber-200"
                                    }`}
                                  >
                                    {bp}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Clean Centered 2-Line Semantic Labels */}
            <div className="mt-3 flex items-start min-w-[295px]">
              <div className="w-11 shrink-0" />
              <div className="flex-1 grid grid-flow-col auto-cols-fr gap-1 pl-1.5 pr-0.5">
                {normalizedLanes.map((lane, idx) => {
                  const wellId = getShortWellId(lane, idx);
                  const [line1, line2] = getTwoLineLabel(lane, wellId);
                  const isKo = wellId === "KO" || lane.highlight;
                  return (
                    <div
                      key={`lbl-${idx}`}
                      onMouseEnter={() => setHoveredLaneIdx(idx)}
                      onMouseLeave={() => setHoveredLaneIdx(null)}
                      onClick={() =>
                        setPinnedLaneIdx((prev) => (prev === idx ? null : idx))
                      }
                      className="text-center leading-tight cursor-pointer"
                    >
                      <div
                        className={`text-xs font-bold ${
                          isKo ? "text-sky-300" : "text-zinc-100"
                        }`}
                      >
                        {line1}
                      </div>
                      {line2 && (
                        <div className="text-xs text-zinc-400">{line2}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Interactive Lane Inspector */}
        <div className="mt-3.5 min-h-[68px] rounded-lg border border-white/10 bg-[#111319] px-4 py-3 text-xs">
          {activeLane ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">
                  泳道 {activeLane.lane_name} · {activeLane.label}
                </span>
                <span className="font-mono-bio text-xs font-bold text-sky-300">
                  {activeLane.bands_bp.length > 0
                    ? `${activeLane.bands_bp.join(" / ")} bp`
                    : "预期无扩增条带"}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {activeLane.expected_note}
              </p>
            </div>
          ) : (
            <div className="space-y-1 text-xs text-zinc-300">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sky-300">
                  阳性敲除判读标准：
                </span>
                <span className="font-mono-bio text-zinc-400">
                  悬停或点击泳道对齐标尺
                </span>
              </div>
              <p className="leading-relaxed text-zinc-200">
                外侧引物 VF/VR 扩增出现{" "}
                <strong className="font-mono-bio text-sky-300">
                  {verificationPrimers.ko_amplicon_bp} bp
                </strong>{" "}
                单一亮带（比 WT{" "}
                <strong className="font-mono-bio text-amber-300">
                  {verificationPrimers.wt_amplicon_bp} bp
                </strong>{" "}
                缩短 {verificationPrimers.band_diff_bp} bp），且 WT 内引物无带即为纯合敲除阳性。
              </p>
            </div>
          )}
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
